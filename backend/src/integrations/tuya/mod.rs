//! Tuya / Smart Life integration (cloud, linked by scanning a QR code in the
//! Smart Life app — no Tuya developer account needed).

pub mod api;
mod mapping;

use api::{TuyaCredentials, TuyaSession};
use home_core::{
    integration_err, AccountContext, CoreError, CredentialStore, DeviceCommand, DeviceContext,
    DiscoveredDevice, IntegrationPlugin, IntegrationType, PolledState, Result,
};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct TuyaIntegration {
    http: reqwest::Client,
    sessions: Mutex<HashMap<String, Arc<TuyaSession>>>,
    store: Arc<dyn CredentialStore>,
}

impl TuyaIntegration {
    pub fn new(store: Arc<dyn CredentialStore>) -> Self {
        Self {
            http: api::http_client(),
            sessions: Mutex::new(HashMap::new()),
            store,
        }
    }

    pub fn http(&self) -> &reqwest::Client {
        &self.http
    }

    async fn session(&self, account: &AccountContext) -> Result<Arc<TuyaSession>> {
        let creds: TuyaCredentials = serde_json::from_value(account.credentials.clone())
            .map_err(|e| CoreError::Internal(format!("bad Tuya credentials: {e}")))?;
        let mut sessions = self.sessions.lock().await;
        if let Some(s) = sessions.get(&account.id) {
            // Re-linking the account replaces the stored tokens.
            if s.credentials().await.uid == creds.uid {
                return Ok(s.clone());
            }
        }
        let s = Arc::new(TuyaSession::new(self.http.clone(), creds));
        sessions.insert(account.id.clone(), s.clone());
        Ok(s)
    }

    /// Refresh tokens if needed and persist them.
    async fn ready(&self, account: &AccountContext) -> Result<Arc<TuyaSession>> {
        let s = self.session(account).await?;
        if s.refresh_if_needed().await? {
            let creds = serde_json::to_value(s.credentials().await).unwrap_or_default();
            self.store.save_credentials(&account.id, &creds).await?;
        }
        Ok(s)
    }

    async fn home_devices(&self, session: &TuyaSession) -> Result<Vec<Value>> {
        let homes = session.get("/v1.0/m/life/users/homes", None).await?;
        let mut out = Vec::new();
        for home in homes.as_array().into_iter().flatten() {
            let Some(home_id) = home.get("ownerId").map(value_to_string) else {
                continue;
            };
            let mut params = Map::new();
            params.insert("homeId".into(), Value::String(home_id));
            let devices = session.get("/v1.0/m/life/ha/home/devices", Some(params)).await?;
            out.extend(devices.as_array().cloned().unwrap_or_default());
        }
        Ok(out)
    }
}

fn value_to_string(v: &Value) -> String {
    match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    }
}

#[async_trait::async_trait]
impl IntegrationPlugin for TuyaIntegration {
    fn integration_type(&self) -> IntegrationType {
        IntegrationType::Tuya
    }

    async fn discover(&self, accounts: &[AccountContext]) -> Result<Vec<DiscoveredDevice>> {
        let mut found = Vec::new();
        for account in accounts {
            let session = self.ready(account).await?;
            for dev in self.home_devices(&session).await? {
                let Some(id) = dev.get("id").and_then(Value::as_str) else { continue };
                let specs = session
                    .get(&format!("/v1.1/m/life/{id}/specifications"), None)
                    .await
                    .unwrap_or(Value::Null);
                let config = mapping::build_config(&dev, &specs);
                let state = mapping::state_from_status(&config, &mapping::status_map(&dev));
                found.push(DiscoveredDevice {
                    external_id: id.to_string(),
                    name: dev.get("name").and_then(Value::as_str).unwrap_or("Tuya device").to_string(),
                    device_type: mapping::device_type(
                        config.get("category").and_then(Value::as_str).unwrap_or_default(),
                    ),
                    model: dev
                        .get("product_name")
                        .and_then(Value::as_str)
                        .map(str::to_string),
                    ip_address: None,
                    mac_address: None,
                    account_id: Some(account.id.clone()),
                    online: dev.get("online").and_then(Value::as_bool).unwrap_or(false),
                    secrets: json!({ "local_key": dev.get("local_key").cloned().unwrap_or(Value::Null) }),
                    config,
                    note: None,
                    state: Some(state),
                });
            }
        }
        Ok(found)
    }

    async fn fetch_states(&self, devices: &[DeviceContext]) -> HashMap<String, Result<PolledState>> {
        let mut out = HashMap::new();
        let mut by_account: HashMap<String, (AccountContext, Vec<&DeviceContext>)> = HashMap::new();
        for d in devices {
            match &d.account {
                Some(a) => by_account
                    .entry(a.id.clone())
                    .or_insert_with(|| (a.clone(), Vec::new()))
                    .1
                    .push(d),
                None => {
                    out.insert(d.device_id.clone(), Err(integration_err("Tuya account was removed")));
                }
            }
        }

        for (_, (account, devs)) in by_account {
            let listing = match self.ready(&account).await {
                Ok(s) => self.home_devices(&s).await,
                Err(e) => Err(e),
            };
            match listing {
                Ok(list) => {
                    let by_id: HashMap<&str, &Value> = list
                        .iter()
                        .filter_map(|d| Some((d.get("id")?.as_str()?, d)))
                        .collect();
                    for d in devs {
                        let res = match by_id.get(d.external_id.as_str()) {
                            Some(dev) => Ok(PolledState {
                                online: dev.get("online").and_then(Value::as_bool).unwrap_or(false),
                                state: mapping::state_from_status(&d.config, &mapping::status_map(dev)),
                                ip_address: None,
                            }),
                            None => Err(CoreError::NotFound("device no longer in Smart Life".into())),
                        };
                        out.insert(d.device_id.clone(), res);
                    }
                }
                Err(e) => {
                    let msg = e.to_string();
                    for d in devs {
                        out.insert(d.device_id.clone(), Err(integration_err(&msg)));
                    }
                }
            }
        }
        out
    }

    async fn fetch_state(&self, device: &DeviceContext) -> Result<PolledState> {
        self.fetch_states(std::slice::from_ref(device))
            .await
            .remove(&device.device_id)
            .unwrap_or_else(|| Err(integration_err("no result")))
    }

    async fn send_command(&self, device: &DeviceContext, command: &DeviceCommand) -> Result<()> {
        let account = device
            .account
            .as_ref()
            .ok_or_else(|| integration_err("Tuya account was removed"))?;
        let commands = mapping::commands_for(&device.config, command);
        if commands.is_empty() {
            return Err(CoreError::Unsupported("this device does not support that command".into()));
        }
        let session = self.ready(account).await?;
        let mut body = Map::new();
        body.insert("commands".into(), Value::Array(commands));
        session
            .post(&format!("/v1.1/m/thing/{}/commands", device.external_id), body)
            .await?;
        Ok(())
    }
}
