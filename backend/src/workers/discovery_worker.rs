use crate::integrations::DeviceManager;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// Runs background discovery when it is enabled in the discovery settings.
pub struct DiscoveryWorker {
    manager: Arc<DeviceManager>,
}

impl DiscoveryWorker {
    pub fn new(manager: Arc<DeviceManager>) -> Self {
        Self { manager }
    }

    pub async fn run(self) {
        tracing::info!("Discovery worker started");
        // First scan shortly after start-up; settings are re-read every loop so
        // changes from the UI apply without a restart.
        let mut next = Instant::now() + Duration::from_secs(10);
        loop {
            tokio::time::sleep(Duration::from_secs(5)).await;
            if Instant::now() < next {
                continue;
            }
            let settings = self.manager.settings().await;
            next = Instant::now() + Duration::from_secs(settings.interval_minutes.max(1) * 60);
            if !settings.enabled {
                continue;
            }
            match self.manager.discover().await {
                Ok(r) => tracing::info!("Discovery: {} found, {} new, {} added", r.found, r.new, r.adopted),
                Err(e) => tracing::debug!("Discovery skipped: {e}"),
            }
        }
    }
}
