use crate::api::middleware::{auth_middleware, JwtKeys};
use crate::api::ws::ws_handler;
use crate::automation_engine::AutomationEngine;
use crate::infrastructure::event_bus::EventBus;
use crate::integrations::tuya::TuyaIntegration;
use crate::integrations::DeviceManager;
use crate::modules::{
    air::air_routes, auth, automations::automation_routes, devices, energy::energy_routes, groups::group_routes,
    integrations::{integration_routes, TuyaLogins, XiaomiLogins},
    notifications::{notification_routes, Notifier},
    rooms::room_routes, scenes::scene_routes, users::user_routes,
};
use axum::{
    http::{header, HeaderValue, Method},
    middleware,
    routing::get,
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::path::Path;
use std::sync::Arc;
use tower_http::{
    cors::CorsLayer,
    services::{ServeDir, ServeFile},
    set_header::SetResponseHeaderLayer,
    trace::TraceLayer,
};

#[derive(Clone)]
pub struct AppState {
    pub pool: SqlitePool,
    pub jwt: Arc<JwtKeys>,
    pub bus: EventBus,
    pub manager: Arc<DeviceManager>,
    pub notifier: Notifier,
    pub automations: Arc<AutomationEngine>,
    pub tuya: Option<Arc<TuyaIntegration>>,
    pub tuya_logins: TuyaLogins,
    pub xiaomi_logins: XiaomiLogins,
}

pub fn create_router(state: AppState, web_dir: &Path, tls: bool) -> Router {
    let public = Router::new()
        .route("/health", get(health_check))
        .nest("/auth", auth::routes::public_routes());

    let protected = Router::new()
        .nest("/auth", auth::routes::protected_routes())
        .nest("/devices", devices::device_routes())
        .nest("/discovery", devices::discovery_routes())
        .nest("/groups", group_routes())
        .nest("/rooms", room_routes())
        .nest("/automations", automation_routes())
        .nest("/scenes", scene_routes())
        .nest("/energy", energy_routes())
        .nest("/air", air_routes())
        .nest("/notifications", notification_routes())
        .nest("/users", user_routes())
        .nest("/integrations", integration_routes())
        .route("/ws", get(ws_handler))
        .route_layer(middleware::from_fn_with_state(state.clone(), auth_middleware));

    let api = public.merge(protected).with_state(state);

    // The web UI is same-origin in production; in development Vite proxies /api.
    // Electron loads from file:// or the dev server, so allow those origins only.
    let cors = CorsLayer::new()
        .allow_origin([
            HeaderValue::from_static("http://localhost:3000"),
            HeaderValue::from_static("https://localhost:3000"),
            HeaderValue::from_static("file://"),
        ])
        .allow_methods([Method::GET, Method::POST, Method::PUT, Method::PATCH, Method::DELETE])
        .allow_headers([header::AUTHORIZATION, header::CONTENT_TYPE]);

    let mut app = Router::new()
        .nest("/api/v1", api)
        .layer(cors)
        .layer(TraceLayer::new_for_http())
        .layer(SetResponseHeaderLayer::overriding(
            header::X_CONTENT_TYPE_OPTIONS,
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::REFERRER_POLICY,
            HeaderValue::from_static("no-referrer"),
        ));
    if tls {
        app = app.layer(SetResponseHeaderLayer::overriding(
            header::STRICT_TRANSPORT_SECURITY,
            HeaderValue::from_static("max-age=31536000"),
        ));
    }

    if web_dir.join("index.html").exists() {
        tracing::info!("Serving web UI from {}", web_dir.display());
        let spa = ServeDir::new(web_dir).fallback(ServeFile::new(web_dir.join("index.html")));
        app = app.fallback_service(spa);
    }
    app
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "service": "docus-backend",
        "version": env!("CARGO_PKG_VERSION"),
        "timestamp": chrono::Utc::now()
    }))
}
