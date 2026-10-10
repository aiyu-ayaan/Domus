//! Home Assistant MQTT discovery: the entity configs that Zigbee2MQTT, ESPHome and
//! many others publish under `homeassistant/`. Pure mapping, no I/O.

use home_core::{hex_to_rgb, hsv_to_rgb, rgb_to_hex, DeviceCommand, DeviceState, DeviceType};
use serde_json::{json, Map, Value};
use std::collections::BTreeMap;

/// Abbreviated config keys we read, with their full names.
const KEYS: &[(&str, &str)] = &[
    ("stat_t", "state_topic"),
    ("cmd_t", "command_topic"),
    ("avty_t", "availability_topic"),
    ("avty", "availability"),
    ("t", "topic"),
    ("dev", "device"),
    ("ids", "identifiers"),
    ("mdl", "model"),
    ("uniq_id", "unique_id"),
    ("dev_cla", "device_class"),
    ("ent_cat", "entity_category"),
    ("unit_of_meas", "unit_of_measurement"),
    ("val_tpl", "value_template"),
    ("stat_val_tpl", "state_value_template"),
    ("pl_on", "payload_on"),
    ("pl_off", "payload_off"),
    ("pl_not_avail", "payload_not_available"),
    ("bri_cmd_t", "brightness_command_topic"),
    ("bri_stat_t", "brightness_state_topic"),
    ("bri_val_tpl", "brightness_value_template"),
    ("bri_scl", "brightness_scale"),
    ("rgb_cmd_t", "rgb_command_topic"),
    ("clr_temp_cmd_t", "color_temp_command_topic"),
    ("max_mirs", "max_mireds"),
    ("min_mirs", "min_mireds"),
    ("pct_cmd_t", "percentage_command_topic"),
    ("pct_stat_t", "percentage_state_topic"),
    ("pct_val_tpl", "percentage_value_template"),
];

fn full(key: &str) -> &str {
    KEYS.iter().find(|(short, _)| *short == key).map_or(key, |(_, long)| long)
}

fn expand_value(v: &Value, base: &str, key: &str) -> Value {
    match v {
        Value::Object(m) => Value::Object(m.iter().map(|(k, v)| (full(k).to_string(), expand_value(v, base, full(k)))).collect()),
        Value::Array(a) => Value::Array(a.iter().map(|v| expand_value(v, base, key)).collect()),
        // `~` at either end of a topic stands for the base topic.
        Value::String(s) if key.ends_with("topic") => json!(match (s.strip_prefix('~'), s.strip_suffix('~')) {
            (Some(rest), _) => format!("{base}{rest}"),
            (_, Some(rest)) => format!("{rest}{base}"),
            _ => s.clone(),
        }),
        other => other.clone(),
    }
}

/// A discovery payload with full key names and topics, tagged with its component (`light`, `sensor`, ...).
pub fn expand(component: &str, raw: &Value) -> Option<Value> {
    let base = raw.as_object()?.get("~").and_then(Value::as_str).unwrap_or("");
    let mut cfg = expand_value(raw, base, "");
    cfg["component"] = json!(component);
    Some(cfg)
}

/// Every topic an entity reports on.
pub fn topics(cfg: &Value) -> Vec<String> {
    let mut out: Vec<String> = cfg
        .as_object()
        .into_iter()
        .flatten()
        .filter(|(k, _)| k.ends_with("state_topic") || *k == "availability_topic")
        .filter_map(|(_, v)| v.as_str().map(str::to_string))
        .collect();
    for a in cfg.get("availability").and_then(Value::as_array).into_iter().flatten() {
        out.extend(a.get("topic").and_then(Value::as_str).map(str::to_string));
    }
    out
}

fn text<'a>(v: &'a Value, key: &str) -> Option<&'a str> {
    v.get(key).and_then(Value::as_str)
}

fn component(e: &Value) -> &str {
    text(e, "component").unwrap_or("")
}

