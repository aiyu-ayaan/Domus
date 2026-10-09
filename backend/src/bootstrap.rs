use crate::api::{create_router, AppState};
use crate::config::AppConfig;
use crate::infrastructure::{
    database::init_pool, event_bus::EventBus, logging::init_logging, mqtt_client::MqttService,
};
use crate::integrations::tuya::TuyaIntegration;
use crate::modules::auth::{repository::AuthRepository, AuthService};
use crate::modules::devices::{repository::DeviceRepository, DeviceService};
use crate::workers::{DeviceWorker, SchedulerWorker};
use std::sync::Arc;
use tokio::net::TcpListener;
use tracing::info;

pub async fn bootstrap() -> anyhow::Result<()> {
    // 1. Initialize logging
    init_logging();
    info!("Starting Docus Smart Home Core Server...");

    // 2. Load configuration
    let config = AppConfig::load()?;
    info!("Configuration loaded successfully. Environment: {}", config.server.env);

    // 3. Initialize database
    let pool = init_pool(&config.database.url, config.database.max_connections).await?;

    // 4. Initialize event bus
    let event_bus = EventBus::default();

    // 5. Initialize MQTT if enabled
    if config.mqtt.enabled {
        match MqttService::start(&config.mqtt, event_bus.clone()).await {
            Ok(_) => info!("MQTT service connected successfully."),
            Err(e) => tracing::warn!("MQTT service failed to connect (continuing): {}", e),
        }
    }

    // 6. Initialize services
    let auth_repo = AuthRepository::new(pool.clone());
    let auth_service = Arc::new(AuthService::new(auth_repo, config.security.jwt_secret));

    let device_repo = DeviceRepository::new(pool.clone());
    let device_service = Arc::new(DeviceService::new(device_repo, event_bus.clone()));

    let tuya_integration = Arc::new(TuyaIntegration::new(true));

    // 7. Spawn background workers
    let device_worker = DeviceWorker::new(event_bus.clone());
    tokio::spawn(device_worker.run());

    let scheduler_worker = SchedulerWorker::new();
    tokio::spawn(scheduler_worker.run());

    // 8. Assemble application state & routes
    let app_state = AppState {
        pool,
        auth_service,
        device_service,
        tuya_integration,
    };

    let app = create_router(app_state);

    // 9. Start HTTP Server
    let bind_addr = format!("{}:{}", config.server.host, config.server.port);
    let listener = TcpListener::bind(&bind_addr).await?;
    info!("Server listening on http://{}", bind_addr);

    axum::serve(listener, app).await?;

    Ok(())
}
