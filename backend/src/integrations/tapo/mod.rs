//! TP-Link Tapo integration — fully local. Devices are found by UDP broadcast
//! on port 20002 and controlled over KLAP with the owner's TP-Link account.
//! A hub (H100) also brings the sensors, switches and thermostats paired with it.

pub mod klap;

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use home_core::{
    effects, hex_to_rgb, hsv_to_rgb, integration_err, rgb_to_hex, rgb_to_hsv, AccountContext, CoreError,
    DeviceCommand, DeviceContext, DeviceState, DeviceType, DiscoveredDevice, IntegrationPlugin,
    IntegrationType, PolledState, Result,
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
    /// Hosts known to be playing a lighting effect. A strip ignores colour changes while one
    /// runs, so it is switched off first; remembering spares that extra request otherwise.
    playing: std::sync::Mutex<std::collections::HashSet<String>>,
}

/// Effect ids a strip offers: it has no slot limit, so the shared effects and the strip ones.
fn strip_effects() -> Vec<String> {
    effects::strip_effects().map(|e| e.id.to_string()).collect()
}

/// An effect in the light strips' native form (`set_lighting_effect`, type `sequence`).
/// The strip stores and loops it by itself.
fn lighting_effect(e: &effects::Effect, enable: bool, brightness: u8) -> Value {
    json!({
        "custom": 1,
        "id": format!("DomusEffect{:0>21}", e.id),
        "name": e.name,
        "brightness": brightness.clamp(1, 100),
        "segments": [0],
        "expansion_strategy": 1,
        "enable": enable as u8,
        "type": "sequence",
        "duration": 0,
        "transition": e.step as u32 * 100,
        "direction": 4,
        "spread": 7,
        "repeat_times": 0,
        "sequence": e.colors.iter().map(|&(h, s, v)| json!([h, s, v])).collect::<Vec<_>>(),
    })
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
            playing: Default::default(),
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

    /// Everything paired with a hub. The hub answers ten at a time.
    async fn children(&self, host: &str, creds: &TapoCredentials) -> Result<Vec<Value>> {
        let mut out: Vec<Value> = Vec::new();
        loop {
            let page = self.klap.request(host, creds, "get_child_device_list", Some(json!({ "start_index": out.len() }))).await?;
            let list = page.get("child_device_list").and_then(Value::as_array).cloned().unwrap_or_default();
            let total = page.get("sum").and_then(Value::as_u64).unwrap_or(0) as usize;
            let done = list.is_empty();
            out.extend(list);
            if done || out.len() >= total {
                return Ok(out);
            }
        }
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

/// A device paired with a hub. It is reached through the hub, so it carries the hub's address.
fn child_device(account: &AccountContext, hub_ip: &str, c: &Value) -> DiscoveredDevice {
    let s = |k: &str| c.get(k).and_then(Value::as_str).map(str::to_string);
    let model = s("model");
    let polled = child_polled(c);
    DiscoveredDevice {
        external_id: s("device_id").unwrap_or_default(),
        name: decode_nickname(c).unwrap_or_else(|| model.clone().unwrap_or_else(|| "Tapo sensor".into())),
        device_type: match s("category") {
            Some(cat) if cat.contains("trv") => DeviceType::Climate,
            _ => device_type(&s("type").unwrap_or_default()),
        },
        model,
        ip_address: Some(hub_ip.to_string()),
        mac_address: s("mac").map(|m| m.replace('-', ":")),
        account_id: Some(account.id.clone()),
        online: polled.online,
        config: json!({ "child_id": c.get("device_id"), "type": c.get("type"), "category": c.get("category") }),
        secrets: json!({}),
        note: None,
        state: Some(polled.state),
    }
}

fn child_polled(c: &Value) -> PolledState {
    PolledState {
        online: c.get("status").and_then(Value::as_str) != Some("offline"),
        state: state_from(c, None),
        ip_address: None,
    }
}

fn child_id(device: &DeviceContext) -> Option<&str> {
    device.config.get("child_id").and_then(Value::as_str)
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
        "SMART.TAPOSENSOR" => DeviceType::Sensor,
        _ => DeviceType::Other,
    }
}

fn decode_nickname(info: &Value) -> Option<String> {
    let raw = info.get("nickname")?.as_str()?;
    let bytes = B64.decode(raw).ok()?;
    String::from_utf8(bytes).ok().filter(|s| !s.is_empty())
}

fn state_from(info: &Value, energy: Option<&Value>) -> DeviceState {
    let raw_color_temp = info.get("color_temp").and_then(Value::as_u64).unwrap_or(0);
    let hue = info.get("hue").and_then(Value::as_u64);
    let sat = info.get("saturation").and_then(Value::as_u64);
    let explicit_mode = info.get("color_mode").and_then(Value::as_str);

    let (color, color_mode) = if explicit_mode == Some("color")
        || (raw_color_temp == 0 && (hue.is_some() || sat.is_some()))
    {
        let h = hue.unwrap_or(0).min(360) as f64;
        let s_norm = (sat.unwrap_or(100).min(100) as f64) / 100.0;
        let (r, g, b) = hsv_to_rgb(h, s_norm, 1.0);
        (Some(rgb_to_hex(r, g, b)), Some("color".into()))
    } else if raw_color_temp > 0 || explicit_mode == Some("white") {
        (None, Some("white".into()))
    } else {
        (None, None)
    };

    let mut s = DeviceState {
        is_on: info.get("device_on").and_then(Value::as_bool),
        brightness: info.get("brightness").and_then(Value::as_u64).map(|b| b.min(100) as u8),
        color_temp: if raw_color_temp > 0 {
            Some((((raw_color_temp as f64 - 2500.0) / 40.0).clamp(0.0, 100.0)) as u8)
        } else {
            None
        },
        color,
        color_mode,
        ..Default::default()
    };
    if let Some(e) = energy {
        // get_energy_usage reports milliwatts and watt-hours.
        s.current_power_watts = e.get("current_power").and_then(Value::as_f64).map(|mw| (mw / 1000.0) as f32);
        s.today_energy_kwh = e.get("today_energy").and_then(Value::as_f64).map(|wh| (wh / 1000.0) as f32);
    }
    // Only light strips report a lighting effect; they are the ones that can play ours.
    if let Some(fx) = info.get("lighting_effect") {
        s.options.insert("effect".into(), strip_effects());
        if fx.get("enable").and_then(Value::as_u64) == Some(1) {
            let name = fx.get("name").and_then(Value::as_str);
            s.effect = effects::strip_effects().find(|e| Some(e.name) == name).map(|e| e.id.to_string());
            // While an effect plays, its own brightness is the light's brightness.
            if let Some(b) = fx.get("brightness").and_then(Value::as_u64) {
                s.brightness = Some(b.min(100) as u8);
            }
        }
    }
    // Hub sensors (T100, T110, T300, T31x), thermostats (KE100) and the hub's own siren.
    let fahrenheit = info.get("temp_unit").and_then(Value::as_str) == Some("fahrenheit");
    if let Some(t) = info.get("current_temp").and_then(Value::as_f64) {
        s.temperature = Some(if fahrenheit { (t - 32.0) / 1.8 } else { t } as f32);
    }
    s.humidity = info.get("current_humidity").and_then(Value::as_f64).map(|h| h as f32);
    for (from, to) in [("detected", "motion"), ("open", "contact"), ("at_low_battery", "battery_low"), ("in_alarm", "alarm"), ("battery_percentage", "battery"), ("target_temp", "target_temp")] {
        if let Some(v) = info.get(from) {
            s.extra.insert(to.into(), v.clone());
        }
    }
    if let Some(leak) = info.get("water_leak_status").and_then(Value::as_str) {
        s.extra.insert("water_leak".into(), json!(leak != "normal"));
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
            // Cameras only accept TLS with RSA key exchange, which rustls (our TLS library) does not offer.
            if b.device_type.contains("CAMERA") {
                out.push(DiscoveredDevice { note: Some("Tapo cameras are not supported yet".into()), ..fallback });
                continue;
            }
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
                    if b.device_type.contains("HUB") {
                        match self.children(&b.ip, &creds).await {
                            Ok(list) => out.extend(list.iter().map(|c| child_device(&account, &b.ip, c))),
                            Err(e) => tracing::warn!("Tapo hub {} did not list its devices: {e}", b.ip),
                        }
                    }
                }
                Err(e) => out.push(DiscoveredDevice {
                    note: Some(match e {
                        CoreError::AuthError(_) if accounts.is_empty() => {
                            "Add your TP-Link (Tapo) account under Integrations to control this device".into()
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

    /// One request per hub answers for everything paired with it.
    async fn fetch_states(&self, devices: &[DeviceContext]) -> HashMap<String, Result<PolledState>> {
        let mut hubs: HashMap<String, std::result::Result<Vec<Value>, String>> = HashMap::new();
        let mut out = HashMap::new();
        for d in devices {
            let res = match (child_id(d), d.ip_address.as_deref(), d.account.as_ref()) {
                (Some(id), Some(host), Some(account)) => {
                    if !hubs.contains_key(host) {
                        let list = match creds_of(account) {
                            Ok(creds) => self.children(host, &creds).await,
                            Err(e) => Err(e),
                        };
                        hubs.insert(host.to_string(), list.map_err(|e| e.to_string()));
                    }
                    match &hubs[host] {
                        Ok(list) => list
                            .iter()
                            .find(|c| c.get("device_id").and_then(Value::as_str) == Some(id))
                            .map(child_polled)
                            .ok_or_else(|| integration_err("no longer paired with the Tapo hub")),
                        Err(e) => Err(integration_err(e)),
                    }
                }
                _ => self.fetch_state(d).await,
            };
            out.insert(d.device_id.clone(), res);
        }
        out
    }

    async fn fetch_state(&self, device: &DeviceContext) -> Result<PolledState> {
        // The refresh after a command: ask the hub as a poll would. Without an address or
        // account it falls through to the errors below.
        if child_id(device).is_some() && device.ip_address.is_some() && device.account.is_some() {
            let mut polled = self.fetch_states(std::slice::from_ref(device)).await;
            return polled.remove(&device.device_id).unwrap_or_else(|| Err(integration_err("no poll result")));
        }
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
        {
            let on = info.pointer("/lighting_effect/enable").and_then(Value::as_u64) == Some(1);
            let mut playing = self.playing.lock().unwrap();
            if on { playing.insert(host.to_string()); } else { playing.remove(host); }
        }
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
        let creds = creds_of(account)?;
        // None: no effect in this command. Some(None): stop. Some(Some(_)): the native effect to play.
        let chosen = match command.effect.as_deref() {
            None => None,
            Some("") => Some(None),
            Some(id) => Some(Some(
                effects::strip_effects()
                    .find(|e| e.id == id)
                    .map(|e| lighting_effect(e, true, command.brightness.unwrap_or(100)))
                    .ok_or_else(|| CoreError::Unsupported("this light cannot play that effect".into()))?,
            )),
        };
        let recolour = command.color.is_some() || command.color_temp.is_some() || command.color_mode.is_some();
        let was_playing = self.playing.lock().unwrap().contains(host);
        // Stop the running effect when asked to, or when a plain colour is about to replace it.
        if matches!(chosen, Some(None)) || (chosen.is_none() && recolour && was_playing) {
            self.klap.request(host, &creds, "set_lighting_effect", Some(lighting_effect(&effects::EFFECTS[0], false, 100))).await?;
            self.playing.lock().unwrap().remove(host);
            if matches!(chosen, Some(None)) && command.is_on.is_none() && command.brightness.is_none() && !recolour {
                return Ok(());
            }
        }
        if let Some(Some(native)) = chosen {
            if command.is_on != Some(false) {
                self.klap.request(host, &creds, "set_device_info", Some(json!({ "device_on": true }))).await?;
            }
            self.klap.request(host, &creds, "set_lighting_effect", Some(native)).await?;
            self.playing.lock().unwrap().insert(host.to_string());
            return Ok(());
        }
        let mut params = serde_json::Map::new();
        if let Some(on) = command.is_on {
            params.insert("device_on".into(), json!(on));
        }
        if let Some(b) = command.brightness {
            params.insert("brightness".into(), json!(b.clamp(1, 100)));
        }
        if let Some(hex) = &command.color {
            if let Some((r, g, b)) = hex_to_rgb(hex) {
                let (h, s, _) = rgb_to_hsv(r, g, b);
                let hue = h.round() as u32;
                let saturation = (s * 100.0).round().clamp(0.0, 100.0) as u32;
                params.insert("hue".into(), json!(hue));
                params.insert("saturation".into(), json!(saturation));
                params.insert("color_temp".into(), json!(0));
            }
        } else if command.color_temp.is_some() || command.color_mode.as_deref() == Some("white") {
            let kelvin = command
                .color_temp
                .map(|t| 2500 + t.min(100) as u32 * 40)
                .unwrap_or(4000);
            params.insert("color_temp".into(), json!(kelvin));
            params.insert("hue".into(), json!(0));
            params.insert("saturation".into(), json!(0));
        }
        if let Some(Value::Object(raw)) = &command.raw {
            params.extend(raw.clone());
        }
        if params.is_empty() {
            return Err(CoreError::Unsupported("this device does not support that command".into()));
        }
        let Some(child) = child_id(device) else {
            self.klap
                .request(host, &creds, "set_device_info", Some(Value::Object(params)))
                .await?;
            return Ok(());
        };
        // A hub passes requests on to its devices, wrapped as a batch of one.
        let reply = self
            .klap
            .request(host, &creds, "control_child", Some(json!({
                "device_id": child,
                "requestData": { "method": "multipleRequest", "params": { "requests": [{ "method": "set_device_info", "params": params }] } },
            })))
            .await?;
        match reply.pointer("/responseData/result/responses/0/error_code").and_then(Value::as_i64).unwrap_or(0) {
            0 => Ok(()),
            code => Err(klap::TapoError(code).into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_offer_every_effect_and_report_the_one_playing() {
        let offered = strip_effects();
        assert_eq!(offered.len(), effects::EFFECTS.len() + effects::STRIP_EFFECTS.len());
        assert!(offered.contains(&"ocean".to_string()) && offered.contains(&"festive".to_string()));

        let festive = effects::STRIP_EFFECTS.iter().find(|e| e.id == "festive").unwrap();
        let native = lighting_effect(festive, true, 40);
        assert_eq!(native["brightness"], 40);
        assert_eq!(native["type"], "sequence");
        assert_eq!(native["sequence"][0], json!([0, 100, 100]));
        assert_eq!(native["id"].as_str().unwrap().len(), 32);

        let info = json!({"device_on": true, "brightness": 100, "lighting_effect": {"enable": 1, "name": "Festive", "brightness": 40}});
        let s = state_from(&info, None);
        assert_eq!(s.effect.as_deref(), Some("festive"));
        assert_eq!(s.brightness, Some(40));
        assert_eq!(s.options["effect"].len(), offered.len());
        // An effect set from the vendor's app is not one of ours; a bulb without the field offers none.
        assert_eq!(state_from(&json!({"lighting_effect": {"enable": 1, "name": "Something else"}}), None).effect, None);
        assert!(!state_from(&json!({"device_on": true}), None).options.contains_key("effect"));
    }

    #[test]
    fn hub_children_become_sensors_and_thermostats() {
        let account = AccountContext { id: "acc".into(), credentials: json!({}) };
        let motion = json!({"device_id": "c1", "nickname": "SGFsbA==", "model": "T100", "type": "SMART.TAPOSENSOR", "category": "subg.trigger.motion-sensor", "status": "online", "detected": true, "at_low_battery": false});
        let d = child_device(&account, "10.0.0.5", &motion);
        assert_eq!((d.name.as_str(), d.device_type, d.ip_address.as_deref()), ("Hall", DeviceType::Sensor, Some("10.0.0.5")));
        assert_eq!(d.config["child_id"], "c1");
        assert_eq!(d.state.unwrap().extra["motion"], json!(true));

        let trv = json!({"device_id": "c2", "model": "KE100", "type": "SMART.KASAENERGY", "category": "subg.trv", "status": "offline", "current_temp": 68.0, "temp_unit": "fahrenheit", "target_temp": 21});
        let d = child_device(&account, "10.0.0.5", &trv);
        assert_eq!((d.device_type, d.online), (DeviceType::Climate, false));
        let s = d.state.unwrap();
        assert_eq!((s.temperature, &s.extra["target_temp"]), (Some(20.0), &json!(21)));

        let leak = state_from(&json!({"water_leak_status": "water_leak", "current_humidity": 55}), None);
        assert_eq!((leak.humidity, &leak.extra["water_leak"]), (Some(55.0), &json!(true)));
    }

    #[test]
    fn tapo_state_from_color_mode() {
        let info = json!({
            "device_on": true,
            "brightness": 80,
            "hue": 0,
            "saturation": 100,
            "color_temp": 0
        });
        let s = state_from(&info, None);
        assert_eq!(s.is_on, Some(true));
        assert_eq!(s.brightness, Some(80));
        assert_eq!(s.color.as_deref(), Some("#ff0000"));
        assert_eq!(s.color_mode.as_deref(), Some("color"));
        assert_eq!(s.color_temp, None);
    }

    #[test]
    fn tapo_state_from_white_mode() {
        let info = json!({
            "device_on": true,
            "brightness": 100,
            "color_temp": 4500,
            "hue": 0,
            "saturation": 0
        });
        let s = state_from(&info, None);
        assert_eq!(s.is_on, Some(true));
        assert_eq!(s.color_mode.as_deref(), Some("white"));
        assert_eq!(s.color_temp, Some(50));
    }
}
