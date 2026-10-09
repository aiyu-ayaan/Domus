//! MIoT spec lookup: maps a device model to the (siid, piid) pairs for the
//! properties we understand, using the public spec at miot-spec.org.

use home_core::{
    hex_to_rgb, integration_err, rgb_to_hex, DeviceCommand, DeviceState, DeviceType, Result,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use tokio::sync::OnceCell;

const PRIMARY_SERVICES: &[&str] = &[
    "air-purifier", "light", "outlet", "switch", "fan", "heater", "air-conditioner", "humidifier",
    "dehumidifier", "air-fresh", "vacuum", "curtain",
];

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct PropRef {
    pub siid: u32,
    pub piid: u32,
    #[serde(default)]
    pub min: Option<f64>,
    #[serde(default)]
    pub max: Option<f64>,
    /// value -> description for enum properties
    #[serde(default)]
    pub values: Vec<(i64, String)>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct MiotMap {
    pub service: String,
    pub props: HashMap<String, PropRef>,
}

static INSTANCES: OnceCell<Vec<Value>> = OnceCell::const_new();

fn http() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(30))
        .build()
        .expect("http client")
}

async fn instances() -> Result<&'static Vec<Value>> {
    INSTANCES
        .get_or_try_init(|| async {
            let v: Value = http()
                .get("https://miot-spec.org/miot-spec-v2/instances?status=all")
                .send()
                .await
                .map_err(integration_err)?
                .json()
                .await
                .map_err(integration_err)?;
            Ok(v.get("instances").and_then(Value::as_array).cloned().unwrap_or_default())
        })
        .await
}

fn urn_name(urn: &str) -> &str {
    urn.split(':').nth(3).unwrap_or_default()
}

/// Fetch the spec for `model` and extract the property mapping.
pub async fn lookup(model: &str) -> Result<Option<MiotMap>> {
    let list = instances().await?;
    let best = list
        .iter()
        .filter(|i| i.get("model").and_then(Value::as_str) == Some(model))
        .max_by_key(|i| {
            let released = i.get("status").and_then(Value::as_str) == Some("released");
            (released, i.get("version").and_then(Value::as_i64).unwrap_or(0))
        });
    let Some(urn) = best.and_then(|i| i.get("type")).and_then(Value::as_str) else {
        return Ok(None);
    };
    let spec: Value = http()
        .get("https://miot-spec.org/miot-spec-v2/instance")
        .query(&[("type", urn)])
        .send()
        .await
        .map_err(integration_err)?
        .json()
        .await
        .map_err(integration_err)?;
    Ok(Some(map_spec(&spec)))
}

pub fn map_spec(spec: &Value) -> MiotMap {
    let services = spec.get("services").and_then(Value::as_array).cloned().unwrap_or_default();
    let primary = PRIMARY_SERVICES
        .iter()
        .find_map(|name| {
            services
                .iter()
                .find(|s| urn_name(s.get("type").and_then(Value::as_str).unwrap_or_default()) == *name)
        })
        .cloned();

    let mut map = MiotMap {
        service: primary
            .as_ref()
            .and_then(|s| s.get("type")?.as_str().map(|t| urn_name(t).to_string()))
            .unwrap_or_default(),
        props: HashMap::new(),
    };

    let prop_ref = |siid: u32, p: &Value| -> Option<PropRef> {
        let range = p.get("value-range").and_then(Value::as_array);
        Some(PropRef {
            siid,
            piid: p.get("iid")?.as_u64()? as u32,
            min: range.and_then(|r| r.first()?.as_f64()),
            max: range.and_then(|r| r.get(1)?.as_f64()),
            values: p
                .get("value-list")
                .and_then(Value::as_array)
                .map(|l| {
                    l.iter()
                        .filter_map(|v| {
                            Some((v.get("value")?.as_i64()?, v.get("description")?.as_str()?.to_string()))
                        })
                        .collect()
                })
                .unwrap_or_default(),
        })
    };

    // Primary-service properties first so e.g. the purifier's "on" wins over an indicator light.
    let mut ordered: Vec<&Value> = primary.iter().collect();
    ordered.extend(services.iter());
    for svc in ordered {
        let Some(siid) = svc.get("iid").and_then(Value::as_u64) else { continue };
        let is_primary = primary.as_ref().and_then(|p| p.get("iid")) == svc.get("iid");
        for p in svc.get("properties").and_then(Value::as_array).into_iter().flatten() {
            let name = urn_name(p.get("type").and_then(Value::as_str).unwrap_or_default());
            let key = match name {
                "on" if is_primary => "on",
                "brightness" if is_primary => "brightness",
                "color-temperature" if is_primary => "color_temp",
                "color" => "color",
                "fan-level" if is_primary => "fan_level",
                "mode" if is_primary => "mode",
                "pm2.5-density" => "pm25",
                "temperature" => "temperature",
                "relative-humidity" => "humidity",
                "filter-life-level" => "filter_life",
                "electric-power" => "power",
                _ => continue,
            };
            if !map.props.contains_key(key) {
                if let Some(r) = prop_ref(siid as u32, p) {
                    map.props.insert(key.to_string(), r);
                }
            }
        }
    }
    map
}

