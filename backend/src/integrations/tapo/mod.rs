use home_core::{Device, DeviceState, IntegrationPlugin, IntegrationType, Result};
use uuid::Uuid;

pub struct TapoIntegration {
    pub enabled: bool,
}

impl TapoIntegration {
    pub fn new(enabled: bool) -> Self {
        Self { enabled }
    }
}

#[async_trait::async_trait]
impl IntegrationPlugin for TapoIntegration {
    fn integration_type(&self) -> IntegrationType {
        IntegrationType::Tapo
    }

    async fn discover_devices(&self) -> Result<Vec<Device>> {
        Ok(vec![])
    }

    async fn send_command(&self, _device_id: &Uuid, _command: &str, _params: serde_json::Value) -> Result<()> {
        Ok(())
    }

    async fn sync_state(&self, _device_id: &Uuid) -> Result<DeviceState> {
        Ok(DeviceState::default())
    }
}
