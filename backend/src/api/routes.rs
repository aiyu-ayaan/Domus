use crate::api::error::ApiError;
use crate::api::middleware::auth_middleware;
use crate::integrations::tuya::TuyaIntegration;
use crate::modules::auth::{auth_routes, AuthService};
use crate::modules::automations::automation_routes;
use crate::modules::devices::{device_routes, DeviceService};
use crate::modules::energy::energy_routes;
use crate::modules::notifications::notification_routes;
use crate::modules::rooms::room_routes;
use crate::modules::scenes::scene_routes;
use crate::modules::schedules::schedule_routes;
use crate::modules::users::user_routes;
use axum::{
    middleware,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::sync::Arc;
use tower_http::cors::{Any, CorsLayer};

pub struct AppState {
    pub pool: SqlitePool,
    pub auth_service: Arc<AuthService>,
    pub device_service: Arc<DeviceService>,
    pub tuya_integration: Arc<TuyaIntegration>,
}

pub fn create_router(state: AppState) -> Router {
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let tuya_state = state.tuya_integration.clone();
    let tuya_routes = Router::new()
        .route("/qr-session", post(create_tuya_qr_session))
        .with_state(tuya_state);

    let api_v1 = Router::new()
        .route("/health", get(health_check))
        .nest("/auth", auth_routes(state.auth_service.clone()))
        .nest("/devices", device_routes(state.device_service.clone()))
        .nest("/rooms", room_routes(state.pool.clone()))
        .nest("/automations", automation_routes(state.pool.clone()))
        .nest("/scenes", scene_routes(state.pool.clone()))
        .nest("/energy", energy_routes(state.pool.clone()))
        .nest("/schedules", schedule_routes(state.pool.clone()))
        .nest("/notifications", notification_routes(state.pool.clone()))
        .nest("/users", user_routes(state.pool.clone()))
        .nest("/integrations/tuya", tuya_routes)
        .layer(middleware::from_fn(auth_middleware));

    Router::new()
        .nest("/api/v1", api_v1)
        .layer(cors)
}

async fn health_check() -> Json<Value> {
    Json(json!({
        "status": "healthy",
        "service": "docus-backend",
        "timestamp": chrono::Utc::now()
    }))
}

async fn create_tuya_qr_session(
    axum::extract::State(tuya): axum::extract::State<Arc<TuyaIntegration>>,
) -> Result<Json<Value>, ApiError> {
    let session = tuya
        .create_qr_session()
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(json!(session)))
}
