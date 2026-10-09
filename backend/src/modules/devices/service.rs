use super::model::{CreateDeviceRequest, DeviceRecord, UpdateDeviceStateRequest};
use super::repository::DeviceRepository;
use crate::api::error::ApiError;
use crate::infrastructure::event_bus::{EventBus, SystemEvent};
use chrono::Utc;
use home_core::DeviceState;
use uuid::Uuid;

pub struct DeviceService {
    repo: DeviceRepository,
    event_bus: EventBus,
}

impl DeviceService {
    pub fn new(repo: DeviceRepository, event_bus: EventBus) -> Self {
        Self { repo, event_bus }
    }

    pub async fn list_devices(&self) -> Result<Vec<DeviceRecord>, ApiError> {
        self.repo.list_all().await.map_err(|e| ApiError::Internal(e.to_string()))
    }

    pub async fn get_device(&self, id: &str) -> Result<DeviceRecord, ApiError> {
        self.repo
            .find_by_id(id)
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?
            .ok_or_else(|| ApiError::NotFound(format!("Device {} not found", id)))
    }

    pub async fn create_device(&self, req: CreateDeviceRequest) -> Result<DeviceRecord, ApiError> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        let record = DeviceRecord {
            id: id.clone(),
            name: req.name,
            room_id: req.room_id,
            integration_type: req.integration_type,
            device_type: req.device_type,
            model: req.model,
            ip_address: req.ip_address,
            mac_address: req.mac_address,
            config_json: "{}".to_string(),
            state_json: "{}".to_string(),
            is_online: true,
            created_at: now,
            updated_at: now,
        };

        self.repo.create(&record).await.map_err(|e| ApiError::Internal(e.to_string()))?;

        self.event_bus.publish(SystemEvent::DeviceDiscovered {
            device_id: Uuid::parse_str(&id).unwrap_or_default(),
            name: record.name.clone(),
            integration: record.integration_type.clone(),
        });

        Ok(record)
    }

    pub async fn update_state(&self, id: &str, req: UpdateDeviceStateRequest) -> Result<(), ApiError> {
        let state_str = serde_json::to_string(&req.state).map_err(|e| ApiError::BadRequest(e.to_string()))?;
        self.repo.update_state(id, &state_str).await.map_err(|e| ApiError::Internal(e.to_string()))?;

        if let Ok(parsed_uuid) = Uuid::parse_str(id) {
            let state: DeviceState = serde_json::from_value(req.state).unwrap_or_default();
            self.event_bus.publish(SystemEvent::DeviceStateChanged {
                device_id: parsed_uuid,
                new_state: state,
            });
        }

        Ok(())
    }

    pub async fn delete_device(&self, id: &str) -> Result<(), ApiError> {
        self.repo.delete(id).await.map_err(|e| ApiError::Internal(e.to_string()))
    }
}
