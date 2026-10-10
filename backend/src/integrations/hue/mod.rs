//! Philips Hue integration — local. Domus talks to the Hue bridge on the LAN;
//! the app key is handed out once, after the button on the bridge is pressed.

use home_core::{
    hex_to_rgb, hsv_to_rgb, integration_err, rgb_to_hex, rgb_to_hsv, AccountContext, CoreError, DeviceCommand,
    DeviceContext, DeviceState, DeviceType, DiscoveredDevice, IntegrationPlugin, IntegrationType, PolledState,
    Result,
};
use reqwest::Method;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::time::Duration;

/// Colour temperature range of Hue lights, in mireds (cold..warm).
const MIREDS: (f64, f64) = (153.0, 500.0);

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct HueBridge {
    // shortcut: the address is stored as linked, link the bridge again if its IP changes. Give it a DHCP reservation.
    pub host: String,
    pub key: String,
}

fn bridge_of(account: &AccountContext) -> Result<HueBridge> {
    serde_json::from_value(account.credentials.clone())
        .map_err(|e| CoreError::Internal(format!("bad Hue bridge settings: {e}")))
}

pub struct HueIntegration {
    http: reqwest::Client,
}

impl Default for HueIntegration {
    fn default() -> Self {
        Self::new()
    }
}

impl HueIntegration {
    pub fn new() -> Self {
        Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                // The bridge signs its own certificate; the traffic is still encrypted.
                .danger_accept_invalid_certs(true)
                .build()
                .expect("http client"),
        }
    }

    async fn call(&self, method: Method, host: &str, path: &str, body: Option<Value>) -> Result<Value> {
        let mut req = self.http.request(method, format!("https://{host}/api{path}"));
        if let Some(b) = body {
            req = req.json(&b);
        }
        let unreachable = |e: reqwest::Error| integration_err(format!("Hue bridge unreachable: {e}"));
        let v: Value = req.send().await.map_err(unreachable)?.json().await.map_err(unreachable)?;
        // Failures come back as `[{"error": {"type": 1, "description": "..."}}]`.
        match v.get(0).and_then(|first| first.get("error")) {
            None => Ok(v),
            Some(e) => Err(match e["type"].as_i64() {
                Some(1) => CoreError::AuthError("the Hue bridge no longer accepts this link; link it again".into()),
                Some(101) => CoreError::ValidationError("Press the round button on the Hue bridge, then link again within 30 seconds".into()),
                _ => integration_err(e["description"].as_str().unwrap_or("Hue bridge error")),
            }),
        }
    }

    /// Ask the bridge for an app key (its button must have just been pressed). Returns the bridge and its name.
    pub async fn pair(&self, host: &str) -> Result<(HueBridge, String)> {
        let host = match host {
            "" => self.find_bridge().await?,
            h => h.to_string(),
        };
        let reply = self.call(Method::POST, &host, "", Some(json!({ "devicetype": "domus#server" }))).await?;
        let key = reply
            .pointer("/0/success/username")
            .and_then(Value::as_str)
            .ok_or_else(|| integration_err("Hue bridge gave no app key"))?
            .to_string();
        let config = self.call(Method::GET, &host, &format!("/{key}/config"), None).await?;
        let name = config["name"].as_str().unwrap_or("Hue bridge").to_string();
        Ok((HueBridge { host, key }, name))
    }

    /// The first bridge Philips' discovery service knows on this network.
    async fn find_bridge(&self) -> Result<String> {
        let not_found = || CoreError::ValidationError("No Hue bridge found; enter its IP address".into());
        let list: Value = self
            .http
            .get("https://discovery.meethue.com")
            .send()
            .await
            .map_err(|_| not_found())?
            .json()
            .await
            .map_err(|_| not_found())?;
        list.pointer("/0/internalipaddress").and_then(Value::as_str).map(str::to_string).ok_or_else(not_found)
    }

    /// Every light on a bridge, keyed by its number there.
    async fn lights(&self, bridge: &HueBridge) -> Result<Map<String, Value>> {
        match self.call(Method::GET, &bridge.host, &format!("/{}/lights", bridge.key), None).await? {
            Value::Object(m) => Ok(m),
            _ => Err(integration_err("unexpected answer from the Hue bridge")),
        }
    }
}

fn state_from(light: &Value) -> DeviceState {
    let st = &light["state"];
    let n = |k: &str| st.get(k).and_then(Value::as_f64);
    let color_mode = match st["colormode"].as_str() {
        Some("ct") => Some("white".to_string()),
        Some("hs" | "xy") => Some("color".to_string()),
        _ => None,
    };
    DeviceState {
        is_on: st["on"].as_bool(),
        brightness: n("bri").map(|b| (b / 254.0 * 100.0).round().clamp(1.0, 100.0) as u8),
        color_temp: n("ct").map(|ct| ((MIREDS.1 - ct) / (MIREDS.1 - MIREDS.0) * 100.0).round().clamp(0.0, 100.0) as u8),
        color: match (n("hue"), n("sat")) {
            (Some(h), Some(s)) => {
                let (r, g, b) = hsv_to_rgb(h / 65535.0 * 360.0, s / 254.0, 1.0);
                Some(rgb_to_hex(r, g, b))
            }
            _ => None,
        },
        color_mode,
        ..Default::default()
    }
}

fn polled(light: &Value) -> PolledState {
    PolledState {
        online: light.pointer("/state/reachable").and_then(Value::as_bool).unwrap_or(true),
        state: state_from(light),
        ip_address: None,
    }
}

