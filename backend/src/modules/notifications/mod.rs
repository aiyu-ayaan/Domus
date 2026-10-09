use crate::api::error::ApiResult;
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::{EventBus, SystemEvent};
use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::Serialize;
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct NotificationRecord {
    pub id: String,
    pub level: String,
    pub title: String,
    pub message: String,
    pub link: Option<String>,
    pub is_read: bool,
    pub created_at: DateTime<Utc>,
}

/// Persists a notification and pushes it to connected clients.
#[derive(Clone)]
pub struct Notifier {
    pool: SqlitePool,
    bus: EventBus,
}

impl Notifier {
    pub fn new(pool: SqlitePool, bus: EventBus) -> Self {
        Self { pool, bus }
    }

    pub async fn notify(&self, level: &str, title: &str, message: &str, link: Option<&str>) {
        let id = Uuid::new_v4().to_string();
        let res = sqlx::query(
            "INSERT INTO notifications (id, level, title, message, link, is_read, created_at) VALUES (?, ?, ?, ?, ?, 0, ?)",
        )
        .bind(&id)
        .bind(level)
        .bind(title)
        .bind(message)
        .bind(link)
        .bind(Utc::now())
        .execute(&self.pool)
        .await;
        if let Err(e) = res {
            tracing::warn!("failed to store notification: {e}");
        }
        self.bus.publish(SystemEvent::Notification {
            id,
            level: level.into(),
            title: title.into(),
            message: message.into(),
        });
    }
}

pub fn notification_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).delete(clear))
        .route("/read-all", post(read_all))
        .route("/:id/read", post(mark_read))
        .route("/:id", delete(remove))
}

async fn list(State(s): State<AppState>, _user: AuthUser) -> ApiResult<Json<Value>> {
    let items: Vec<NotificationRecord> =
        sqlx::query_as("SELECT * FROM notifications ORDER BY created_at DESC LIMIT 100")
            .fetch_all(&s.pool)
            .await?;
    let unread = items.iter().filter(|n| !n.is_read).count();
    Ok(Json(json!({ "items": items, "unread": unread })))
}

async fn mark_read(State(s): State<AppState>, _user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    sqlx::query("UPDATE notifications SET is_read = 1 WHERE id = ?")
        .bind(id)
        .execute(&s.pool)
        .await?;
    Ok(Json(json!({ "success": true })))
}

async fn read_all(State(s): State<AppState>, _user: AuthUser) -> ApiResult<Json<Value>> {
    sqlx::query("UPDATE notifications SET is_read = 1").execute(&s.pool).await?;
    Ok(Json(json!({ "success": true })))
}

async fn remove(State(s): State<AppState>, _user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    sqlx::query("DELETE FROM notifications WHERE id = ?")
        .bind(id)
        .execute(&s.pool)
        .await?;
    Ok(Json(json!({ "success": true })))
}

async fn clear(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    sqlx::query("DELETE FROM notifications").execute(&s.pool).await?;
    Ok(Json(json!({ "success": true })))
}
