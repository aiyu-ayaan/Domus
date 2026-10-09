use crate::api::error::ApiError;
use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, Utc};
use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct UserListItem {
    pub id: String,
    pub username: String,
    pub email: String,
    pub role: String,
    pub created_at: DateTime<Utc>,
}

pub fn user_routes(pool: SqlitePool) -> Router {
    Router::new()
        .route("/", get(list_users))
        .with_state(pool)
}

async fn list_users(State(pool): State<SqlitePool>) -> Result<Json<Vec<UserListItem>>, ApiError> {
    let users = sqlx::query_as::<_, UserListItem>(
        "SELECT id, username, email, role, created_at FROM users ORDER BY created_at ASC",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(users))
}
