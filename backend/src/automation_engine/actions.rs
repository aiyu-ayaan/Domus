use home_core::Action;
use tracing::info;

pub async fn execute_action(action: &Action) -> anyhow::Result<()> {
    match action {
        Action::SetDeviceState { device_id, properties } => {
            info!("Executing SetDeviceState for {}: {:?}", device_id, properties);
        }
        Action::PublishMqtt { topic, payload } => {
            info!("Publishing to MQTT {} => {}", topic, payload);
        }
        Action::SendNotification { title, body } => {
            info!("Sending Notification: [{}] {}", title, body);
        }
        Action::ExecuteScene { scene_id } => {
            info!("Executing scene: {}", scene_id);
        }
    }
    Ok(())
}
