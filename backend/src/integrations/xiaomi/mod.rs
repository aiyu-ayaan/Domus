use home_core::{Device, DeviceState, IntegrationPlugin, IntegrationType, Result};
use uuid::Uuid;

pub struct XiaomiIntegration {
    pub enabled: bool,
}

impl XiaomiIntegration {
    pub fn new(enabled: bool) -> Self {
        Self { enabled }
    }
}

#[async_trait::async_trait]
impl IntegrationPlugin for XiaomiIntegration {
    fn integration_type(&self) -> IntegrationType {
        IntegrationType::Xiaomi
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
