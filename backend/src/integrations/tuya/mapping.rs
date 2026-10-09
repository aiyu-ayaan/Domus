//! Translate between Tuya data points (DP codes) and the normalised model.

use home_core::{DeviceCommand, DeviceState, DeviceType};
use serde_json::{json, Map, Value};

const ON_CODES: &[&str] = &["switch_led", "switch", "switch_1", "power", "switch_on"];
const BRIGHT_CODES: &[&str] = &["bright_value_v2", "bright_value", "bright_value_1"];
const TEMP_CODES: &[&str] = &["temp_value_v2", "temp_value"];
const FAN_CODES: &[&str] = &["fan_speed_enum", "speed", "fan_speed", "fan_speed_percent"];

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

pub fn commands_for(config: &Value, cmd: &DeviceCommand) -> Vec<Value> {
    let mut out = Vec::new();
    if let Some(on) = cmd.is_on {
        if let Some(code) = writable(config, ON_CODES) {
            out.push(json!({ "code": code, "value": on }));
        }
    }
    if let Some(pct) = cmd.brightness {
        if let Some(code) = writable(config, BRIGHT_CODES) {
            let (min, max) = range(config, code, (10.0, 1000.0));
            let v = (min + (max - min) * pct.min(100) as f64 / 100.0).round() as i64;
            out.push(json!({ "code": code, "value": v }));
        }
    }
    if let Some(pct) = cmd.color_temp {
        if let Some(code) = writable(config, TEMP_CODES) {
            let (min, max) = range(config, code, (0.0, 1000.0));
            let v = (min + (max - min) * pct.min(100) as f64 / 100.0).round() as i64;
            out.push(json!({ "code": code, "value": v }));
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
    fn builds_commands() {
        let (device, specs) = plug();
        let config = build_config(&device, &specs);
        let cmds = commands_for(&config, &DeviceCommand { is_on: Some(false), ..Default::default() });
        assert_eq!(cmds, vec![json!({"code": "switch_1", "value": false})]);
    }
}
