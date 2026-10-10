//! Translate between Tuya data points (DP codes) and the normalised model.

use home_core::{
    effects, hex_to_rgb, hsv_to_rgb, rgb_to_hex, rgb_to_hsv, DeviceCommand, DeviceState, DeviceType,
};
use serde_json::{json, Map, Value};

const ON_CODES: &[&str] = &["switch_led", "switch", "switch_1", "power", "switch_on"];
const BRIGHT_CODES: &[&str] = &["bright_value_v2", "bright_value", "bright_value_1"];
const TEMP_CODES: &[&str] = &["temp_value_v2", "temp_value"];
const FAN_CODES: &[&str] = &["fan_speed_enum", "speed", "fan_speed", "fan_speed_percent"];
const COLOR_CODES: &[&str] = &["colour_data_v2", "colour_data_hsv", "colour_data"];
const WORK_MODE_CODES: &[&str] = &["work_mode"];
const SCENE_CODE: &str = "scene_data_v2";

pub fn device_type(category: &str) -> DeviceType {
    match category {
        "kg" | "tdq" | "dlq" | "kgq" => DeviceType::Switch,
        "cz" | "pc" | "znjdq" => DeviceType::Plug,
        "dj" | "dd" | "xdd" | "fwd" | "dc" | "tgq" | "tgkg" | "gyd" | "sxd" | "fsd" => DeviceType::Light,
        "kj" => DeviceType::AirPurifier,
        "fs" | "fskg" => DeviceType::Fan,
        "wsdcg" | "mcs" | "pir" | "ywbj" | "rqbj" | "ldcg" | "co2bj" | "hjjcy" | "pm2.5" | "sj" => DeviceType::Sensor,
        "wk" | "kt" | "qn" | "rs" | "jsq" | "cs" => DeviceType::Climate,
        "cl" | "clkg" | "mc" => DeviceType::Cover,
        _ => DeviceType::Other,
    }
}

/// `status` is either a list of `{code, value}` or a map.
pub fn status_map(device: &Value) -> Map<String, Value> {
    match device.get("status") {
        Some(Value::Array(items)) => items
            .iter()
            .filter_map(|i| Some((i.get("code")?.as_str()?.to_string(), i.get("value")?.clone())))
            .collect(),
        Some(Value::Object(m)) => m.clone(),
        _ => Map::new(),
    }
}

/// Persisted per-device config: category plus DP specs (`type` and parsed `values`).
pub fn build_config(device: &Value, specs: &Value) -> Value {
    let mut dps = Map::new();
    let mut functions = Vec::new();
    for (kind, list) in [("status", specs.get("status")), ("functions", specs.get("functions"))] {
        for item in list.and_then(Value::as_array).into_iter().flatten() {
            let Some(code) = item.get("code").and_then(Value::as_str) else { continue };
            let values = match item.get("values") {
                Some(Value::String(s)) => serde_json::from_str(s).unwrap_or(Value::Null),
                Some(v) => v.clone(),
                None => Value::Null,
            };
            dps.insert(code.to_string(), json!({ "type": item.get("type"), "values": values }));
            if kind == "functions" {
                functions.push(Value::String(code.to_string()));
            }
        }
    }
    json!({
        "category": device.get("category").cloned().unwrap_or(Value::Null),
        "product_id": device.get("product_id").cloned().unwrap_or(Value::Null),
        "dps": dps,
        "functions": functions,
        "status_codes": status_map(device).keys().cloned().collect::<Vec<_>>(),
    })
}

fn dp<'a>(config: &'a Value, code: &str) -> Option<&'a Value> {
    config.get("dps")?.get(code)
}

fn scale(config: &Value, code: &str, default: i32) -> i32 {
    dp(config, code)
        .and_then(|d| d.get("values")?.get("scale")?.as_i64())
        .map(|s| s as i32)
        .unwrap_or(default)
}

