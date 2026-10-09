//! TP-Link Tapo integration — fully local. Devices are found by UDP broadcast
//! on port 20002 and controlled over KLAP with the owner's TP-Link account.

pub mod klap;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use home_core::{
    integration_err, AccountContext, CoreError, DeviceCommand, DeviceContext, DeviceState,
    DeviceType, DiscoveredDevice, IntegrationPlugin, IntegrationType, PolledState, Result,
};
use klap::{KlapClient, TapoCredentials};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::time::Duration;
use tokio::net::UdpSocket;

const DISCOVERY_PORT: u16 = 20002;
/// Static "smart device" discovery query (v2 header, no payload).
const DISCOVERY_QUERY: [u8; 16] = [
    0x02, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x46, 0x3c, 0xb5, 0xd3,
];

pub struct TapoIntegration {
    klap: KlapClient,
    broadcast: Vec<String>,
}

#[derive(Debug, Clone)]
struct Beacon {
    ip: String,
    device_id: String,
    device_type: String,
    model: String,
    mac: Option<String>,
    encrypt_type: String,
}

impl TapoIntegration {
    pub fn new(broadcast: Vec<String>) -> Self {
        Self {
            klap: KlapClient::new(),
            broadcast,
        }
    }

    async fn scan(&self) -> Result<Vec<Beacon>> {
        let sock = UdpSocket::bind("0.0.0.0:0").await.map_err(integration_err)?;
        sock.set_broadcast(true).map_err(integration_err)?;
        for addr in &self.broadcast {
            // Send twice; UDP broadcast is lossy.
            for _ in 0..2 {
                let _ = sock.send_to(&DISCOVERY_QUERY, (addr.as_str(), DISCOVERY_PORT)).await;
            }
        }

        let mut found: HashMap<String, Beacon> = HashMap::new();
        let mut buf = vec![0u8; 4096];
        let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
        while let Ok(Ok((n, from))) = tokio::time::timeout_at(deadline, sock.recv_from(&mut buf)).await {
            if n <= 16 {
                continue;
            }
            let Ok(v) = serde_json::from_slice::<Value>(&buf[16..n]) else { continue };
            let r = v.get("result").unwrap_or(&Value::Null);
            let s = |k: &str| r.get(k).and_then(Value::as_str).map(str::to_string);
            let Some(device_id) = s("device_id") else { continue };
            found.insert(
                device_id.clone(),
                Beacon {
                    ip: s("ip").unwrap_or_else(|| from.ip().to_string()),
                    device_id,
                    device_type: s("device_type").unwrap_or_default(),
                    model: s("device_model").unwrap_or_default(),
                    mac: s("mac"),
                    encrypt_type: r
                        .pointer("/mgt_encrypt_schm/encrypt_type")
                        .and_then(Value::as_str)
                        .unwrap_or("KLAP")
                        .to_string(),
                },
            );
        }
        Ok(found.into_values().collect())
    }

    async fn device_info(&self, host: &str, creds: &TapoCredentials) -> Result<Value> {
        self.klap.request(host, creds, "get_device_info", None).await
    }

    /// Query info with the first account that the device accepts.
    async fn identify(&self, host: &str, accounts: &[AccountContext]) -> Result<(AccountContext, Value)> {
        let mut last = CoreError::AuthError("add your TP-Link account to control Tapo devices".into());
        for a in accounts {
            let creds = creds_of(a)?;
            match self.device_info(host, &creds).await {
                Ok(info) => return Ok((a.clone(), info)),
                Err(e) => last = e,
            }
        }
        Err(last)
    }

    async fn energy(&self, host: &str, creds: &TapoCredentials) -> Option<Value> {
        self.klap.request(host, creds, "get_energy_usage", None).await.ok()
    }

    fn to_discovered(&self, account: &AccountContext, info: &Value, energy: Option<&Value>) -> DiscoveredDevice {
        let s = |k: &str| info.get(k).and_then(Value::as_str).map(str::to_string);
        let model = s("model");
        let dtype = device_type(&s("type").unwrap_or_default());
        DiscoveredDevice {
            external_id: s("device_id").unwrap_or_default(),
            name: decode_nickname(info).unwrap_or_else(|| model.clone().unwrap_or_else(|| "Tapo device".into())),
            device_type: dtype,
            model,
            ip_address: s("ip"),
            mac_address: s("mac").map(|m| m.replace('-', ":")),
            account_id: Some(account.id.clone()),
            online: true,
            config: json!({ "has_energy": energy.is_some(), "type": info.get("type") }),
            secrets: json!({}),
            note: None,
            state: Some(state_from(info, energy)),
        }
    }
}

fn creds_of(account: &AccountContext) -> Result<TapoCredentials> {
    serde_json::from_value(account.credentials.clone())
        .map_err(|e| CoreError::Internal(format!("bad Tapo credentials: {e}")))
}

fn device_type(t: &str) -> DeviceType {
    match t {
        "SMART.TAPOPLUG" | "SMART.KASAPLUG" => DeviceType::Plug,
        "SMART.TAPOBULB" | "SMART.KASABULB" => DeviceType::Light,
        "SMART.TAPOSWITCH" | "SMART.KASASWITCH" => DeviceType::Switch,
        _ => DeviceType::Other,
    }
}

