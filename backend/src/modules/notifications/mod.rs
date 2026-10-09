use crate::api::error::ApiError;
use axum::{extract::State, routing::get, Json, Router};
use serde_json::{json, Value};
use sqlx::SqlitePool;

pub fn notification_routes(pool: SqlitePool) -> Router {
    Router::new()
        .route("/", get(list_notifications))
        .with_state(pool)
}

async fn list_notifications(State(_pool): State<SqlitePool>) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!([
        {
            "id": "1",
            "title": "System Initialized",
            "message": "Welcome to Docus Smart Home Platform.",
            "created_at": chrono::Utc::now()
        }
    ])))
}