/// A Domus device made of one controllable entity (or none) and the sensors beside it.
pub struct Found {
    pub external_id: String,
    pub name: String,
    pub device_type: DeviceType,
    pub model: Option<String>,
    /// `{ "primary": entity | null, "sensors": [entity] }`
    pub config: Value,
}

/// Group entities by the device they belong to. Each light, switch or fan becomes a
/// device; the sensors of the same hardware ride along with the first one.
pub fn devices<'a>(configs: impl Iterator<Item = &'a Value>) -> Vec<Found> {
    let mut by_device: BTreeMap<String, Vec<&Value>> = BTreeMap::new();
    for e in configs {
        let Some(uid) = text(e, "unique_id") else { continue };
        let ids = e.pointer("/device/identifiers");
        let device = ids.and_then(Value::as_str).or_else(|| ids?.get(0)?.as_str()).unwrap_or(uid);
        by_device.entry(device.to_string()).or_default().push(e);
    }
    let mut out = Vec::new();
    for (device_id, mut entities) in by_device {
        entities.sort_by_key(|e| text(e, "unique_id"));
        let sensors: Vec<&Value> = entities.iter().copied().filter(|e| matches!(component(e), "sensor" | "binary_sensor")).collect();
        // Config and diagnostic switches (child lock, LED) are settings, not devices.
        let controls: Vec<&Value> = entities
            .iter()
            .copied()
            .filter(|e| matches!(component(e), "light" | "switch" | "fan") && e.get("entity_category").is_none())
            .collect();
        let first = entities[0];
        let device_name = first.pointer("/device/name").and_then(Value::as_str).or(text(first, "name")).unwrap_or("MQTT device");
        let model = first.pointer("/device/model").and_then(Value::as_str).map(str::to_string);
        let metered = sensors.iter().any(|s| text(s, "device_class") == Some("power"));
        if controls.is_empty() {
            if !sensors.is_empty() {
                out.push(Found {
                    external_id: device_id,
                    name: device_name.to_string(),
                    device_type: DeviceType::Sensor,
                    model,
                    config: json!({ "primary": null, "sensors": sensors }),
                });
            }
            continue;
        }
        for (i, c) in controls.iter().enumerate() {
            out.push(Found {
                external_id: text(c, "unique_id").unwrap_or_default().to_string(),
                name: match text(c, "name") {
                    Some(n) if controls.len() > 1 => format!("{device_name} {n}"),
                    _ => device_name.to_string(),
                },
                device_type: match component(c) {
                    "light" => DeviceType::Light,
                    "fan" => DeviceType::Fan,
                    _ if metered || text(c, "device_class") == Some("outlet") => DeviceType::Plug,
                    _ => DeviceType::Switch,
                },
                model: model.clone(),
                config: json!({ "primary": c, "sensors": if i == 0 { sensors.clone() } else { vec![] } }),
            });
        }
    }
    out
}

/// The JSON path a template reads, e.g. `{{ value_json.state }}` -> `["state"]`.
// shortcut: only plain `value_json` lookups, no Jinja. Run a real template engine if devices turn up that compute values.
fn template_path(tpl: &str) -> Option<Vec<String>> {
    let mut rest = &tpl[tpl.find("value_json")? + "value_json".len()..];
    let mut path = Vec::new();
    loop {
        if let Some(r) = rest.strip_prefix('.') {
            let end = r.find(|c: char| !c.is_alphanumeric() && c != '_').unwrap_or(r.len());
            path.push(r[..end].to_string());
            rest = &r[end..];
        } else if let Some(r) = rest.strip_prefix("['").or_else(|| rest.strip_prefix("[\"")) {
            let end = r.find(['\'', '"'])?;
            path.push(r[..end].to_string());
            rest = r[end + 1..].strip_prefix(']')?;
        } else {
            return (!path.is_empty()).then_some(path);
        }
    }
}