fn decode_nickname(info: &Value) -> Option<String> {
    let raw = info.get("nickname")?.as_str()?;
    let bytes = B64.decode(raw).ok()?;
    String::from_utf8(bytes).ok().filter(|s| !s.is_empty())
}

fn state_from(info: &Value, energy: Option<&Value>) -> DeviceState {
    let mut s = DeviceState {
        is_on: info.get("device_on").and_then(Value::as_bool),
        brightness: info.get("brightness").and_then(Value::as_u64).map(|b| b.min(100) as u8),
        color_temp: info
            .get("color_temp")
            .and_then(Value::as_u64)
            .filter(|k| *k > 0)
            .map(|k| (((k as f64 - 2500.0) / 40.0).clamp(0.0, 100.0)) as u8),
        ..Default::default()
    };
    if let Some(e) = energy {
        // get_energy_usage reports milliwatts and watt-hours.
        s.current_power_watts = e.get("current_power").and_then(Value::as_f64).map(|mw| (mw / 1000.0) as f32);
        s.today_energy_kwh = e.get("today_energy").and_then(Value::as_f64).map(|wh| (wh / 1000.0) as f32);
    }
    if let Some(rssi) = info.get("rssi") {
        s.extra.insert("rssi".into(), rssi.clone());
    }
    s
}

#[async_trait::async_trait]
impl IntegrationPlugin for TapoIntegration {
    fn integration_type(&self) -> IntegrationType {
        IntegrationType::Tapo
    }

    async fn discover(&self, accounts: &[AccountContext]) -> Result<Vec<DiscoveredDevice>> {
        let mut out = Vec::new();
        for b in self.scan().await? {
            if b.device_type.contains("CAMERA") || b.device_type.contains("HUB") {
                continue;
            }
            let fallback = DiscoveredDevice {
                external_id: b.device_id.clone(),
                name: format!("Tapo {}", b.model),
                device_type: device_type(&b.device_type),
                model: Some(b.model.clone()),
                ip_address: Some(b.ip.clone()),
                mac_address: b.mac.clone().map(|m| m.replace('-', ":")),
                account_id: None,
                online: true,
                config: json!({ "type": b.device_type }),
                secrets: json!({}),
                note: None,
                state: None,
            };
            if b.encrypt_type != "KLAP" {
                out.push(DiscoveredDevice {
                    note: Some(format!(
                        "Uses the older {} protocol; update the device firmware in the Tapo app",
                        b.encrypt_type
                    )),
                    ..fallback
                });
                continue;
            }
            match self.identify(&b.ip, accounts).await {
                Ok((account, info)) => {
                    let creds = creds_of(&account)?;
                    let energy = self.energy(&b.ip, &creds).await;
                    let mut d = self.to_discovered(&account, &info, energy.as_ref());
                    d.external_id = b.device_id.clone();
                    d.ip_address = Some(b.ip.clone());
                    out.push(d);
                }
                Err(e) => out.push(DiscoveredDevice {
                    note: Some(match e {
                        CoreError::AuthError(_) if accounts.is_empty() => {
                            "Add your TP-Link (Tapo) account in Plugins to control this device".into()
                        }
                        other => other.to_string(),
                    }),
                    ..fallback
                }),
            }
        }
        Ok(out)
    }

    async fn probe(&self, host: &str, _secrets: &Value, accounts: &[AccountContext]) -> Result<DiscoveredDevice> {
        let (account, info) = self.identify(host, accounts).await?;
        let energy = self.energy(host, &creds_of(&account)?).await;
        let mut d = self.to_discovered(&account, &info, energy.as_ref());
        d.ip_address = Some(host.to_string());
        Ok(d)
    }

    async fn fetch_state(&self, device: &DeviceContext) -> Result<PolledState> {
        let host = device
            .ip_address
            .as_deref()
            .ok_or_else(|| integration_err("device has no IP address"))?;
        let account = device
            .account
            .as_ref()
            .ok_or_else(|| CoreError::AuthError("TP-Link account was removed".into()))?;
        let creds = creds_of(account)?;
        let info = self.device_info(host, &creds).await?;
        let has_energy = device.config.get("has_energy").and_then(Value::as_bool).unwrap_or(false);
        let energy = if has_energy { self.energy(host, &creds).await } else { None };
        Ok(PolledState {
            online: true,
            state: state_from(&info, energy.as_ref()),
            ip_address: None,
        })
    }

    async fn send_command(&self, device: &DeviceContext, command: &DeviceCommand) -> Result<()> {
        let host = device
            .ip_address
            .as_deref()
            .ok_or_else(|| integration_err("device has no IP address"))?;
        let account = device
            .account
            .as_ref()
            .ok_or_else(|| CoreError::AuthError("TP-Link account was removed".into()))?;
        let mut params = serde_json::Map::new();
        if let Some(on) = command.is_on {
            params.insert("device_on".into(), json!(on));
        }
        if let Some(b) = command.brightness {
            params.insert("brightness".into(), json!(b.clamp(1, 100)));
        }
        if let Some(t) = command.color_temp {
            params.insert("color_temp".into(), json!(2500 + t.min(100) as u32 * 40));
        }
        if let Some(Value::Object(raw)) = &command.raw {
            params.extend(raw.clone());
        }
        if params.is_empty() {
            return Err(CoreError::Unsupported("this device does not support that command".into()));
        }
        self.klap
            .request(host, &creds_of(account)?, "set_device_info", Some(Value::Object(params)))
            .await?;
        Ok(())
    }
}
