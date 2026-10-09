use crate::integrations::DeviceManager;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Polls adopted devices: local ones every tick, cloud ones on a slower cadence.
pub struct DeviceWorker {
    manager: Arc<DeviceManager>,
    interval: Duration,
    cloud_interval: Duration,
}

impl DeviceWorker {
    pub fn new(manager: Arc<DeviceManager>, interval: Duration, cloud_interval: Duration) -> Self {
        Self { manager, interval, cloud_interval }
    }

    pub async fn run(self) {
        tracing::info!(
            "Device poller started (local {}s, cloud {}s)",
            self.interval.as_secs(),
            self.cloud_interval.as_secs()
        );
        let mut tick = tokio::time::interval(self.interval);
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        let mut last_cloud: Option<Instant> = None;
        loop {
            tick.tick().await;
            let cloud = last_cloud.is_none_or(|t| t.elapsed() >= self.cloud_interval);
            if cloud {
                last_cloud = Some(Instant::now());
            }
            self.manager.poll_all(cloud).await;
        }
    }
}
