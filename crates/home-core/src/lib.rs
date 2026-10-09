use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use uuid::Uuid;

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
    #[error("Internal error: {0}")]
    Internal(String),
}

pub type Result<T> = std::result::Result<T, CoreError>;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum Role {
    Admin,
    Member,
    Guest,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct User {
    pub id: Uuid,
    pub username: String,
    pub email: String,
    pub role: Role,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Room {
    pub id: Uuid,
    pub name: String,
    pub icon: Option<String>,
    pub floor: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum IntegrationType {
    Tuya,
    Tapo,
    Xiaomi,
    Mqtt,
    Zigbee,
    Esp32,
    Virtual,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "snake_case")]
pub enum DeviceType {
    Switch,
    Light,
    Plug,
    AirPurifier,
    Sensor,
    Climate,
    Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
pub struct DeviceState {
    pub is_on: Option<bool>,
    pub brightness: Option<u8>,
    pub color_temp: Option<u32>,
    pub temperature: Option<f32>,
    pub humidity: Option<f32>,
    pub air_quality_pm25: Option<f32>,
    pub fan_speed: Option<String>,
    pub current_power_watts: Option<f32>,
    pub total_energy_kwh: Option<f32>,
    #[serde(flatten)]
    pub custom: HashMap<String, serde_json::Value>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Device {
    pub id: Uuid,
    pub name: String,
    pub room_id: Option<Uuid>,
    pub integration_type: IntegrationType,
    pub device_type: DeviceType,
    pub model: Option<String>,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
    pub is_online: bool,
    pub state: DeviceState,
    pub config: HashMap<String, serde_json::Value>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DeviceGroup {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub device_ids: Vec<Uuid>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EnergyMetric {
    pub id: Uuid,
    pub device_id: Uuid,
    pub power_watts: f32,
    pub energy_kwh: f32,
    pub voltage: Option<f32>,
    pub current_amps: Option<f32>,
    pub recorded_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ElectricitySettings {
    pub id: Uuid,
    pub rate_per_kwh: f64,
    pub currency: String,
    pub monthly_budget: Option<f64>,
    pub billing_cycle_day: u32,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum Trigger {
    DeviceStateChanged {
        device_id: Uuid,
        property: String,
    },
    TimeSchedule {
        cron: String,
    },
    MqttMessage {
        topic: String,
    },
    EnergyThreshold {
        device_id: Uuid,
        watts_greater_than: f32,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum Condition {
    DeviceIsOn { device_id: Uuid, state: bool },
    TimeBetween { start: String, end: String },
    PowerExceeds { device_id: Uuid, threshold_watts: f32 },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(tag = "type", content = "payload")]
pub enum Action {
    SetDeviceState {
        device_id: Uuid,
        properties: HashMap<String, serde_json::Value>,
    },
    PublishMqtt {
        topic: String,
        payload: String,
    },
    SendNotification {
        title: String,
        body: String,
    },
    ExecuteScene {
        scene_id: Uuid,
    },
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Automation {
    pub id: Uuid,
    pub name: String,
    pub description: Option<String>,
    pub triggers: Vec<Trigger>,
    pub conditions: Vec<Condition>,
    pub actions: Vec<Action>,
    pub is_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Scene {
    pub id: Uuid,
    pub name: String,
    pub icon: Option<String>,
    pub actions: Vec<Action>,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[async_trait::async_trait]
pub trait IntegrationPlugin: Send + Sync {
    fn integration_type(&self) -> IntegrationType;
    async fn discover_devices(&self) -> Result<Vec<Device>>;
    async fn send_command(&self, device_id: &Uuid, command: &str, params: serde_json::Value) -> Result<()>;
    async fn sync_state(&self, device_id: &Uuid) -> Result<DeviceState>;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_device_state_serialization() {
        let state = DeviceState {
            is_on: Some(true),
            brightness: Some(75),
            current_power_watts: Some(120.5),
            ..Default::default()
        };

        let json = serde_json::to_string(&state).unwrap();
        assert!(json.contains("\"is_on\":true"));
        assert!(json.contains("120.5"));
    }
}