fn range(config: &Value, code: &str, default: (f64, f64)) -> (f64, f64) {
    let v = dp(config, code).and_then(|d| d.get("values"));
    let min = v.and_then(|v| v.get("min")?.as_f64()).unwrap_or(default.0);
    let max = v.and_then(|v| v.get("max")?.as_f64()).unwrap_or(default.1);
    if max > min { (min, max) } else { default }
}

fn color_ranges(config: &Value, code: &str) -> (f64, f64, f64) {
    let vals = dp(config, code).and_then(|d| d.get("values"));
    let max_h = vals
        .and_then(|v| v.pointer("/h/max").or_else(|| v.get("max")).and_then(Value::as_f64))
        .unwrap_or(360.0);
    let max_s = vals
        .and_then(|v| v.pointer("/s/max").or_else(|| v.get("max")).and_then(Value::as_f64))
        .unwrap_or(1000.0);
    let max_v = vals
        .and_then(|v| v.pointer("/v/max").or_else(|| v.get("max")).and_then(Value::as_f64))
        .unwrap_or(1000.0);
    (max_h, max_s, max_v)
}

fn enum_options(config: &Value, code: &str) -> Option<Vec<String>> {
    let range = dp(config, code)?.get("values")?.get("range")?.as_array()?;
    Some(range.iter().filter_map(|v| v.as_str().map(str::to_string)).collect())
}

fn first<'a>(status: &'a Map<String, Value>, codes: &[&'a str]) -> Option<(&'a str, &'a Value)> {
    codes.iter().find_map(|c| status.get(*c).map(|v| (*c, v)))
}

fn num(v: &Value, scale: i32) -> Option<f32> {
    let n = match v {
        Value::Number(n) => n.as_f64()?,
        Value::String(s) => s.parse().ok()?,
        _ => return None,
    };
    Some((n / 10f64.powi(scale)) as f32)
}

fn to_pct(v: f64, (min, max): (f64, f64)) -> u8 {
    (((v - min) / (max - min)) * 100.0).round().clamp(0.0, 100.0) as u8
}

fn parse_tuya_color(v: &Value) -> Option<String> {
    match v {
        Value::Object(m) => {
            let h = m.get("h").and_then(Value::as_f64)?;
            let s = m.get("s").and_then(Value::as_f64)?;
            let s_norm = if s > 100.0 { s / 1000.0 } else { s / 100.0 }.clamp(0.0, 1.0);
            let (r, g, b) = hsv_to_rgb(h, s_norm, 1.0);
            Some(rgb_to_hex(r, g, b))
        }
        Value::String(s) => {
            let s = s.trim();
            if let Ok(Value::Object(m)) = serde_json::from_str::<Value>(s) {
                return parse_tuya_color(&Value::Object(m));
            }
            if s.starts_with('#') && s.len() == 7 {
                return Some(s.to_lowercase());
            }
            if s.len() == 6 && s.chars().all(|c| c.is_ascii_hexdigit()) {
                return Some(format!("#{s}").to_lowercase());
            }
            if s.len() == 12 && s.chars().all(|c| c.is_ascii_hexdigit()) {
                let h = u16::from_str_radix(&s[0..4], 16).ok()?;
                let sat = u16::from_str_radix(&s[4..8], 16).ok()?;
                let s_norm = if sat > 100 { sat as f64 / 1000.0 } else { sat as f64 / 100.0 }.clamp(0.0, 1.0);
                let (r, g, b) = hsv_to_rgb(h as f64, s_norm, 1.0);
                return Some(rgb_to_hex(r, g, b));
            }
            if s.len() == 14 && s.chars().all(|c| c.is_ascii_hexdigit()) {
                return Some(format!("#{}", &s[0..6]).to_lowercase());
            }
            None
        }
        _ => None,
    }
}