type Payloads<'a> = &'a dyn Fn(&str) -> Option<String>;

/// The value on one of the entity's topics: the payload itself, or the JSON field its template names.
fn read(e: &Value, topic: &str, templates: &[&str], get: Payloads) -> Option<Value> {
    let payload = get(text(e, topic)?)?;
    match templates.iter().find_map(|t| text(e, t)).and_then(template_path) {
        Some(path) => path.iter().try_fold(serde_json::from_str::<Value>(&payload).ok()?, |v, key| v.get(key).cloned()),
        None => Some(serde_json::from_str(&payload).unwrap_or(Value::String(payload))),
    }
}

fn num(v: &Value) -> Option<f64> {
    v.as_f64().or_else(|| v.as_str()?.trim().parse().ok())
}

fn is_on(e: &Value, v: &Value) -> bool {
    let on = text(e, "state_on").or(text(e, "payload_on")).unwrap_or("ON");
    match v {
        Value::String(s) => s == on,
        Value::Bool(b) => *b,
        other => other.to_string() == on,
    }
}

fn pct(value: f64, max: f64) -> u8 {
    (value / max * 100.0).round().clamp(0.0, 100.0) as u8
}

fn mireds(e: &Value) -> (f64, f64) {
    let m = |k: &str, d: f64| e.get(k).and_then(num).unwrap_or(d);
    (m("min_mireds", 153.0), m("max_mireds", 500.0))
}

/// CIE xy (what Zigbee bulbs report) to sRGB at full brightness.
fn xy_to_rgb(x: f64, y: f64) -> (u8, u8, u8) {
    if y <= 0.0 {
        return (255, 255, 255);
    }
    let (cx, cz) = (x / y, (1.0 - x - y) / y);
    let linear = [
        cx * 1.656492 - 0.354851 - cz * 0.255038,
        -cx * 0.707196 + 1.655397 + cz * 0.036152,
        cx * 0.051713 - 0.121364 + cz * 1.011530,
    ];
    let max = linear.iter().cloned().fold(f64::MIN, f64::max).max(1e-6);
    let c = |v: f64| {
        let v = (v / max).clamp(0.0, 1.0);
        let v = if v <= 0.0031308 { 12.92 * v } else { 1.055 * v.powf(1.0 / 2.4) - 0.055 };
        (v * 255.0).round() as u8
    };
    (c(linear[0]), c(linear[1]), c(linear[2]))
}

fn json_light(e: &Value, st: &Value, s: &mut DeviceState) {
    if let Some(v) = st.get("state") {
        s.is_on = Some(is_on(e, v));
    }
    if let Some(b) = st.get("brightness").and_then(num) {
        s.brightness = Some(pct(b, e.get("brightness_scale").and_then(num).unwrap_or(255.0)));
    }
    if let Some(m) = st.get("color_temp").and_then(num) {
        let (min, max) = mireds(e);
        s.color_temp = Some(pct(max - m, max - min));
    }
    if let Some(c) = st.get("color") {
        let f = |k: &str| c.get(k).and_then(num);
        let rgb = match (f("r"), f("g"), f("b"), f("h"), f("s"), f("x"), f("y")) {
            (Some(r), Some(g), Some(b), ..) => Some((r as u8, g as u8, b as u8)),
            (_, _, _, Some(h), Some(sat), ..) => Some(hsv_to_rgb(h, sat / 100.0, 1.0)),
            (.., Some(x), Some(y)) => Some(xy_to_rgb(x, y)),
            _ => None,
        };
        s.color = rgb.map(|(r, g, b)| rgb_to_hex(r, g, b));
    }
    match text(st, "color_mode") {
        Some("color_temp") => s.color_mode = Some("white".into()),
        Some("xy" | "hs" | "rgb" | "rgbw" | "rgbww") => s.color_mode = Some("color".into()),
        _ => {}
    }
}

