use sqlx::sqlite::{SqlitePool, SqlitePoolOptions};
use std::time::Duration;

pub async fn init_pool(database_url: &str, max_connections: u32) -> anyhow::Result<SqlitePool> {
    let pool = SqlitePoolOptions::new()
        .max_connections(max_connections)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await?;

    run_migrations(&pool).await?;

    Ok(pool)
}

pub async fn run_migrations(pool: &SqlitePool) -> anyhow::Result<()> {
    tracing::info!("Initializing SQLite database schema...");
    let schema = include_str!("../../../migrations/0001_initial_schema.sql");
    sqlx::query(schema).execute(pool).await?;
    tracing::info!("Database schema initialized successfully.");
    Ok(())
}
