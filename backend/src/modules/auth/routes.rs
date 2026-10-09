use super::model::{AuthResponse, LoginRequest, RegisterRequest};
use super::service::AuthService;
use crate::api::error::ApiError;
use axum::{
    extract::State,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};
use std::sync::Arc;

pub fn auth_routes(service: Arc<AuthService>) -> Router {
    Router::new()
        .route("/setup-status", get(get_setup_status))
        .route("/register", post(register))
        .route("/login", post(login))
        .with_state(service)
}

async fn get_setup_status(
    State(service): State<Arc<AuthService>>,
) -> Result<Json<Value>, ApiError> {
    let is_first_time = service.is_first_time_setup().await?;
    Ok(Json(json!({
        "needs_admin_setup": is_first_time
    })))
}

async fn register(
    State(service): State<Arc<AuthService>>,
    Json(payload): Json<RegisterRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let res = service.register(payload).await?;
    Ok(Json(res))
}

async fn login(
    State(service): State<Arc<AuthService>>,
    Json(payload): Json<LoginRequest>,
) -> Result<Json<AuthResponse>, ApiError> {
    let res = service.login(payload).await?;
    Ok(Json(res))
}