pub fn device_type(service: &str, model: &str) -> DeviceType {
    match service {
        "air-purifier" | "air-fresh" => DeviceType::AirPurifier,
        "light" => DeviceType::Light,
        "outlet" => DeviceType::Plug,
        "switch" => DeviceType::Switch,
        "fan" => DeviceType::Fan,
        "heater" | "air-conditioner" | "humidifier" | "dehumidifier" => DeviceType::Climate,
        "curtain" => DeviceType::Cover,
        _ if model.contains("sensor") || model.contains("airmonitor") => DeviceType::Sensor,
        _ if model.contains("plug") => DeviceType::Plug,
        _ if model.contains("light") => DeviceType::Light,
        _ => DeviceType::Other,
    }
}

pub fn get_params(did: &str, map: &MiotMap) -> (Vec<String>, Value) {
    let keys: Vec<String> = map.props.keys().cloned().collect();
    let params = keys
        .iter()
        .map(|k| {
            let p = &map.props[k];
            json!({ "did": format!("{did}|{k}"), "siid": p.siid, "piid": p.piid })
        })
        .collect();
    (keys, Value::Array(params))
}

fn label(p: &PropRef, v: &Value) -> Option<String> {
    let n = v.as_i64()?;
    Some(
        p.values
            .iter()
            .find(|(val, _)| *val == n)
            .map(|(_, d)| d.clone())
            .unwrap_or_else(|| n.to_string()),
    )
}

fn pct(p: &PropRef, v: f64) -> u8 {
    let (min, max) = (p.min.unwrap_or(0.0), p.max.unwrap_or(100.0));
    if max <= min {
        return 0;
    }
    (((v - min) / (max - min)) * 100.0).round().clamp(0.0, 100.0) as u8
}

/// Build state from a `get_properties` result.
pub fn state_from(map: &MiotMap, result: &Value) -> DeviceState {
    let mut s = DeviceState::default();
    for item in result.as_array().into_iter().flatten() {
        if item.get("code").and_then(Value::as_i64).unwrap_or(0) != 0 {
            continue;
        }
        let Some(key) = item.get("did").and_then(Value::as_str).and_then(|d| d.split('|').nth(1)) else {
            continue;
        };
        let (Some(p), Some(v)) = (map.props.get(key), item.get("value")) else { continue };
        let f = v.as_f64().map(|x| x as f32);
        match key {
            "on" => s.is_on = v.as_bool(),
            "brightness" => s.brightness = v.as_f64().map(|x| pct(p, x)),
            "color_temp" => s.color_temp = v.as_f64().map(|x| pct(p, x)),
            "color" => {
                let n = v.as_u64().or_else(|| v.as_i64().map(|x| x as u64));
                if let Some(n) = n {
                    let r = ((n >> 16) & 0xff) as u8;
                    let g = ((n >> 8) & 0xff) as u8;
                    let b = (n & 0xff) as u8;
                    s.color = Some(rgb_to_hex(r, g, b));
                    s.color_mode = Some("color".into());
                }
            }
            "fan_level" => s.fan_speed = label(p, v),
            "mode" => s.mode = label(p, v),
            "pm25" => s.air_quality_pm25 = f,
            "temperature" => s.temperature = f,
            "humidity" => s.humidity = f,
            "filter_life" => s.filter_life = f,
            "power" => s.current_power_watts = f,
            _ => {}
        }
    }
    if s.color_mode.is_none() && s.color_temp.is_some() {
        s.color_mode = Some("white".into());
    }
    for (key, opt) in [("fan_level", "fan_speed"), ("mode", "mode")] {
        if let Some(p) = map.props.get(key) {
            if !p.values.is_empty() {
                s.options.insert(opt.into(), p.values.iter().map(|(_, d)| d.clone()).collect());
            }
        }
    }
    s
}

fn enum_value(p: &PropRef, label: &str) -> Value {
    p.values
        .iter()
        .find(|(_, d)| d.eq_ignore_ascii_case(label))
        .map(|(v, _)| json!(v))
        .or_else(|| label.parse::<i64>().ok().map(|n| json!(n)))
        .unwrap_or(json!(label))
}

