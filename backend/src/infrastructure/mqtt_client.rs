use crate::config::MqttConfig;
use crate::infrastructure::event_bus::EventBus;
use rumqttc::{AsyncClient, MqttOptions, QoS};
use std::time::Duration;
use tracing::{info, warn};

pub struct MqttService {
    client: AsyncClient,
}

impl MqttService {
    pub async fn start(config: &MqttConfig, _event_bus: EventBus) -> anyhow::Result<Self> {
        let mut mqttoptions = MqttOptions::new(&config.client_id, &config.host, config.port);
        mqttoptions.set_keep_alive(Duration::from_secs(config.keep_alive_secs));

        let (client, mut eventloop) = AsyncClient::new(mqttoptions, 10);

        // Run MQTT eventloop in background
        tokio::spawn(async move {
            loop {
                match eventloop.poll().await {
                    Ok(notification) => {
                        tracing::trace!("MQTT event: {:?}", notification);
                    }
                    Err(e) => {
                        warn!("MQTT connection error: {}. Retrying in 5s...", e);
                        tokio::time::sleep(Duration::from_secs(5)).await;
                    }
                }
            }
        });

        info!("MQTT client started for broker at {}:{}", config.host, config.port);
        Ok(Self { client })
    }

    pub async fn publish(&self, topic: &str, payload: &[u8]) -> anyhow::Result<()> {
        self.client
            .publish(topic, QoS::AtLeastOnce, false, payload)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to publish MQTT message: {}", e))
    }

    pub async fn subscribe(&self, topic: &str) -> anyhow::Result<()> {
        self.client
            .subscribe(topic, QoS::AtLeastOnce)
            .await
            .map_err(|e| anyhow::anyhow!("Failed to subscribe to MQTT topic: {}", e))
    }
}