fn sensor(e: &Value, v: &Value, s: &mut DeviceState) {
    let class = text(e, "device_class").unwrap_or("");
    if component(e) == "binary_sensor" {
        let key = match class {
            "motion" | "occupancy" | "presence" => "motion",
            "door" | "window" | "opening" | "garage_door" => "contact",
            "moisture" => "water_leak",
            "battery" => "battery_low",
            "" => return,
            other => other,
        };
        s.extra.insert(key.into(), json!(is_on(e, v)));
        return;
    }
    let Some(n) = num(v) else { return };
    let unit = text(e, "unit_of_measurement").unwrap_or("");
    match class {
        "temperature" => s.temperature = Some(if unit.ends_with('F') { (n - 32.0) / 1.8 } else { n } as f32),
        "humidity" => s.humidity = Some(n as f32),
        "pm25" => s.air_quality_pm25 = Some(n as f32),
        "power" => s.current_power_watts = Some(if unit == "kW" { n * 1000.0 } else { n } as f32),
        "voltage" => s.voltage = Some(n as f32),
        "current" => s.current_amps = Some(if unit == "mA" { n / 1000.0 } else { n } as f32),
        "energy" => drop(s.extra.insert("energy_kwh".into(), json!(if unit == "Wh" { n / 1000.0 } else { n }))),
        "" => {}
        other => drop(s.extra.insert(other.into(), json!(n))),
    }
}

/// Lay what the broker last said over the stored state.
pub fn apply_state(config: &Value, get: Payloads, s: &mut DeviceState) {
    if let Some(e) = config.get("primary").filter(|e| !e.is_null()) {
        let templates = ["state_value_template", "value_template"];
        if component(e) == "light" && text(e, "schema") == Some("json") {
            if let Some(st) = read(e, "state_topic", &[], get) {
                json_light(e, &st, s);
            }
        } else if let Some(v) = read(e, "state_topic", &templates, get) {
            s.is_on = Some(is_on(e, &v));
        }
        if let Some(b) = read(e, "brightness_state_topic", &["brightness_value_template"], get).as_ref().and_then(num) {
            s.brightness = Some(pct(b, e.get("brightness_scale").and_then(num).unwrap_or(255.0)));
        }
        if let Some(p) = read(e, "percentage_state_topic", &["percentage_value_template"], get).as_ref().and_then(num) {
            s.fan_percent = Some(pct(p, 100.0));
        }
    }
    for e in config.get("sensors").and_then(Value::as_array).into_iter().flatten() {
        if let Some(v) = read(e, "state_topic", &["value_template"], get) {
            sensor(e, &v, s);
        }
    }
}

/// False once any availability topic of the device says it is gone.
pub fn online(config: &Value, get: Payloads) -> bool {
    let entities = config.get("primary").into_iter().chain(config.get("sensors").and_then(Value::as_array).into_iter().flatten());
    for e in entities {
        let gone = text(e, "payload_not_available").unwrap_or("offline");
        let listed = e.get("availability").and_then(Value::as_array).into_iter().flatten().filter_map(|a| text(a, "topic"));
        // Contains, not equals: Zigbee2MQTT wraps it as `{"state":"offline"}`.
        if text(e, "availability_topic").into_iter().chain(listed).any(|t| get(t).is_some_and(|p| p.contains(gone))) {
            return false;
        }
    }
    true
}

