use crate::infrastructure::event_bus::EventBus;
use std::time::Duration;
use tracing::info;

pub struct DeviceWorker {
    _event_bus: EventBus,
}

impl DeviceWorker {
    pub fn new(event_bus: EventBus) -> Self {
        Self { _event_bus: event_bus }
    }

    pub async fn run(self) {
        info!("Device polling & heartbeat worker started.");
        loop {
            tokio::time::sleep(Duration::from_secs(30)).await;
            // Poll periodic status / offline checks
        }
    }
}
