use sqlx::sqlite::{SqliteConnectOptions, SqliteJournalMode, SqlitePool, SqlitePoolOptions};
use std::str::FromStr;
use std::time::Duration;

pub async fn init_pool(database_url: &str, max_connections: u32) -> anyhow::Result<SqlitePool> {
    let options = SqliteConnectOptions::from_str(database_url)?
        .create_if_missing(true)
        .journal_mode(SqliteJournalMode::Wal)
        .foreign_keys(true)
        .busy_timeout(Duration::from_secs(5));

    let pool = SqlitePoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(Duration::from_secs(5))
        .connect_with(options)
        .await?;

    tracing::info!("Running database migrations...");
    sqlx::migrate!("../migrations").run(&pool).await?;

    Ok(pool)
}

/// Read a JSON value from `app_settings`.
pub async fn get_setting<T: serde::de::DeserializeOwned>(pool: &SqlitePool, key: &str) -> Option<T> {
    let row: Option<(String,)> = sqlx::query_as("SELECT value_json FROM app_settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .ok()?;
    row.and_then(|(v,)| serde_json::from_str(&v).ok())
}

pub async fn set_setting<T: serde::Serialize>(pool: &SqlitePool, key: &str, value: &T) -> sqlx::Result<()> {
    let json = serde_json::to_string(value).unwrap_or_else(|_| "null".into());
    sqlx::query(
        "INSERT INTO app_settings (key, value_json) VALUES (?, ?)
         ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json",
    )
    .bind(key)
    .bind(json)
    .execute(pool)
    .await?;
    Ok(())
}