/// `(topic, payload)` messages that carry out a command.
pub fn commands(config: &Value, cmd: &DeviceCommand) -> Vec<(String, String)> {
    let Some(e) = config.get("primary").filter(|e| !e.is_null()) else { return vec![] };
    let topic = |k: &str| text(e, k).map(str::to_string);
    let rgb = cmd.color.as_deref().and_then(hex_to_rgb);
    let mired = cmd.color_temp.map(|t| {
        let (min, max) = mireds(e);
        (max - t.min(100) as f64 / 100.0 * (max - min)).round() as u32
    });
    let scale = e.get("brightness_scale").and_then(num).unwrap_or(255.0);
    let brightness = cmd.brightness.map(|b| (b.min(100) as f64 / 100.0 * scale).round().max(1.0) as u32);
    let on_off = |on: bool| text(e, if on { "payload_on" } else { "payload_off" }).unwrap_or(if on { "ON" } else { "OFF" }).to_string();
    let mut out = Vec::new();

    if component(e) == "light" && text(e, "schema") == Some("json") {
        let mut body = Map::new();
        if let Some(b) = brightness {
            body.insert("brightness".into(), json!(b));
        }
        if let Some((r, g, b)) = rgb {
            body.insert("color".into(), json!({ "r": r, "g": g, "b": b }));
        } else if let Some(m) = mired {
            body.insert("color_temp".into(), json!(m));
        }
        if cmd.is_on.is_some() || !body.is_empty() {
            // The JSON schema wants a state in every message.
            body.insert("state".into(), json!(if cmd.is_on == Some(false) { "OFF" } else { "ON" }));
            out.extend(topic("command_topic").map(|t| (t, Value::Object(body).to_string())));
        }
        return out;
    }
    if let Some(on) = cmd.is_on {
        out.extend(topic("command_topic").map(|t| (t, on_off(on))));
    }
    if let Some(b) = brightness {
        out.extend(topic("brightness_command_topic").map(|t| (t, b.to_string())));
    }
    if let Some((r, g, b)) = rgb {
        out.extend(topic("rgb_command_topic").map(|t| (t, format!("{r},{g},{b}"))));
    } else if let Some(m) = mired {
        out.extend(topic("color_temp_command_topic").map(|t| (t, m.to_string())));
    }
    if let Some(p) = cmd.fan_percent {
        out.extend(topic("percentage_command_topic").map(|t| (t, p.min(100).to_string())));
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::collections::HashMap;

    fn z2m() -> Vec<Value> {
        let dev = json!({"ids": ["zigbee2mqtt_0x01"], "name": "Desk", "mdl": "TS011F"});
        [
            ("switch", json!({"uniq_id": "0x01_switch", "~": "zigbee2mqtt/desk", "stat_t": "~", "cmd_t": "~/set", "val_tpl": "{{ value_json.state }}", "pl_on": "ON", "pl_off": "OFF", "avty": [{"t": "zigbee2mqtt/bridge/state"}], "dev": dev})),
            ("switch", json!({"uniq_id": "0x01_child_lock", "stat_t": "zigbee2mqtt/desk", "cmd_t": "zigbee2mqtt/desk/set", "ent_cat": "config", "dev": dev})),
            ("sensor", json!({"uniq_id": "0x01_power", "stat_t": "zigbee2mqtt/desk", "dev_cla": "power", "unit_of_meas": "W", "val_tpl": "{{ value_json.power }}", "dev": dev})),
            ("binary_sensor", json!({"uniq_id": "0x02_occ", "stat_t": "zigbee2mqtt/hall", "dev_cla": "occupancy", "val_tpl": "{{ value_json['occupancy'] }}", "pl_on": true, "dev": {"ids": "0x02", "name": "Hall"}})),
            ("light", json!({"uniq_id": "0x03_light", "schema": "json", "stat_t": "zigbee2mqtt/bulb", "cmd_t": "zigbee2mqtt/bulb/set", "bri_scl": 254, "dev": {"ids": ["0x03"], "name": "Bulb"}})),
        ]
        .iter()
        .map(|(c, v)| expand(c, v).unwrap())
        .collect()
    }

    #[test]
    fn groups_entities_into_devices_and_reads_their_state() {
        let configs = z2m();
        let found = devices(configs.iter());
        let by_name = |n: &str| found.iter().find(|f| f.name == n).unwrap();
        assert_eq!(found.len(), 3);
        // The metered switch is a plug; its child lock is not a device of its own.
        let plug = by_name("Desk");
        assert_eq!((plug.device_type, plug.external_id.as_str()), (DeviceType::Plug, "0x01_switch"));
        assert_eq!(by_name("Hall").device_type, DeviceType::Sensor);
        assert!(topics(&plug.config["primary"]).contains(&"zigbee2mqtt/bridge/state".to_string()));

        let mut payloads: HashMap<&str, &str> = HashMap::from([
            ("zigbee2mqtt/desk", r#"{"state":"ON","power":42.5}"#),
            ("zigbee2mqtt/hall", r#"{"occupancy":true}"#),
            ("zigbee2mqtt/bulb", r#"{"state":"ON","brightness":127,"color_mode":"xy","color":{"x":0.64,"y":0.33}}"#),
            ("zigbee2mqtt/bridge/state", r#"{"state":"online"}"#),
        ]);
        let state = |f: &Found, p: &HashMap<&str, &str>| {
            let mut s = DeviceState { brightness: Some(9), ..Default::default() };
            apply_state(&f.config, &|t| p.get(t).map(|v| v.to_string()), &mut s);
            s
        };
        let s = state(plug, &payloads);
        // What the broker has not mentioned keeps its stored value.
        assert_eq!((s.is_on, s.current_power_watts, s.brightness), (Some(true), Some(42.5), Some(9)));
        assert_eq!(state(by_name("Hall"), &payloads).extra["motion"], json!(true));
        let bulb = state(by_name("Bulb"), &payloads);
        assert_eq!((bulb.brightness, bulb.color_mode.as_deref()), (Some(50), Some("color")));
        assert!(bulb.color.unwrap().starts_with("#ff"));

        assert!(online(&plug.config, &|t| payloads.get(t).map(|v| v.to_string())));
        payloads.insert("zigbee2mqtt/bridge/state", r#"{"state":"offline"}"#);
        assert!(!online(&plug.config, &|t| payloads.get(t).map(|v| v.to_string())));
    }

    #[test]
    fn builds_commands_for_each_schema() {
        let configs = z2m();
        let found = devices(configs.iter());
        let cfg = |n: &str| &found.iter().find(|f| f.name == n).unwrap().config;
        let off = DeviceCommand { is_on: Some(false), ..Default::default() };
        assert_eq!(commands(cfg("Desk"), &off), vec![("zigbee2mqtt/desk/set".to_string(), "OFF".to_string())]);
        assert!(commands(cfg("Hall"), &off).is_empty());

        let dim = DeviceCommand { brightness: Some(50), color_temp: Some(100), ..Default::default() };
        let (topic, body) = commands(cfg("Bulb"), &dim).remove(0);
        assert_eq!(topic, "zigbee2mqtt/bulb/set");
        assert_eq!(serde_json::from_str::<Value>(&body).unwrap(), json!({"state": "ON", "brightness": 127, "color_temp": 153}));

        let basic = expand("light", &json!({"uniq_id": "l", "cmd_t": "l/set", "bri_cmd_t": "l/bri", "rgb_cmd_t": "l/rgb"})).unwrap();
        let red = DeviceCommand { is_on: Some(true), brightness: Some(100), color: Some("#ff0000".into()), ..Default::default() };
        assert_eq!(
            commands(&json!({ "primary": basic }), &red),
            vec![("l/set".into(), "ON".into()), ("l/bri".into(), "255".into()), ("l/rgb".into(), "255,0,0".into())]
        );
    }

    #[test]
    fn reads_template_paths() {
        assert_eq!(template_path("{{ value_json.a.b_c }}"), Some(vec!["a".into(), "b_c".into()]));
        assert_eq!(template_path("{{ value_json[\"x\"] | float }}"), Some(vec!["x".into()]));
        assert_eq!(template_path("{{ value }}"), None);
    }
}
