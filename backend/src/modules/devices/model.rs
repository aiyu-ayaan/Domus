use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct DeviceRecord {
    pub id: String,
    pub name: String,
    pub room_id: Option<String>,
    pub integration_type: String,
    pub device_type: String,
    pub model: Option<String>,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
    pub config_json: String,
    pub state_json: String,
    pub is_online: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateDeviceRequest {
    pub name: String,
    pub room_id: Option<String>,
    pub integration_type: String,
    pub device_type: String,
    pub model: Option<String>,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDeviceStateRequest {
    pub state: serde_json::Value,
}
