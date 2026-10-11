//! Shared domain model for Domus: device state, commands, automation rules and
//! the contract every integration plugin implements.

pub mod effects;

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
    Hue,
}

impl IntegrationType {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::Tuya => "tuya",
            Self::Tapo => "tapo",
            Self::Xiaomi => "xiaomi",
            Self::Mqtt => "mqtt",
            Self::Hue => "hue",
        }
    }

    pub fn parse(s: &str) -> Option<Self> {
        match s {
            "tuya" => Some(Self::Tuya),
            "tapo" => Some(Self::Tapo),
            "xiaomi" => Some(Self::Xiaomi),
            "mqtt" => Some(Self::Mqtt),
            "hue" => Some(Self::Hue),
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
    /// Hex color `#RRGGBB`
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color: Option<String>,
    /// Color mode ("color" or "white")
    #[serde(skip_serializing_if = "Option::is_none")]
    pub color_mode: Option<String>,
    /// Id of the light effect the device is playing (see `effects`), if any.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effect: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub temperature: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub humidity: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub air_quality_pm25: Option<f32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fan_speed: Option<String>,
    /// 0-100 %, for fans with a stepless speed instead of named levels.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub fan_percent: Option<u8>,
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
    pub color: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub color_mode: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fan_speed: Option<String>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub fan_percent: Option<u8>,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub mode: Option<String>,
    /// A mood or effect id from `effects`; an empty string stops a running effect.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub effect: Option<String>,
    /// Integration-native payload (e.g. Tuya DP codes), passed through as is.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub raw: Option<Value>,
}

impl DeviceCommand {
    pub fn is_empty(&self) -> bool {
        *self == Self::default()
    }

    /// A mood is only a preset: turn it into the plain white command it stands for,
    /// so every integration can show it. Effects and other commands pass through.
    pub fn resolved(&self) -> DeviceCommand {
        match self.effect.as_deref().and_then(effects::mood) {
            Some(m) => DeviceCommand {
                is_on: Some(true),
                brightness: Some(m.brightness),
                color_temp: Some(m.color_temp),
                color_mode: Some("white".into()),
                effect: None,
                ..self.clone()
            },
            None => self.clone(),
        }
    }

    /// Optimistically apply this command to a cached state.
    pub fn apply_to(&self, state: &mut DeviceState) {
        // A plain colour or white command ends a running effect.
        if self.color.is_some() || self.color_temp.is_some() || self.color_mode.is_some() {
            state.effect = None;
        }
        if let Some(id) = &self.effect {
            state.effect = (!id.is_empty()).then(|| id.clone());
            if !id.is_empty() {
                state.is_on = Some(true);
            }
        }
        if let Some(v) = self.is_on {
            state.is_on = Some(v);
        }
        if let Some(v) = self.brightness {
            state.brightness = Some(v.min(100));
        }
        if let Some(v) = self.color_temp {
            state.color_temp = Some(v.min(100));
        }
        if let Some(v) = &self.color {
            state.color = Some(v.clone());
        }
        if let Some(v) = &self.color_mode {
            state.color_mode = Some(v.clone());
        }
        if let Some(v) = &self.fan_speed {
            state.fan_speed = Some(v.clone());
        }
        if let Some(v) = self.fan_percent {
            state.fan_percent = Some(v.min(100));
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
    /// Last stored state, for integrations that only hear changes (MQTT).
    pub state: DeviceState,
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
    /// Fires at sunrise or sunset at the home's location, `offset_minutes` later (negative = earlier).
    Sun {
        event: SunEvent,
        #[serde(default)]
        offset_minutes: i32,
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

#[derive(Debug, Clone, Copy, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum SunEvent {
    Sunrise,
    Sunset,
}

/// Sunrise and sunset (UTC) on the day whose local noon is nearest `date` at the given place, east
/// longitude positive. None where the sun does not rise or set that day (polar day and night).
/// The "sunrise equation": good to about a minute, which is the scheduler's resolution.
pub fn sun_times(date: chrono::NaiveDate, latitude: f64, longitude: f64) -> Option<(chrono::DateTime<chrono::Utc>, chrono::DateTime<chrono::Utc>)> {
    use chrono::{Duration, NaiveDate, TimeZone, Utc};
    let epoch = NaiveDate::from_ymd_opt(2000, 1, 1)?;
    // Days since 2000-01-01 12:00 UTC of the mean solar noon here.
    let noon = (date - epoch).num_days() as f64 - longitude / 360.0;
    let anomaly = (357.5291 + 0.98560028 * noon).rem_euclid(360.0).to_radians();
    let center = 1.9148 * anomaly.sin() + 0.02 * (2.0 * anomaly).sin() + 0.0003 * (3.0 * anomaly).sin();
    let ecliptic = (anomaly.to_degrees() + center + 180.0 + 102.9372).rem_euclid(360.0).to_radians();
    let transit = noon + 0.0053 * anomaly.sin() - 0.0069 * (2.0 * ecliptic).sin();
    let declination = (ecliptic.sin() * 23.4397_f64.to_radians().sin()).asin();
    // -0.833 degrees: the sun's upper edge on the horizon, with refraction.
    let cos_hour = ((-0.833_f64).to_radians().sin() - latitude.to_radians().sin() * declination.sin())
        / (latitude.to_radians().cos() * declination.cos());
    if !(-1.0..=1.0).contains(&cos_hour) {
        return None;
    }
    let half_day = cos_hour.acos().to_degrees() / 360.0;
    let at = |days: f64| Utc.with_ymd_and_hms(2000, 1, 1, 12, 0, 0).unwrap() + Duration::seconds((days * 86_400.0).round() as i64);
    Some((at(transit - half_day), at(transit + half_day)))
}

/// Parse "HH:MM" into minutes since midnight.
pub fn parse_hhmm(s: &str) -> Option<u32> {
    let (h, m) = s.trim().split_once(':')?;
    let h: u32 = h.parse().ok()?;
    let m: u32 = m.parse().ok()?;
    (h < 24 && m < 60).then_some(h * 60 + m)
}

/// Parse a hex color string ("#RRGGBB", "RRGGBB", or "#RGB") into RGB (0-255).
pub fn hex_to_rgb(hex: &str) -> Option<(u8, u8, u8)> {
    let s = hex.trim().strip_prefix('#').unwrap_or(hex.trim());
    if s.len() == 6 {
        let r = u8::from_str_radix(&s[0..2], 16).ok()?;
        let g = u8::from_str_radix(&s[2..4], 16).ok()?;
        let b = u8::from_str_radix(&s[4..6], 16).ok()?;
        Some((r, g, b))
    } else if s.len() == 3 {
        let r = u8::from_str_radix(&s[0..1], 16).ok()?;
        let g = u8::from_str_radix(&s[1..2], 16).ok()?;
        let b = u8::from_str_radix(&s[2..3], 16).ok()?;
        Some((r * 17, g * 17, b * 17))
    } else {
        None
    }
}

/// Convert RGB components (0-255) to a lowercase hex string ("#rrggbb").
pub fn rgb_to_hex(r: u8, g: u8, b: u8) -> String {
    format!("#{r:02x}{g:02x}{b:02x}")
}

/// Convert RGB (0-255) to HSV: hue in [0.0, 360.0], saturation in [0.0, 1.0], value in [0.0, 1.0].
pub fn rgb_to_hsv(r: u8, g: u8, b: u8) -> (f64, f64, f64) {
    let rf = r as f64 / 255.0;
    let gf = g as f64 / 255.0;
    let bf = b as f64 / 255.0;
    let max = rf.max(gf).max(bf);
    let min = rf.min(gf).min(bf);
    let delta = max - min;

    let h = if delta == 0.0 {
        0.0
    } else if (max - rf).abs() < f64::EPSILON {
        let h = 60.0 * (((gf - bf) / delta) % 6.0);
        if h < 0.0 { h + 360.0 } else { h }
    } else if (max - gf).abs() < f64::EPSILON {
        60.0 * (((bf - rf) / delta) + 2.0)
    } else {
        60.0 * (((rf - gf) / delta) + 4.0)
    };

    let s = if max == 0.0 { 0.0 } else { delta / max };
    let v = max;

    (h, s, v)
}

/// Convert HSV (hue: [0.0, 360.0], saturation: [0.0, 1.0], value: [0.0, 1.0]) to RGB (0-255).
pub fn hsv_to_rgb(h: f64, s: f64, v: f64) -> (u8, u8, u8) {
    let s = s.clamp(0.0, 1.0);
    let v = v.clamp(0.0, 1.0);
    let h = (h % 360.0 + 360.0) % 360.0;

    let c = v * s;
    let x = c * (1.0 - (((h / 60.0) % 2.0) - 1.0).abs());
    let m = v - c;

    let (r1, g1, b1) = match (h / 60.0) as u32 {
        0 => (c, x, 0.0),
        1 => (x, c, 0.0),
        2 => (0.0, c, x),
        3 => (0.0, x, c),
        4 => (x, 0.0, c),
        _ => (c, 0.0, x),
    };

    let r = ((r1 + m) * 255.0).round().clamp(0.0, 255.0) as u8;
    let g = ((g1 + m) * 255.0).round().clamp(0.0, 255.0) as u8;
    let b = ((b1 + m) * 255.0).round().clamp(0.0, 255.0) as u8;

    (r, g, b)
}

/// Convert a hex color string ("#RRGGBB") to HSV.
pub fn hex_to_hsv(hex: &str) -> Option<(f64, f64, f64)> {
    let (r, g, b) = hex_to_rgb(hex)?;
    Some(rgb_to_hsv(r, g, b))
}

/// Convert HSV (hue: [0.0, 360.0], saturation: [0.0, 1.0], value: [0.0, 1.0]) to a hex color string.
pub fn hsv_to_hex(h: f64, s: f64, v: f64) -> String {
    let (r, g, b) = hsv_to_rgb(h, s, v);
    rgb_to_hex(r, g, b)
}

/// Pack RGB components into an integer: `(r << 16) | (g << 8) | b`.
pub fn rgb_to_int(r: u8, g: u8, b: u8) -> u32 {
    ((r as u32) << 16) | ((g as u32) << 8) | (b as u32)
}

/// Unpack an integer `(r << 16) | (g << 8) | b` into RGB components.
pub fn int_to_rgb(n: u32) -> (u8, u8, u8) {
    (((n >> 16) & 0xff) as u8, ((n >> 8) & 0xff) as u8, (n & 0xff) as u8)
}

/// Convert a hex color string to packed integer `(r << 16) | (g << 8) | b`.
pub fn hex_to_rgb_int(hex: &str) -> Option<u32> {
    let (r, g, b) = hex_to_rgb(hex)?;
    Some(rgb_to_int(r, g, b))
}

/// Convert packed integer `(r << 16) | (g << 8) | b` to a hex color string.
pub fn rgb_int_to_hex(n: u32) -> String {
    let (r, g, b) = int_to_rgb(n);
    rgb_to_hex(r, g, b)
}

#[cfg(test)]
mod sun_tests {
    use super::sun_times;
    use chrono::{NaiveDate, Timelike};

    #[test]
    fn the_equator_has_a_twelve_hour_day_at_the_equinox() {
        let (rise, set) = sun_times(NaiveDate::from_ymd_opt(2026, 3, 20).unwrap(), 0.0, 0.0).unwrap();
        let minutes = |t: chrono::DateTime<chrono::Utc>| (t.hour() * 60 + t.minute()) as i32;
        // Solar noon is about 12:07 UTC that day; refraction adds a few minutes at each end.
        assert!((minutes(rise) - (6 * 60 + 4)).abs() <= 3, "sunrise {rise}");
        assert!((minutes(set) - (18 * 60 + 11)).abs() <= 3, "sunset {set}");
    }

    #[test]
    fn pune_in_october() {
        // Around 06:27 and 18:11 IST (UTC+5:30) on 2026-10-11.
        let (rise, set) = sun_times(NaiveDate::from_ymd_opt(2026, 10, 11).unwrap(), 18.52, 73.86).unwrap();
        let ist = |t: chrono::DateTime<chrono::Utc>| ((t.hour() * 60 + t.minute()) as i32 + 330) % 1440;
        assert!((ist(rise) - (6 * 60 + 27)).abs() <= 4, "sunrise {rise}");
        assert!((ist(set) - (18 * 60 + 11)).abs() <= 4, "sunset {set}");
    }

    #[test]
    fn the_midnight_sun_never_sets() {
        assert!(sun_times(NaiveDate::from_ymd_opt(2026, 6, 21).unwrap(), 80.0, 20.0).is_none());
    }
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
    fn device_command_apply_to_color_and_mode() {
        let mut state = DeviceState::default();
        let cmd = DeviceCommand {
            color: Some("#ff5500".into()),
            color_mode: Some("color".into()),
            ..Default::default()
        };
        cmd.apply_to(&mut state);
        assert_eq!(state.color.as_deref(), Some("#ff5500"));
        assert_eq!(state.color_mode.as_deref(), Some("color"));
    }

    #[test]
    fn color_conversions() {
        assert_eq!(hex_to_rgb("#ff0000"), Some((255, 0, 0)));
        assert_eq!(hex_to_rgb("00ff00"), Some((0, 255, 0)));
        assert_eq!(hex_to_rgb("#00f"), Some((0, 0, 255)));
        assert_eq!(hex_to_rgb("invalid"), None);

        assert_eq!(rgb_to_hex(255, 0, 0), "#ff0000");

        let (h, s, v) = rgb_to_hsv(255, 0, 0);
        assert!((h - 0.0).abs() < 1e-4);
        assert!((s - 1.0).abs() < 1e-4);
        assert!((v - 1.0).abs() < 1e-4);

        let (r, g, b) = hsv_to_rgb(120.0, 1.0, 1.0);
        assert_eq!((r, g, b), (0, 255, 0));

        assert_eq!(hsv_to_hex(240.0, 1.0, 1.0), "#0000ff");
        assert_eq!(hex_to_rgb_int("#ff0000"), Some(0xff0000));
        assert_eq!(rgb_int_to_hex(0x00ff00), "#00ff00");
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