/// The body for `PUT lights/<id>/state`.
fn body_for(cmd: &DeviceCommand) -> Map<String, Value> {
    let mut body = Map::new();
    if let Some(b) = cmd.brightness {
        body.insert("bri".into(), json!((b.clamp(1, 100) as f64 / 100.0 * 254.0).round() as u32));
    }
    if let Some((r, g, b)) = cmd.color.as_deref().and_then(hex_to_rgb) {
        let (h, s, _) = rgb_to_hsv(r, g, b);
        body.insert("hue".into(), json!((h / 360.0 * 65535.0).round() as u32));
        body.insert("sat".into(), json!((s * 254.0).round() as u32));
    } else if cmd.color_temp.is_some() || cmd.color_mode.as_deref() == Some("white") {
        let pct = cmd.color_temp.unwrap_or(50).min(100) as f64;
        body.insert("ct".into(), json!((MIREDS.1 - pct / 100.0 * (MIREDS.1 - MIREDS.0)).round() as u32));
    }
    match cmd.is_on {
        // The bridge refuses any other change on a light that is being switched off.
        Some(false) => body = Map::from_iter([("on".to_string(), json!(false))]),
        // ...and on one that is off, so a new brightness or colour switches it on.
        _ if cmd.is_on == Some(true) || !body.is_empty() => drop(body.insert("on".into(), json!(true))),
        _ => {}
    }
    body
}

fn light_id(device: &DeviceContext) -> Result<&str> {
    device.config["id"].as_str().ok_or_else(|| integration_err("device has no Hue light id"))
}

fn bridge_for(device: &DeviceContext) -> Result<HueBridge> {
    bridge_of(device.account.as_ref().ok_or_else(|| CoreError::AuthError("Hue bridge was removed".into()))?)
}

#[async_trait::async_trait]
impl IntegrationPlugin for HueIntegration {
    fn integration_type(&self) -> IntegrationType {
        IntegrationType::Hue
    }

    async fn discover(&self, accounts: &[AccountContext]) -> Result<Vec<DiscoveredDevice>> {
        let mut out = Vec::new();
        for account in accounts {
            let bridge = bridge_of(account)?;
            for (id, light) in self.lights(&bridge).await? {
                let text = |k: &str| light[k].as_str().map(str::to_string);
                let kind = text("type").unwrap_or_default().to_lowercase();
                out.push(DiscoveredDevice {
                    external_id: text("uniqueid").unwrap_or_else(|| format!("{}/{id}", account.id)),
                    name: text("name").unwrap_or_else(|| "Hue light".into()),
                    device_type: if kind.contains("plug") { DeviceType::Plug } else { DeviceType::Light },
                    model: text("productname").or_else(|| text("modelid")),
                    ip_address: Some(bridge.host.clone()),
                    mac_address: None,
                    account_id: Some(account.id.clone()),
                    online: polled(&light).online,
                    config: json!({ "id": id }),
                    secrets: json!({}),
                    note: None,
                    state: Some(state_from(&light)),
                });
            }
        }
        Ok(out)
    }

    /// One request per bridge answers for all of its lights.
    async fn fetch_states(&self, devices: &[DeviceContext]) -> HashMap<String, Result<PolledState>> {
        let mut bridges: HashMap<String, std::result::Result<Map<String, Value>, String>> = HashMap::new();
        let mut out = HashMap::new();
        for d in devices {
            let res = async {
                let bridge = bridge_for(d)?;
                if !bridges.contains_key(&bridge.host) {
                    bridges.insert(bridge.host.clone(), self.lights(&bridge).await.map_err(|e| e.to_string()));
                }
                let lights = bridges[&bridge.host].as_ref().map_err(integration_err)?;
                lights.get(light_id(d)?).map(polled).ok_or_else(|| integration_err("light was removed from the Hue bridge"))
            }
            .await;
            out.insert(d.device_id.clone(), res);
        }
        out
    }

    async fn fetch_state(&self, device: &DeviceContext) -> Result<PolledState> {
        let bridge = bridge_for(device)?;
        let light = self.call(Method::GET, &bridge.host, &format!("/{}/lights/{}", bridge.key, light_id(device)?), None).await?;
        Ok(polled(&light))
    }

    async fn send_command(&self, device: &DeviceContext, command: &DeviceCommand) -> Result<()> {
        let bridge = bridge_for(device)?;
        let body = body_for(command);
        if body.is_empty() {
            return Err(CoreError::Unsupported("this device does not support that command".into()));
        }
        let path = format!("/{}/lights/{}/state", bridge.key, light_id(device)?);
        self.call(Method::PUT, &bridge.host, &path, Some(Value::Object(body))).await?;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn maps_bridge_state_and_commands() {
        let light = json!({"state": {"on": true, "bri": 127, "hue": 0, "sat": 254, "ct": 500, "colormode": "hs", "reachable": false}});
        let s = state_from(&light);
        assert_eq!((s.is_on, s.brightness, s.color_temp), (Some(true), Some(50), Some(0)));
        assert_eq!((s.color.as_deref(), s.color_mode.as_deref()), (Some("#ff0000"), Some("color")));
        assert!(!polled(&light).online);
        // A plug only has `on`.
        assert_eq!(state_from(&json!({"state": {"on": false}})), DeviceState { is_on: Some(false), ..Default::default() });

        let cmd = |c: DeviceCommand| Value::Object(body_for(&c));
        assert_eq!(cmd(DeviceCommand { brightness: Some(100), color_temp: Some(100), ..Default::default() }), json!({"on": true, "bri": 254, "ct": 153}));
        assert_eq!(cmd(DeviceCommand { color: Some("#00ff00".into()), ..Default::default() }), json!({"on": true, "hue": 21845, "sat": 254}));
        assert_eq!(cmd(DeviceCommand { is_on: Some(false), brightness: Some(40), ..Default::default() }), json!({"on": false}));
        assert!(body_for(&DeviceCommand { mode: Some("x".into()), ..Default::default() }).is_empty());
    }
}
