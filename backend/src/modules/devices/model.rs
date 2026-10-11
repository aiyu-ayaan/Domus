use chrono::{DateTime, Utc};
use home_core::DeviceState;
use serde::{Deserialize, Serialize};
use serde_json::Value;

#[derive(Debug, Clone, sqlx::FromRow)]
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
    pub external_id: Option<String>,
    pub account_id: Option<String>,
    pub secrets_enc: Option<String>,
    pub icon: Option<String>,
    pub last_seen: Option<DateTime<Utc>>,
}

impl DeviceRecord {
    pub fn state(&self) -> DeviceState {
        serde_json::from_str(&self.state_json).unwrap_or_default()
    }

    pub fn config(&self) -> Value {
        serde_json::from_str(&self.config_json).unwrap_or(Value::Null)
    }

    pub fn to_dto(&self) -> DeviceDto {
        DeviceDto {
            id: self.id.clone(),
            name: self.name.clone(),
            room_id: self.room_id.clone(),
            integration_type: self.integration_type.clone(),
            device_type: self.device_type.clone(),
            model: self.model.clone(),
            ip_address: self.ip_address.clone(),
            mac_address: self.mac_address.clone(),
            icon: self.icon.clone(),
            is_online: self.is_online,
            state: self.state(),
            last_seen: self.last_seen,
            created_at: self.created_at,
            can_control: true,
            can_edit: true,
        }
    }
}

/// API shape — never includes config or secrets.
#[derive(Debug, Clone, Serialize)]
pub struct DeviceDto {
    pub id: String,
    pub name: String,
    pub room_id: Option<String>,
    pub integration_type: String,
    pub device_type: String,
    pub model: Option<String>,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
    pub icon: Option<String>,
    pub is_online: bool,
    pub state: DeviceState,
    pub last_seen: Option<DateTime<Utc>>,
    pub created_at: DateTime<Utc>,
    /// Whether the user asking may operate the device (false for guests and see-only grants).
    pub can_control: bool,
    /// Whether it may rename the device (administrators, and edit grants).
    pub can_edit: bool,
}

#[derive(Debug, Deserialize)]
pub struct UpdateDeviceRequest {
    pub name: Option<String>,
    /// `Some(None)` clears the room.
    #[serde(default, with = "double_option")]
    pub room_id: Option<Option<String>>,
    #[serde(default, with = "double_option")]
    pub icon: Option<Option<String>>,
}

#[derive(Debug, Deserialize)]
pub struct ManualAddRequest {
    pub integration_type: String,
    pub host: String,
    #[serde(default)]
    pub token: Option<String>,
    pub name: Option<String>,
    pub room_id: Option<String>,
}

#[derive(Debug, Clone, sqlx::FromRow, Serialize)]
pub struct DiscoveryRecord {
    pub id: String,
    pub integration_type: String,
    pub external_id: String,
    pub account_id: Option<String>,
    pub name: String,
    pub device_type: String,
    pub model: Option<String>,
    pub ip_address: Option<String>,
    pub mac_address: Option<String>,
    #[serde(skip)]
    pub config_json: String,
    #[serde(skip)]
    pub secrets_enc: Option<String>,
    pub note: Option<String>,
    pub status: String,
    pub discovered_at: DateTime<Utc>,
    pub last_seen: DateTime<Utc>,
}

#[derive(Debug, Default, Deserialize)]
pub struct AdoptRequest {
    pub name: Option<String>,
    pub room_id: Option<String>,
    /// e.g. a miIO token for devices discovered on the LAN only.
    pub token: Option<String>,
}

/// Distinguish "field absent" from "field: null" in PATCH bodies.
mod double_option {
    use serde::{Deserialize, Deserializer};

    pub fn deserialize<'de, D, T>(d: D) -> Result<Option<Option<T>>, D::Error>
    where
        D: Deserializer<'de>,
        T: Deserialize<'de>,
    {
        Option::<T>::deserialize(d).map(Some)
    }
}
