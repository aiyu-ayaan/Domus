use serde::Deserialize;
use std::path::PathBuf;

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub env: String,
    /// Directory for the database, master key, JWT secret and TLS material.
    pub data_dir: PathBuf,
    /// Built web UI to serve (SPA). Ignored when the directory does not exist.
    pub web_dir: PathBuf,
}

#[derive(Debug, Clone, Deserialize)]
pub struct TlsConfig {
    pub enabled: bool,
    /// PEM paths; when empty a self-signed certificate is generated in `data_dir/tls`.
    pub cert_path: Option<PathBuf>,
    pub key_path: Option<PathBuf>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    /// Empty = `sqlite://<data_dir>/domus.db`.
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SecurityConfig {
    /// Empty = generated once and stored in `data_dir/jwt.secret`.
    pub jwt_secret: String,
    pub token_expiry_hours: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IntegrationConfig {
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IntegrationsConfig {
    pub tuya: IntegrationConfig,
    pub tapo: IntegrationConfig,
    pub xiaomi: IntegrationConfig,
    pub mqtt: IntegrationConfig,
}

#[derive(Debug, Clone, Deserialize)]
pub struct WorkersConfig {
    /// Seconds between polls of local devices (Tapo, Xiaomi).
    pub poll_interval_secs: u64,
    /// Seconds between polls of cloud integrations (Tuya); cloud APIs are rate limited.
    pub cloud_poll_interval_secs: u64,
    /// Seconds between energy samples written to the database.
    pub energy_sample_secs: u64,
    pub energy_retention_days: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub tls: TlsConfig,
    pub database: DatabaseConfig,
    pub security: SecurityConfig,
    pub integrations: IntegrationsConfig,
    pub workers: WorkersConfig,
}

impl AppConfig {
    pub fn load() -> anyhow::Result<Self> {
        let env = std::env::var("APP_ENV").unwrap_or_else(|_| "development".into());

        let builder = config::Config::builder()
            .set_default("server.host", "0.0.0.0")?
            .set_default("server.port", 8443)?
            .set_default("server.env", env.clone())?
            .set_default("server.data_dir", "data")?
            .set_default("server.web_dir", "apps/web/dist")?
            .set_default("tls.enabled", true)?
            .set_default("database.url", "")?
            .set_default("database.max_connections", 8)?
            .set_default("security.jwt_secret", "")?
            .set_default("security.token_expiry_hours", 24 * 7)?
            .set_default("integrations.tuya.enabled", true)?
            .set_default("integrations.tapo.enabled", true)?
            .set_default("integrations.xiaomi.enabled", true)?
            .set_default("integrations.mqtt.enabled", true)?
            .set_default("workers.poll_interval_secs", 3)?
            .set_default("workers.cloud_poll_interval_secs", 15)?
            .set_default("workers.energy_sample_secs", 60)?
            .set_default("workers.energy_retention_days", 400)?
            .add_source(config::File::with_name("config/default").required(false))
            .add_source(config::File::with_name(&format!("config/{}", env)).required(false))
            .add_source(config::Environment::with_prefix("DOMUS").separator("__"));

        let mut config = builder.build()?.try_deserialize::<AppConfig>()?;
        if config.database.url.is_empty() {
            config.database.url = format!(
                "sqlite://{}?mode=rwc",
                config.server.data_dir.join("domus.db").display()
            );
        }
        Ok(config)
    }
}
