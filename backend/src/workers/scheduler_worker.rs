use crate::automation_engine::AutomationEngine;
use chrono::{Local, Timelike, Utc};
use sqlx::SqlitePool;
use std::sync::Arc;
use std::time::Duration;

/// Fires time-based automations once per minute and prunes old energy samples.
pub struct SchedulerWorker {
    engine: Arc<AutomationEngine>,
    pool: SqlitePool,
    retention_days: i64,
}

impl SchedulerWorker {
    pub fn new(engine: Arc<AutomationEngine>, pool: SqlitePool, retention_days: i64) -> Self {
        Self { engine, pool, retention_days }
    }

    pub async fn run(self) {
        tracing::info!("Scheduler started");
        let mut last_minute = None;
        loop {
            // Wake just after each minute boundary.
            let secs = 60 - Local::now().second() as u64;
            tokio::time::sleep(Duration::from_secs(secs.max(1))).await;
            let now = Local::now();
            let minute = now.with_second(0).and_then(|t| t.with_nanosecond(0));
            if minute == last_minute {
                continue;
            }
            last_minute = minute;
            self.engine.tick(now).await;

            if now.hour() == 3 && now.minute() == 0 {
                let cutoff = Utc::now() - chrono::Duration::days(self.retention_days);
                let _ = sqlx::query("DELETE FROM energy_metrics WHERE recorded_at < ?")
                    .bind(cutoff)
                    .execute(&self.pool)
                    .await;
                let _ = sqlx::query("DELETE FROM device_events WHERE at < ?")
                    .bind(cutoff)
                    .execute(&self.pool)
                    .await;
                let _ = sqlx::query("DELETE FROM air_metrics WHERE recorded_at < ?")
                    .bind(cutoff)
                    .execute(&self.pool)
                    .await;
                let _ = sqlx::query("DELETE FROM notifications WHERE created_at < ?")
                    .bind(Utc::now() - chrono::Duration::days(30))
                    .execute(&self.pool)
                    .await;
            }
        }
    }
}
