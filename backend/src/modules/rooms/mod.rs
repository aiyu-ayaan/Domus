use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::SystemEvent;
use crate::modules::devices::service::allowed_rooms;
use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
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
pub struct RoomRequest {
    pub name: String,
    pub icon: Option<String>,
    pub floor: Option<i32>,
}

pub fn room_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_rooms).post(create_room))
        .route("/:id", put(update_room).delete(delete_room))
}

async fn list_rooms(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<RoomRecord>>> {
    let rooms: Vec<RoomRecord> = sqlx::query_as("SELECT * FROM rooms ORDER BY floor ASC, name COLLATE NOCASE ASC")
        .fetch_all(&s.pool)
        .await?;
    let allowed = allowed_rooms(&s, &user).await?;
    Ok(Json(
        rooms
            .into_iter()
            .filter(|r| allowed.as_ref().is_none_or(|a| a.contains(&r.id)))
            .collect(),
    ))
}

async fn create_room(State(s): State<AppState>, user: AuthUser, Json(req): Json<RoomRequest>) -> ApiResult<Json<RoomRecord>> {
    user.require_admin()?;
    let name = req.name.trim();
    if name.is_empty() {
        return Err(ApiError::BadRequest("Room name is required".into()));
    }
    let now = Utc::now();
    let room = RoomRecord {
        id: Uuid::new_v4().to_string(),
        name: name.into(),
        icon: req.icon,
        floor: req.floor.unwrap_or(0),
        created_at: now,
        updated_at: now,
    };
    sqlx::query("INSERT INTO rooms (id, name, icon, floor, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)")
        .bind(&room.id)
        .bind(&room.name)
        .bind(&room.icon)
        .bind(room.floor)
        .bind(now)
        .bind(now)
        .execute(&s.pool)
        .await?;
    s.bus.publish(SystemEvent::RoomsChanged);
    Ok(Json(room))
}

async fn update_room(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<RoomRequest>,
) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let res = sqlx::query("UPDATE rooms SET name = ?, icon = ?, floor = COALESCE(?, floor), updated_at = ? WHERE id = ?")
        .bind(req.name.trim())
        .bind(&req.icon)
        .bind(req.floor)
        .bind(Utc::now())
        .bind(&id)
        .execute(&s.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound("Room not found".into()));
    }
    s.bus.publish(SystemEvent::RoomsChanged);
    Ok(Json(json!({ "success": true })))
}

async fn delete_room(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    sqlx::query("DELETE FROM rooms WHERE id = ?").bind(&id).execute(&s.pool).await?;
    s.bus.publish(SystemEvent::RoomsChanged);
    Ok(Json(json!({ "success": true })))
}
