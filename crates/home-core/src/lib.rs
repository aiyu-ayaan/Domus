//! Shared domain model for Docus: device state, commands, automation rules and
//! the contract every integration plugin implements.

use serde::{Deserialize, Serialize};
use serde_json::Value;
use std::collections::HashMap;

#[derive(Debug, thiserror::Error)]
pub enum CoreError {
    #[error("Entity not found: {0}")]
    NotFound(String),
    #[error("Validation failed: {0}")]
    ValidationError(String),
    #[error("Authentication error: {0}")]
    AuthError(String),
    #[error("Integration error: {0}")]
    IntegrationError(String),
    #[error("Not supported: {0}")]
    Unsupported(String),
    #[error("Internal error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, CoreError>;

pub fn integration_err(e: impl std::fmt::Display) -> CoreError {
    CoreError::IntegrationError(e.to_string())
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Admin,
    Member,
    Guest,
}

impl Role {
    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "admin" => Some(Self::Admin),
            "member" => Some(Self::Member),
            "guest" => Some(Self::Guest),
            _ => None,
        }
    }

    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Admin => "admin",
            Self::Member => "member",
            Self::Guest => "guest",
        }
    }

    pub fn can_control(&self) -> bool {
        !matches!(self, Self::Guest)
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum IntegrationType {
    Tuya,
    Tapo,
    Xiaomi,
    Mqtt,
    Virtual,
}

impl IntegrationType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Tuya => "tuya",
            Self::Tapo => "tapo",
            Self::Xiaomi => "xiaomi",
            Self::Mqtt => "mqtt",
            Self::Virtual => "virtual",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "tuya" => Some(Self::Tuya),
            "tapo" => Some(Self::Tapo),
            "xiaomi" => Some(Self::Xiaomi),
            "mqtt" => Some(Self::Mqtt),
            "virtual" => Some(Self::Virtual),
            _ => None,
        }
    }
}

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq, Eq, Hash)]
#[serde(rename_all = "snake_case")]
pub enum DeviceType {
    Switch,
    Plug,
    Light,
    AirPurifier,
    Fan,
    Sensor,
    Climate,
    Cover,
    Other,
}

impl DeviceType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Switch => "switch",
            Self::Plug => "plug",
            Self::Light => "light",
            Self::AirPurifier => "air_purifier",
            Self::Fan => "fan",
            Self::Sensor => "sensor",
            Self::Climate => "climate",
            Self::Cover => "cover",
            Self::Other => "other",
        }
    }

    pub fn parse(s: &str) -> Self {
        match s {
            "switch" => Self::Switch,
            "plug" => Self::Plug,
            "light" => Self::Light,
            "air_purifier" => Self::AirPurifier,
            "fan" => Self::Fan,
            "sensor" => Self::Sensor,
            "climate" => Self::Climate,
            "cover" => Self::Cover,
            _ => Self::Other,
        }
    }
}

/// Normalised device state. Integrations map their native data points onto
/// these fields; anything without a common meaning goes into `extra`.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct DeviceState {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub is_on: Option<bool>,
    /// 0-100 %
    #[serde(skip_serializing_if = "Option::is_none")]
    pub brightness: Option<u8>,
    /// 0-100 % (warm -> cold)
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_temp: Option<u8>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub humidity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_quality_pm25: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fan_speed: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub filter_life: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_power_watts: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub voltage: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub current_amps: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub today_energy_kwh: Option<f32>,
    /// Option lists the UI can offer (e.g. `fan_speed`, `mode`).
    #[serde(default, skip_serializing_if = "HashMap::is_empty")]
    pub options: HashMap<String, Vec<String>>,
    #[serde(flatten)]
    pub extra: HashMap<String, Value>,
}

impl DeviceState {
    /// Look up a property by name, as used by automation triggers/conditions.
    pub fn property(&self, name: &str) -> Option<Value> {
        let v = serde_json::to_value(self).ok()?;
        v.get(name).cloned().filter(|v| !v.is_null())
    }
}

