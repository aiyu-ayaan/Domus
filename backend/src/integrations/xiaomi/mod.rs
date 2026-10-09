//! Xiaomi Mi Home integration. Discovery uses the Mi cloud (for tokens) and a
//! LAN broadcast; control is local over miIO with MIoT property mapping.

pub mod cloud;
pub mod miio;
pub mod miot;

use cloud::XiaomiCredentials;
use home_core::{
    integration_err, AccountContext, CoreError, CredentialStore, DeviceCommand, DeviceContext,
    DeviceState, DeviceType, DiscoveredDevice, IntegrationPlugin, IntegrationType, PolledState, Result,
};
use miot::MiotMap;
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::Mutex;

pub struct XiaomiIntegration {
    store: Arc<dyn CredentialStore>,
    broadcast: Vec<String>,
    spec_cache: Mutex<HashMap<String, Option<MiotMap>>>,
}

impl XiaomiIntegration {
    pub fn new(store: Arc<dyn CredentialStore>, broadcast: Vec<String>) -> Self {
        Self {
            store,
            broadcast,
            spec_cache: Mutex::new(HashMap::new()),
        }
    }

    async fn spec(&self, model: &str) -> Option<MiotMap> {
        if let Some(m) = self.spec_cache.lock().await.get(model) {
            return m.clone();
        }
        let m = match miot::lookup(model).await {
            Ok(m) => m,
            Err(e) => {
                tracing::warn!("MIoT spec lookup for {model} failed: {e}");
                return None;
            }
        };
        self.spec_cache.lock().await.insert(model.to_string(), m.clone());
        m
    }

    /// Device list for one account, signing in again if the session expired.
    async fn cloud_devices(&self, account: &AccountContext) -> Result<Vec<cloud::CloudDevice>> {
        let creds: XiaomiCredentials = serde_json::from_value(account.credentials.clone())
            .map_err(|e| CoreError::Internal(format!("bad Xiaomi credentials: {e}")))?;
        match cloud::device_list(&creds).await {
            Err(CoreError::AuthError(_)) => {
                let fresh = match cloud::login(&creds.username, &creds.password, &creds.region, Some(&creds.device_id)).await? {
                    cloud::Login::Done(c) => c,
                    cloud::Login::NeedsCode(_) => {
                        return Err(CoreError::AuthError(
                            "Xiaomi wants a verification code; link the account again under Integrations".into(),
                        ))
                    }
                };
                self.store
                    .save_credentials(&account.id, &serde_json::to_value(&fresh).unwrap_or_default())
                    .await?;
                cloud::device_list(&fresh).await
            }
            other => other,
        }
    }

    #[allow(clippy::too_many_arguments)]
    async fn build(
        &self,
        did: &str,
        name: &str,
        model: &str,
        ip: &str,
        mac: Option<String>,
        token: &str,
        account_id: Option<String>,
    ) -> DiscoveredDevice {
        let map = self.spec(model).await;
        let device_type = miot::device_type(map.as_ref().map(|m| m.service.as_str()).unwrap_or(""), model);
        DiscoveredDevice {
            external_id: did.to_string(),
            name: name.to_string(),
            device_type,
            model: Some(model.to_string()),
            ip_address: Some(ip.to_string()),
            mac_address: mac.filter(|m| !m.is_empty()),
            account_id,
            online: true,
            note: map
                .is_none()
                .then(|| "No MIoT spec found for this model; only online status is available".to_string()),
            config: json!({ "miot": map }),
            secrets: json!({ "token": token }),
            state: None,
        }
    }
}

fn token_of(secrets: &Value) -> Result<[u8; 16]> {
    let t = secrets
        .get("token")
        .and_then(Value::as_str)
        .ok_or_else(|| CoreError::ValidationError("device token is required".into()))?;
    miio::parse_token(t)
}

fn miot_map(config: &Value) -> Option<MiotMap> {
    serde_json::from_value(config.get("miot")?.clone()).ok()
}

#[async_trait::async_trait]
impl IntegrationPlugin for XiaomiIntegration {
    fn integration_type(&self) -> IntegrationType {
        IntegrationType::Xiaomi
    }

