use crate::api::middleware::JwtKeys;
use crate::api::{create_router, AppState};
use crate::automation_engine::AutomationEngine;
use crate::config::AppConfig;
use crate::infrastructure::{
    crypto::{read_or_create_secret, Vault},
    database::init_pool,
    event_bus::EventBus,
    logging::init_logging,
    mqtt_client::MqttService,
    tls,
};
use crate::integrations::{
    accounts::AccountStore, broadcast_addresses, tapo::TapoIntegration, tuya::TuyaIntegration,
    xiaomi::XiaomiIntegration, DeviceManager,
};
use crate::modules::notifications::Notifier;
use crate::workers::{DeviceWorker, DiscoveryWorker, SchedulerWorker};
use home_core::IntegrationPlugin;
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;
use tracing::info;

pub async fn bootstrap() -> anyhow::Result<()> {
    init_logging();
    let _ = rustls::crypto::ring::default_provider().install_default();
    info!("Starting Docus Smart Home Core Server...");

    let config = AppConfig::load()?;
    std::fs::create_dir_all(&config.server.data_dir)?;
    info!("Environment: {}, data dir: {}", config.server.env, config.server.data_dir.display());

    // Secrets live outside the database.
    let vault = Vault::load_or_create(&config.server.data_dir)?;
    let jwt_secret = if config.security.jwt_secret.is_empty() {
        read_or_create_secret(&config.server.data_dir.join("jwt.secret"), 64)?
    } else {
        config.security.jwt_secret.as_bytes().to_vec()
    };
    let jwt = Arc::new(JwtKeys::new(&jwt_secret, config.security.token_expiry_hours));

    let pool = init_pool(&config.database.url, config.database.max_connections).await?;
    let bus = EventBus::default();
    let notifier = Notifier::new(pool.clone(), bus.clone());

    if config.mqtt.enabled {
        match MqttService::start(&config.mqtt, bus.clone()).await {
            Ok(_) => info!("MQTT service connected."),
            Err(e) => tracing::warn!("MQTT service failed to connect (continuing): {e}"),
        }
    }

    // Integration plugins
    let accounts = AccountStore::new(pool.clone(), vault.clone());
    let store: Arc<dyn home_core::CredentialStore> = Arc::new(accounts.clone());
    let broadcast = broadcast_addresses();
    let mut plugins: Vec<Arc<dyn IntegrationPlugin>> = Vec::new();
    let mut tuya = None;
    if config.integrations.tuya.enabled {
        let t = Arc::new(TuyaIntegration::new(store.clone()));
        tuya = Some(t.clone());
        plugins.push(t);
    }
    if config.integrations.tapo.enabled {
        plugins.push(Arc::new(TapoIntegration::new(broadcast.clone())));
    }
    if config.integrations.xiaomi.enabled {
        plugins.push(Arc::new(XiaomiIntegration::new(store.clone(), broadcast.clone())));
    }
    info!(
        "Integrations: {}",
        plugins.iter().map(|p| p.integration_type().as_str()).collect::<Vec<_>>().join(", ")
    );

    let manager = Arc::new(DeviceManager::new(
        pool.clone(),
        accounts,
        vault,
        bus.clone(),
        notifier.clone(),
        plugins,
        Duration::from_secs(config.workers.energy_sample_secs.max(10)),
    ));

    let automations = Arc::new(AutomationEngine::new(pool.clone(), manager.clone(), notifier.clone(), bus.clone()));
    automations.reload().await;

    tokio::spawn(automations.clone().run());
    tokio::spawn(DeviceWorker::new(manager.clone(), Duration::from_secs(config.workers.poll_interval_secs.max(5))).run());
    tokio::spawn(DiscoveryWorker::new(manager.clone()).run());
    tokio::spawn(SchedulerWorker::new(automations.clone(), pool.clone(), config.workers.energy_retention_days).run());

    let state = AppState {
        pool,
        jwt,
        bus,
        manager,
        notifier,
        automations,
        tuya,
        tuya_logins: Default::default(),
        xiaomi_logins: Default::default(),
    };
    let app = create_router(state, &config.server.web_dir, config.tls.enabled);

    let addr: SocketAddr = format!("{}:{}", config.server.host, config.server.port).parse()?;
    if config.tls.enabled {
        let rustls = tls::load_rustls(&config.tls, &config.server).await?;
        info!("Listening on https://{addr}");
        axum_server::bind_rustls(addr, rustls)
            .serve(app.into_make_service())
            .await?;
    } else {
        tracing::warn!("TLS is disabled — traffic is unencrypted. Only do this behind a TLS-terminating proxy.");
        info!("Listening on http://{addr}");
        let listener = tokio::net::TcpListener::bind(addr).await?;
        axum::serve(listener, app).await?;
    }
    Ok(())
}