/// A command sent to a device. Only the set fields are applied.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct DeviceCommand {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub is_on: Option<bool>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub brightness: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color_temp: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fan_speed: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    /// Integration-native payload (e.g. Tuya DP codes), passed through as is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw: Option<Value>,
}

impl DeviceCommand {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    /// Optimistically apply this command to a cached state.
    pub fn apply_to(&self, state: &mut DeviceState) {
        if let Some(v) = self.is_on {
            state.is_on = Some(v);
        }
        if let Some(v) = self.brightness {
            state.brightness = Some(v.min(100));
        }
        if let Some(v) = self.color_temp {
            state.color_temp = Some(v.min(100));
        }
        if let Some(v) = &self.fan_speed {
            state.fan_speed = Some(v.clone());
        }
        if let Some(v) = &self.mode {
            state.mode = Some(v.clone());
        }
    }
}

/// A device found by an integration, before or after adoption.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DiscoveredDevice {
    /// Stable id inside the integration (Tuya device id, Tapo device_id, miIO did).
    pub external_id: String,
    pub name: String,
    pub device_type: DeviceType,
    pub model: Option<String>,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
    /// Account the device was discovered through, if any.
    pub account_id: Option<String>,
    pub online: bool,
    /// Non-secret integration config (DP specs, MIoT mapping, ...).
    pub config: Value,
    /// Secret material (local keys, tokens). Encrypted at rest.
    pub secrets: Value,
    /// Set when the device was found but cannot be adopted yet (e.g. missing token).
    pub note: Option<String>,
    pub state: Option<DeviceState>,
}

/// Decrypted account credentials for an integration.
#[derive(Debug, Clone)]
pub struct AccountContext {
    pub id: String,
    pub credentials: Value,
}

/// Everything an integration needs to talk to an adopted device.
#[derive(Debug, Clone)]
pub struct DeviceContext {
    pub device_id: String,
    pub external_id: String,
    pub device_type: DeviceType,
    pub model: Option<String>,
    pub ip_address: Option<String>,
    pub config: Value,
    pub secrets: Value,
    pub account: Option<AccountContext>,
}

#[derive(Debug, Clone)]
pub struct PolledState {
    pub online: bool,
    pub state: DeviceState,
    /// Updated IP, if the integration learned a new one.
    pub ip_address: Option<String>,
}

/// Lets integrations persist refreshed credentials (e.g. rotated OAuth tokens).
#[async_trait::async_trait]
pub trait CredentialStore: Send + Sync {
    async fn save_credentials(&self, account_id: &str, credentials: &Value) -> Result<()>;
}

#[async_trait::async_trait]
pub trait IntegrationPlugin: Send + Sync {
    fn integration_type(&self) -> IntegrationType;

    /// Find devices. Called periodically by the discovery worker.
    async fn discover(&self, accounts: &[AccountContext]) -> Result<Vec<DiscoveredDevice>>;

    /// Add a device by address when broadcast discovery cannot reach it.
    async fn probe(
        &self,
        _host: &str,
        _secrets: &Value,
        _accounts: &[AccountContext],
    ) -> Result<DiscoveredDevice> {
        Err(CoreError::Unsupported("manual add".into()))
    }

    /// Fetch state for a batch of devices. Integrations with a cloud API can
    /// answer the whole batch in one round-trip.
    async fn fetch_states(&self, devices: &[DeviceContext]) -> HashMap<String, Result<PolledState>> {
        let mut out = HashMap::new();
        for d in devices {
            out.insert(d.device_id.clone(), self.fetch_state(d).await);
        }
        out
    }

    async fn fetch_state(&self, device: &DeviceContext) -> Result<PolledState>;

    async fn send_command(&self, device: &DeviceContext, command: &DeviceCommand) -> Result<()>;
}