    async fn discover(&self, accounts: &[AccountContext]) -> Result<Vec<DiscoveredDevice>> {
        let mut out = Vec::new();
        let mut known: HashSet<String> = HashSet::new();
        let mut errors = Vec::new();

        for account in accounts {
            match self.cloud_devices(account).await {
                Ok(list) => {
                    for d in list {
                        // Skip BLE / Zigbee sub-devices: they have no LAN address or token.
                        if d.localip.is_empty() || d.token.len() != 32 || d.did.starts_with("blt.") {
                            continue;
                        }
                        known.insert(d.did.clone());
                        let mut dev = self
                            .build(&d.did, &d.name, &d.model, &d.localip, Some(d.mac.clone()), &d.token, Some(account.id.clone()))
                            .await;
                        dev.online = d.is_online;
                        out.push(dev);
                    }
                }
                Err(e) => errors.push(e),
            }
        }

        // LAN scan finds devices that are not (yet) in a linked Mi account.
        for (ip, id, token) in miio::scan(&self.broadcast).await.unwrap_or_default() {
            let did = id.to_string();
            if known.contains(&did) {
                continue;
            }
            match token {
                Some(token) => match self.probe(&ip, &json!({ "token": token }), &[]).await {
                    Ok(d) => out.push(d),
                    Err(e) => tracing::debug!("miIO probe of {ip} failed: {e}"),
                },
                None => out.push(DiscoveredDevice {
                    external_id: did,
                    name: format!("Xiaomi device ({ip})"),
                    device_type: DeviceType::Other,
                    model: None,
                    ip_address: Some(ip),
                    mac_address: None,
                    account_id: None,
                    online: true,
                    config: json!({}),
                    secrets: json!({}),
                    note: Some("Link your Xiaomi account, or enter the device token to add it".into()),
                    state: None,
                }),
            }
        }

        if out.is_empty() {
            if let Some(e) = errors.into_iter().next() {
                return Err(e);
            }
        }
        Ok(out)
    }

    async fn probe(&self, host: &str, secrets: &Value, _accounts: &[AccountContext]) -> Result<DiscoveredDevice> {
        let token = token_of(secrets)?;
        let hello = miio::hello(host).await?;
        let info = miio::call(host, &token, "miIO.info", json!([])).await?;
        let model = info.get("model").and_then(Value::as_str).unwrap_or("unknown").to_string();
        let mac = info.get("mac").and_then(Value::as_str).map(str::to_string);
        let token_hex = hex::encode(token);
        Ok(self
            .build(&hello.device_id.to_string(), &model, &model, host, mac, &token_hex, None)
            .await)
    }

    async fn fetch_state(&self, device: &DeviceContext) -> Result<PolledState> {
        let host = device
            .ip_address
            .as_deref()
            .ok_or_else(|| integration_err("device has no IP address"))?;
        let token = token_of(&device.secrets)?;
        let state = match miot_map(&device.config).filter(|m| !m.props.is_empty()) {
            Some(map) => {
                let (_, params) = miot::get_params(&device.external_id, &map);
                let result = miio::call(host, &token, "get_properties", params).await?;
                miot::state_from(&map, &result)
            }
            None => {
                miio::call(host, &token, "miIO.info", json!([])).await?;
                DeviceState::default()
            }
        };
        Ok(PolledState { online: true, state, ip_address: None })
    }

    async fn send_command(&self, device: &DeviceContext, command: &DeviceCommand) -> Result<()> {
        let host = device
            .ip_address
            .as_deref()
            .ok_or_else(|| integration_err("device has no IP address"))?;
        let token = token_of(&device.secrets)?;
        if let Some(raw) = &command.raw {
            let method = raw.get("method").and_then(Value::as_str).unwrap_or("set_properties");
            let params = raw.get("params").cloned().unwrap_or(json!([]));
            miio::call(host, &token, method, params).await?;
            return Ok(());
        }
        let map = miot_map(&device.config)
            .ok_or_else(|| CoreError::Unsupported("this Xiaomi model has no MIoT spec".into()))?;
        let params = miot::set_params(&device.external_id, &map, command);
        if params.is_empty() {
            return Err(CoreError::Unsupported("this device does not support that command".into()));
        }
        let result = miio::call(host, &token, "set_properties", Value::Array(params)).await?;
        if let Some(bad) = result
            .as_array()
            .into_iter()
            .flatten()
            .find(|r| r.get("code").and_then(Value::as_i64).unwrap_or(0) != 0)
        {
            return Err(integration_err(format!("device rejected the command: {bad}")));
        }
        Ok(())
    }
}