/// Build `set_properties` params.
pub fn set_params(did: &str, map: &MiotMap, cmd: &DeviceCommand) -> Vec<Value> {
    let mut out = Vec::new();
    let mut push = |key: &str, value: Value| {
        if let Some(p) = map.props.get(key) {
            out.push(json!({ "did": did, "siid": p.siid, "piid": p.piid, "value": value }));
        }
    };
    if let Some(on) = cmd.is_on {
        push("on", json!(on));
    }
    let scale = |p: Option<&PropRef>, pct: u8| -> Value {
        let (min, max) = p.map(|p| (p.min.unwrap_or(0.0), p.max.unwrap_or(100.0))).unwrap_or((0.0, 100.0));
        json!((min + (max - min) * pct.min(100) as f64 / 100.0).round() as i64)
    };
    if let Some(b) = cmd.brightness {
        let v = scale(map.props.get("brightness"), b);
        push("brightness", v);
    }
    if let Some(t) = cmd.color_temp {
        let v = scale(map.props.get("color_temp"), t);
        push("color_temp", v);
    }
    if let Some(hex) = &cmd.color {
        if let Some((r, g, b)) = hex_to_rgb(hex) {
            let int_val = ((r as u32) << 16) | ((g as u32) << 8) | (b as u32);
            push("color", json!(int_val));
        }
    }
    if let Some(speed) = &cmd.fan_speed {
        if let Some(p) = map.props.get("fan_level").cloned() {
            push("fan_level", enum_value(&p, speed));
        }
    }
    if let Some(mode) = &cmd.mode {
        if let Some(p) = map.props.get("mode").cloned() {
            push("mode", enum_value(&p, mode));
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    fn purifier_spec() -> Value {
        json!({ "services": [
            { "iid": 1, "type": "urn:miot-spec-v2:service:device-information:00007801:zhimi-ma4:1", "properties": [] },
            { "iid": 2, "type": "urn:miot-spec-v2:service:air-purifier:00007811:zhimi-ma4:1", "properties": [
                { "iid": 1, "type": "urn:miot-spec-v2:property:on:00000006:zhimi-ma4:1" },
                { "iid": 4, "type": "urn:miot-spec-v2:property:fan-level:00000016:zhimi-ma4:1",
                  "value-list": [{"value": 1, "description": "Level1"}, {"value": 2, "description": "Level2"}] },
                { "iid": 5, "type": "urn:miot-spec-v2:property:mode:00000008:zhimi-ma4:1",
                  "value-list": [{"value": 0, "description": "Auto"}, {"value": 1, "description": "Sleep"}] }
            ]},
            { "iid": 3, "type": "urn:miot-spec-v2:service:environment:0000780A:zhimi-ma4:1", "properties": [
                { "iid": 6, "type": "urn:miot-spec-v2:property:pm2.5-density:00000034:zhimi-ma4:1" }
            ]}
        ]})
    }

    fn light_spec() -> Value {
        json!({ "services": [
            { "iid": 1, "type": "urn:miot-spec-v2:service:device-information:00007801:yeelink-color:1", "properties": [] },
            { "iid": 2, "type": "urn:miot-spec-v2:service:light:00007802:yeelink-color:1", "properties": [
                { "iid": 1, "type": "urn:miot-spec-v2:property:on:00000006:yeelink-color:1" },
                { "iid": 2, "type": "urn:miot-spec-v2:property:brightness:0000000D:yeelink-color:1", "value-range": [1, 100, 1] },
                { "iid": 3, "type": "urn:miot-spec-v2:property:color-temperature:0000000F:yeelink-color:1", "value-range": [1700, 6500, 1] },
                { "iid": 4, "type": "urn:miot-spec-v2:property:color:0000000E:yeelink-color:1", "value-range": [0, 16777215, 1] }
            ]}
        ]})
    }

    #[test]
    fn maps_air_purifier() {
        let m = map_spec(&purifier_spec());
        assert_eq!(m.service, "air-purifier");
        assert_eq!(m.props["on"].siid, 2);
        assert_eq!(m.props["pm25"], PropRef { siid: 3, piid: 6, min: None, max: None, values: vec![] });

        let result = json!([
            {"did": "x|on", "siid": 2, "piid": 1, "code": 0, "value": true},
            {"did": "x|mode", "siid": 2, "piid": 5, "code": 0, "value": 1},
            {"did": "x|pm25", "siid": 3, "piid": 6, "code": 0, "value": 12}
        ]);
        let s = state_from(&m, &result);
        assert_eq!(s.is_on, Some(true));
        assert_eq!(s.mode.as_deref(), Some("Sleep"));
        assert_eq!(s.air_quality_pm25, Some(12.0));

        let cmd = DeviceCommand { mode: Some("auto".into()), ..Default::default() };
        assert_eq!(set_params("x", &m, &cmd)[0]["value"], 0);
        assert_eq!(device_type(&m.service, "zhimi.airpurifier.ma4"), DeviceType::AirPurifier);
    }

    #[test]
    fn maps_light_bulb() {
        let m = map_spec(&light_spec());
        assert_eq!(m.service, "light");
        assert_eq!(m.props["color"].siid, 2);
        assert_eq!(m.props["color"].piid, 4);

        let result = json!([
            {"did": "x|on", "siid": 2, "piid": 1, "code": 0, "value": true},
            {"did": "x|color", "siid": 2, "piid": 4, "code": 0, "value": 16711680}
        ]);
        let s = state_from(&m, &result);
        assert_eq!(s.is_on, Some(true));
        assert_eq!(s.color.as_deref(), Some("#ff0000"));
        assert_eq!(s.color_mode.as_deref(), Some("color"));

        let cmd = DeviceCommand { color: Some("#00ff00".into()), ..Default::default() };
        let params = set_params("x", &m, &cmd);
        assert_eq!(params.len(), 1);
        assert_eq!(params[0]["value"], 65280);
    }
}