// ---------------------------------------------------------------------------
// Automations
// ---------------------------------------------------------------------------

/// Comparison used by state triggers and conditions.
#[derive(Debug, Clone, Serialize, Deserialize, Default, PartialEq)]
pub struct Comparison {
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub equals: Option<Value>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub above: Option<f64>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub below: Option<f64>,
}

impl Comparison {
    pub fn matches(&self, value: Option<&Value>) -> bool {
        let Some(value) = value else { return false };
        if let Some(eq) = &self.equals {
            if !values_equal(eq, value) {
                return false;
            }
        }
        let num = value.as_f64();
        if let Some(a) = self.above {
            if !num.is_some_and(|n| n > a) {
                return false;
            }
        }
        if let Some(b) = self.below {
            if !num.is_some_and(|n| n < b) {
                return false;
            }
        }
        true
    }
}

fn values_equal(a: &Value, b: &Value) -> bool {
    match (a.as_f64(), b.as_f64()) {
        (Some(x), Some(y)) => (x - y).abs() < f64::EPSILON,
        _ => a == b,
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Trigger {
    /// Fires when `property` starts matching the comparison.
    DeviceState {
        device_id: String,
        property: String,
        #[serde(flatten)]
        compare: Comparison,
    },
    /// Fires at `at` ("HH:MM", server local time) on the given weekdays (0 = Monday). Empty = every day.
    Time {
        at: String,
        #[serde(default)]
        days: Vec<u8>,
    },
    /// Fires when a device's power draw rises above `watts`.
    PowerAbove { device_id: String, watts: f64 },
    /// Fires when a new device is discovered.
    DeviceDiscovered,
    /// Fires when a device goes offline.
    DeviceOffline { device_id: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Condition {
    DeviceState {
        device_id: String,
        property: String,
        #[serde(flatten)]
        compare: Comparison,
    },
    /// "HH:MM" local time window; may wrap midnight.
    TimeBetween { start: String, end: String },
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "type", rename_all = "snake_case")]
pub enum Action {
    DeviceCommand {
        device_id: String,
        command: DeviceCommand,
    },
    GroupCommand {
        group_id: String,
        command: DeviceCommand,
    },
    Notify {
        title: String,
        message: String,
    },
    Scene {
        scene_id: String,
    },
    Delay {
        seconds: u64,
    },
}

/// Parse "HH:MM" into minutes since midnight.
pub fn parse_hhmm(s: &str) -> Option<u32> {
    let (h, m) = s.trim().split_once(':')?;
    let h: u32 = h.parse().ok()?;
    let m: u32 = m.parse().ok()?;
    (h < 24 && m < 60).then_some(h * 60 + m)
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn device_state_skips_empty_fields() {
        let state = DeviceState {
            is_on: Some(true),
            current_power_watts: Some(120.5),
            ..Default::default()
        };
        let json = serde_json::to_string(&state).unwrap();
        assert_eq!(json, r#"{"is_on":true,"current_power_watts":120.5}"#);
    }

    #[test]
    fn comparison_matches_numbers_and_values() {
        let c = Comparison { above: Some(10.0), ..Default::default() };
        assert!(c.matches(Some(&json!(11))));
        assert!(!c.matches(Some(&json!(9.5))));
        let eq = Comparison { equals: Some(json!(true)), ..Default::default() };
        assert!(eq.matches(Some(&json!(true))));
        assert!(!eq.matches(None));
    }

    #[test]
    fn trigger_roundtrip() {
        let t: Trigger = serde_json::from_value(json!({
            "type": "device_state", "device_id": "d1", "property": "is_on", "equals": true
        }))
        .unwrap();
        assert!(matches!(t, Trigger::DeviceState { ref compare, .. } if compare.equals == Some(json!(true))));
    }

    #[test]
    fn hhmm() {
        assert_eq!(parse_hhmm("07:30"), Some(450));
        assert_eq!(parse_hhmm("24:00"), None);
    }
}
