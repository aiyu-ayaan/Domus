use std::time::Duration;
use tracing::info;

pub struct SchedulerWorker;

impl SchedulerWorker {
    pub fn new() -> Self {
        Self
    }

    pub async fn run(self) {
        info!("Scheduler worker started.");
        loop {
            tokio::time::sleep(Duration::from_secs(60)).await;
            // Check scheduled automations
        }
    }
}

impl Default for SchedulerWorker {
    fn default() -> Self {
        Self::new()
    }
}
