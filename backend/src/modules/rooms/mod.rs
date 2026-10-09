use crate::api::error::ApiError;
use axum::{
    extract::{Path, State},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct RoomRecord {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub floor: i32,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateRoomRequest {
    pub name: String,
    pub icon: Option<String>,
    pub floor: Option<i32>,
}

pub fn room_routes(pool: SqlitePool) -> Router {
    Router::new()
        .route("/", get(list_rooms).post(create_room))
        .route("/:id", get(get_room).delete(delete_room))
        .with_state(pool)
}

async fn list_rooms(State(pool): State<SqlitePool>) -> Result<Json<Vec<RoomRecord>>, ApiError> {
    let rooms = sqlx::query_as::<_, RoomRecord>("SELECT * FROM rooms ORDER BY floor ASC, name ASC")
        .fetch_all(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(rooms))
}

async fn get_room(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<RoomRecord>, ApiError> {
    let room = sqlx::query_as::<_, RoomRecord>("SELECT * FROM rooms WHERE id = ?")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?
        .ok_or_else(|| ApiError::NotFound("Room not found".into()))?;
    Ok(Json(room))
}

async fn create_room(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateRoomRequest>,
) -> Result<Json<RoomRecord>, ApiError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let floor = payload.floor.unwrap_or(1);

    sqlx::query(
        "INSERT INTO rooms (id, name, icon, floor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&payload.name)
    .bind(&payload.icon)
    .bind(floor)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(RoomRecord {
        id,
        name: payload.name,
        icon: payload.icon,
        floor,
        created_at: now,
        updated_at: now,
    }))
}

async fn delete_room(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    sqlx::query("DELETE FROM rooms WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(json!({ "success": true })))
}
