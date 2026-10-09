use home_core::{Device, DeviceState, IntegrationPlugin, IntegrationType, Result};
use uuid::Uuid;

pub struct MqttIntegration;

#[async_trait::async_trait]
impl IntegrationPlugin for MqttIntegration {
    fn integration_type(&self) -> IntegrationType {
        IntegrationType::Mqtt
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