pub fn state_from_status(config: &Value, status: &Map<String, Value>) -> DeviceState {
    let mut s = DeviceState::default();
    if let Some((_, v)) = first(status, ON_CODES) {
        s.is_on = v.as_bool();
    }
    if let Some((code, v)) = first(status, BRIGHT_CODES) {
        if let Some(n) = v.as_f64() {
            s.brightness = Some(to_pct(n, range(config, code, (10.0, 1000.0))));
        }
    }
    if let Some((code, v)) = first(status, TEMP_CODES) {
        if let Some(n) = v.as_f64() {
            s.color_temp = Some(to_pct(n, range(config, code, (0.0, 1000.0))));
        }
    }
    if let Some((_, v)) = first(status, WORK_MODE_CODES) {
        if let Some(m) = v.as_str() {
            match m {
                "colour" | "color" => s.color_mode = Some("color".into()),
                "white" => s.color_mode = Some("white".into()),
                other => s.color_mode = Some(other.to_string()),
            }
        }
    }
    if supports_effects(config) {
        s.options.insert("effect".into(), effects::effect_ids());
        if status.get("work_mode").and_then(Value::as_str) == Some("scene") {
            s.effect = status.get(SCENE_CODE).and_then(playing_effect);
        }
    }
    if let Some((_, v)) = first(status, COLOR_CODES) {
        if let Some(hex) = parse_tuya_color(v) {
            s.color = Some(hex);
            if s.color_mode.is_none() {
                s.color_mode = Some("color".into());
            }
        }
    }
    if s.color_mode.is_none() && s.color_temp.is_some() {
        s.color_mode = Some("white".into());
    }
    if let Some(v) = status.get("cur_power") {
        s.current_power_watts = num(v, scale(config, "cur_power", 1));
    }
    if let Some(v) = status.get("cur_voltage") {
        s.voltage = num(v, scale(config, "cur_voltage", 1));
    }
    if let Some(v) = status.get("cur_current") {
        // mA
        s.current_amps = num(v, scale(config, "cur_current", 0)).map(|ma| ma / 1000.0);
    }
    if let Some((code, v)) = first(status, &["pm25", "pm25_value", "pm_25"]) {
        s.air_quality_pm25 = num(v, scale(config, code, 0));
    }
    if let Some((code, v)) = first(status, &["temp_current", "va_temperature", "temp_indoor"]) {
        s.temperature = num(v, scale(config, code, if code == "va_temperature" { 1 } else { 0 }));
    }
    if let Some((code, v)) = first(status, &["humidity_value", "va_humidity", "humidity_indoor"]) {
        s.humidity = num(v, scale(config, code, 0));
    }
    if let Some((code, v)) = first(status, FAN_CODES) {
        s.fan_speed = Some(match v {
            Value::String(x) => x.clone(),
            other => other.to_string(),
        });
        if let Some(opts) = enum_options(config, code) {
            s.options.insert("fan_speed".into(), opts);
        }
    }
    if let Some(Value::String(m)) = status.get("mode") {
        s.mode = Some(m.clone());
        if let Some(opts) = enum_options(config, "mode") {
            s.options.insert("mode".into(), opts);
        }
    }
    if let Some((code, v)) = first(status, &["filter", "filter_life", "filter_days"]) {
        s.filter_life = num(v, scale(config, code, 0));
    }
    s.extra.insert("dps".into(), Value::Object(status.clone()));
    s
}

