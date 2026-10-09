use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct ServerConfig {
    pub host: String,
    pub port: u16,
    pub env: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DatabaseConfig {
    pub url: String,
    pub max_connections: u32,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SecurityConfig {
    pub jwt_secret: String,
    pub token_expiry_hours: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct MqttConfig {
    pub enabled: bool,
    pub host: String,
    pub port: u16,
    pub client_id: String,
    pub keep_alive_secs: u64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IntegrationConfig {
    pub enabled: bool,
}

#[derive(Debug, Clone, Deserialize)]
pub struct IntegrationsConfig {
    pub tuya: Option<IntegrationConfig>,
    pub tapo: Option<IntegrationConfig>,
    pub xiaomi: Option<IntegrationConfig>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub database: DatabaseConfig,
    pub security: SecurityConfig,
    pub mqtt: MqttConfig,
    pub integrations: IntegrationsConfig,
}

impl AppConfig {
    pub fn load() -> anyhow::Result<Self> {
        let env = std::env::var("APP_ENV").unwrap_or_else(|_| "development".into());

        let builder = config::Config::builder()
            .set_default("server.host", "127.0.0.1")?
            .set_default("server.port", 8080)?
            .set_default("server.env", env.clone())?
            .set_default("database.url", "sqlite://docus.db?mode=rwc")?
            .set_default("database.max_connections", 10)?
            .set_default("security.jwt_secret", "docus-default-secret-key-change-in-prod")?
            .set_default("security.token_expiry_hours", 24)?
            .set_default("mqtt.enabled", false)?
            .set_default("mqtt.host", "127.0.0.1")?
            .set_default("mqtt.port", 1883)?
            .set_default("mqtt.client_id", "docus_backend")?
            .set_default("mqtt.keep_alive_secs", 60)?
            .add_source(config::File::with_name("config/default").required(false))
            .add_source(config::File::with_name(&format!("config/{}", env)).required(false))
            .add_source(config::Environment::default().separator("__"));

        let config = builder.build()?.try_deserialize::<AppConfig>()?;
        Ok(config)
    }
}
