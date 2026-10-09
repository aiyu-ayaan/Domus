use crate::integrations::DeviceManager;
use std::sync::Arc;
use std::time::Duration;

/// Polls every adopted device on a fixed interval.
pub struct DeviceWorker {
    manager: Arc<DeviceManager>,
    interval: Duration,
}

impl DeviceWorker {
    pub fn new(manager: Arc<DeviceManager>, interval: Duration) -> Self {
        Self { manager, interval }
    }

    pub async fn run(self) {
        tracing::info!("Device poller started ({}s interval)", self.interval.as_secs());
        let mut tick = tokio::time::interval(self.interval);
        tick.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
        loop {
            tick.tick().await;
            self.manager.poll_all().await;
        }
    }
}