/// Codes this device accepts, preferring the function list from the specs.
fn writable<'a>(config: &'a Value, candidates: &[&'a str]) -> Option<&'a str> {
    let functions: Vec<&str> = config
        .get("functions")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    let status: Vec<&str> = config
        .get("status_codes")
        .and_then(Value::as_array)
        .map(|a| a.iter().filter_map(Value::as_str).collect())
        .unwrap_or_default();
    candidates
        .iter()
        .find(|c| functions.contains(c))
        .or_else(|| candidates.iter().find(|c| status.contains(c)))
        .copied()
}

/// Bulbs that play scenes themselves: `work_mode` has a `scene` value and they take v2 scene data.
fn supports_effects(config: &Value) -> bool {
    dp(config, SCENE_CODE).is_some()
        && enum_options(config, "work_mode").is_some_and(|modes| modes.iter().any(|m| m == "scene"))
}

/// An effect as Tuya scene data: one unit per colour, in the effect's slot.
fn scene_data(slot: usize, e: &effects::Effect) -> Value {
    // Durations are 0-100; the effect's tenths of a second are used as they are.
    let pace = e.step.clamp(1, 100);
    let units: Vec<Value> = e
        .colors
        .iter()
        .map(|&(h, s, v)| {
            json!({
                "unit_change_mode": if e.fade { "gradient" } else { "jump" },
                "unit_switch_duration": pace,
                "unit_gradient_duration": pace,
                "h": h, "s": s as u32 * 10, "v": v as u32 * 10,
                "bright": 0, "temperature": 0,
            })
        })
        .collect();
    json!({ "scene_num": slot, "scene_units": units })
}

/// Which of our effects a bulb's scene data is: its slot, checked against the first colour
/// so a scene set from the Tuya app in the same slot is not mistaken for ours.
fn playing_effect(v: &Value) -> Option<String> {
    let parsed;
    let data = match v {
        Value::String(text) => {
            parsed = serde_json::from_str::<Value>(text).ok()?;
            &parsed
        }
        other => other,
    };
    let e = effects::EFFECTS.get(data.get("scene_num")?.as_u64()?.checked_sub(1)? as usize)?;
    let first = data.get("scene_units")?.get(0)?;
    (first.get("h")?.as_u64()? == e.colors[0].0 as u64).then(|| e.id.to_string())
}

pub fn commands_for(config: &Value, cmd: &DeviceCommand) -> Vec<Value> {
    let mut out = Vec::new();
    if let Some(on) = cmd.is_on {
        if let Some(code) = writable(config, ON_CODES) {
            out.push(json!({ "code": code, "value": on }));
        }
    }
    if let (Some(id), true) = (&cmd.effect, supports_effects(config)) {
        match effects::effect(id) {
            Some((slot, e)) => {
                if cmd.is_on.is_none() {
                    if let Some(code) = writable(config, ON_CODES) {
                        out.push(json!({ "code": code, "value": true }));
                    }
                }
                out.push(json!({ "code": "work_mode", "value": "scene" }));
                out.push(json!({ "code": SCENE_CODE, "value": scene_data(slot, e) }));
            }
            // Stop: back to plain white light. An effect this bulb can't play (another brand's) is ignored.
            None if id.is_empty() => out.push(json!({ "code": "work_mode", "value": "white" })),
            None => {}
        }
    }
    if let Some(hex) = &cmd.color {
        if let Some((r, g, b)) = hex_to_rgb(hex) {
            let (h, s, v) = rgb_to_hsv(r, g, b);
            if let Some(code) = writable(config, WORK_MODE_CODES) {
                out.push(json!({ "code": code, "value": "colour" }));
            }
            if let Some(code) = writable(config, COLOR_CODES) {
                let (max_h, max_s, max_v) = color_ranges(config, code);
                let h_val = (h / 360.0 * max_h).round() as i64;
                let s_val = (s * max_s).round() as i64;
                let v_val = if let Some(b) = cmd.brightness {
                    (b.min(100) as f64 / 100.0 * max_v).round() as i64
                } else {
                    (v * max_v).round() as i64
                };
                let is_string = dp(config, code)
                    .and_then(|d| d.get("type")?.as_str())
                    .is_some_and(|t| t.eq_ignore_ascii_case("string"));
                let val = if is_string {
                    json!(format!("{h_val:04x}{s_val:04x}{v_val:04x}"))
                } else {
                    json!({ "h": h_val, "s": s_val, "v": v_val })
                };
                out.push(json!({ "code": code, "value": val }));
            }
        }
    }
    if let Some(pct) = cmd.brightness {
        if cmd.color.is_none() {
            if let Some(code) = writable(config, BRIGHT_CODES) {
                let (min, max) = range(config, code, (10.0, 1000.0));
                let v = (min + (max - min) * pct.min(100) as f64 / 100.0).round() as i64;
                out.push(json!({ "code": code, "value": v }));
            }
        }
    }
    if let Some(pct) = cmd.color_temp {
        if cmd.color.is_none() {
            if let Some(code) = writable(config, WORK_MODE_CODES) {
                out.push(json!({ "code": code, "value": "white" }));
            }
        }
        if let Some(code) = writable(config, TEMP_CODES) {
            let (min, max) = range(config, code, (0.0, 1000.0));
            let v = (min + (max - min) * pct.min(100) as f64 / 100.0).round() as i64;
            out.push(json!({ "code": code, "value": v }));
        }
    } else if cmd.color_mode.as_deref() == Some("white") && cmd.color.is_none() {
        if let Some(code) = writable(config, WORK_MODE_CODES) {
            out.push(json!({ "code": code, "value": "white" }));
        }
    }
    if let Some(speed) = &cmd.fan_speed {
        if let Some(code) = writable(config, FAN_CODES) {
            let is_int = dp(config, code)
                .and_then(|d| d.get("type")?.as_str())
                .is_some_and(|t| t.eq_ignore_ascii_case("integer"));
            let value = match (is_int, speed.parse::<i64>()) {
                (true, Ok(n)) => json!(n),
                _ => json!(speed),
            };
            out.push(json!({ "code": code, "value": value }));
        }
    }
    if let Some(mode) = &cmd.mode {
        if writable(config, &["mode"]).is_some() {
            out.push(json!({ "code": "mode", "value": mode }));
        }
    }
    match &cmd.raw {
        Some(Value::Object(m)) => {
            out.extend(m.iter().map(|(k, v)| json!({ "code": k, "value": v })));
        }
        Some(Value::Array(items)) => out.extend(items.iter().cloned()),
        _ => {}
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn plug() -> (Value, Value) {
        let device = json!({
            "category": "cz",
            "status": [
                {"code": "switch_1", "value": true},
                {"code": "cur_power", "value": 1234},
                {"code": "cur_voltage", "value": 2301},
                {"code": "cur_current", "value": 540}
            ]
        });
        let specs = json!({
            "functions": [{"code": "switch_1", "type": "Boolean", "values": "{}"}],
            "status": [{"code": "cur_power", "type": "Integer", "values": "{\"unit\":\"W\",\"scale\":1}"}]
        });
        (device, specs)
    }

    fn bulb() -> (Value, Value) {
        let device = json!({
            "category": "dj",
            "status": [
                {"code": "switch_led", "value": true},
                {"code": "work_mode", "value": "colour"},
                {"code": "colour_data_v2", "value": {"h": 0, "s": 1000, "v": 1000}},
                {"code": "temp_value_v2", "value": 500}
            ]
        });
        let specs = json!({
            "functions": [
                {"code": "switch_led", "type": "Boolean", "values": "{}"},
                {"code": "work_mode", "type": "Enum", "values": "{\"range\":[\"white\",\"colour\"]}"},
                {"code": "colour_data_v2", "type": "Json", "values": "{\"h\":{\"min\":0,\"max\":360},\"s\":{\"min\":0,\"max\":1000},\"v\":{\"min\":0,\"max\":1000}}"},
                {"code": "temp_value_v2", "type": "Integer", "values": "{\"min\":0,\"max\":1000}"}
            ],
            "status": [
                {"code": "switch_led", "type": "Boolean", "values": "{}"},
                {"code": "work_mode", "type": "Enum", "values": "{\"range\":[\"white\",\"colour\"]}"},
                {"code": "colour_data_v2", "type": "Json", "values": "{}"},
                {"code": "temp_value_v2", "type": "Integer", "values": "{}"}
            ]
        });
        (device, specs)
    }

    #[test]
    fn maps_smart_plug() {
        let (device, specs) = plug();
        let config = build_config(&device, &specs);
        let s = state_from_status(&config, &status_map(&device));
        assert_eq!(s.is_on, Some(true));
        assert_eq!(s.current_power_watts, Some(123.4));
        assert_eq!(s.voltage, Some(230.1));
        assert_eq!(s.current_amps, Some(0.54));
        assert_eq!(device_type("cz"), DeviceType::Plug);
    }

    #[test]
    fn effects_use_the_bulbs_scene_mode() {
        let config = json!({ "functions": ["switch_led", "work_mode", "scene_data_v2"], "dps": {
            "switch_led": {"type": "Boolean"},
            "work_mode": {"type": "Enum", "values": {"range": ["white", "colour", "scene", "music"]}},
            "scene_data_v2": {"type": "Json", "values": {}},
        }});
        let cmds = commands_for(&config, &DeviceCommand { effect: Some("ocean".into()), ..Default::default() });
        assert_eq!(cmds[0], json!({"code": "switch_led", "value": true}));
        assert_eq!(cmds[1], json!({"code": "work_mode", "value": "scene"}));
        assert_eq!(cmds[2]["value"]["scene_num"], 1);
        assert_eq!(cmds[2]["value"]["scene_units"][0]["unit_change_mode"], "gradient");
        assert_eq!(cmds[2]["value"]["scene_units"][0]["s"], 1000);

        // The bulb reports scene data as a JSON string; ours is recognised, the Tuya app's own scene 1 is not.
        let mut status = Map::new();
        status.insert("work_mode".into(), json!("scene"));
        status.insert("scene_data_v2".into(), json!(cmds[2]["value"].to_string()));
        let s = state_from_status(&config, &status);
        assert_eq!(s.effect.as_deref(), Some("ocean"));
        assert!(s.options["effect"].contains(&"party".to_string()));
        status.insert("scene_data_v2".into(), json!(r#"{"scene_num":1,"scene_units":[{"bright":200,"h":0,"s":0,"temperature":0,"v":0}]}"#));
        assert_eq!(state_from_status(&config, &status).effect, None);

        // Stopping goes back to white; a bulb without scene data ignores effects.
        let stop = commands_for(&config, &DeviceCommand { effect: Some(String::new()), ..Default::default() });
        assert_eq!(stop, vec![json!({"code": "work_mode", "value": "white"})]);
        assert!(commands_for(&json!({"dps": {}}), &DeviceCommand { effect: Some("ocean".into()), ..Default::default() }).is_empty());
    }

    #[test]
    fn builds_commands() {
        let (device, specs) = plug();
        let config = build_config(&device, &specs);
        let cmds = commands_for(&config, &DeviceCommand { is_on: Some(false), ..Default::default() });
        assert_eq!(cmds, vec![json!({"code": "switch_1", "value": false})]);
    }

    #[test]
    fn maps_bulb_state_and_commands() {
        let (device, specs) = bulb();
        let config = build_config(&device, &specs);
        let s = state_from_status(&config, &status_map(&device));
        assert_eq!(s.is_on, Some(true));
        assert_eq!(s.color_mode.as_deref(), Some("color"));
        assert_eq!(s.color.as_deref(), Some("#ff0000"));

        let color_cmd = commands_for(
            &config,
            &DeviceCommand {
                color: Some("#00ff00".into()),
                ..Default::default()
            },
        );
        assert_eq!(
            color_cmd,
            vec![
                json!({"code": "work_mode", "value": "colour"}),
                json!({"code": "colour_data_v2", "value": {"h": 120, "s": 1000, "v": 1000}})
            ]
        );

        let temp_cmd = commands_for(
            &config,
            &DeviceCommand {
                color_temp: Some(50),
                ..Default::default()
            },
        );
        assert_eq!(
            temp_cmd,
            vec![
                json!({"code": "work_mode", "value": "white"}),
                json!({"code": "temp_value_v2", "value": 500})
            ]
        );
    }
}
