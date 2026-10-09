use crate::api::error::ApiError;
use axum::{extract::State, routing::get, Json, Router};
use serde_json::{json, Value};
use sqlx::SqlitePool;

pub fn schedule_routes(pool: SqlitePool) -> Router {
    Router::new()
        .route("/", get(list_schedules))
        .with_state(pool)
}

async fn list_schedules(State(_pool): State<SqlitePool>) -> Result<Json<Value>, ApiError> {
    Ok(Json(json!([])))
}
