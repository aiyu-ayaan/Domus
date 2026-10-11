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
    pub admin_only: bool,
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

    /// For everyone who can sign in.
    pub async fn notify(&self, level: &str, title: &str, message: &str, link: Option<&str>) {
        self.send(level, title, message, link, false).await
    }

    /// For administrators only: accounts, discovery, anything that names devices a guest may not see.
    pub async fn notify_admins(&self, level: &str, title: &str, message: &str, link: Option<&str>) {
        self.send(level, title, message, link, true).await
    }

    async fn send(&self, level: &str, title: &str, message: &str, link: Option<&str>, admin_only: bool) {
        let id = Uuid::new_v4().to_string();
        let res = sqlx::query(
            "INSERT INTO notifications (id, level, title, message, link, is_read, admin_only, created_at) VALUES (?, ?, ?, ?, ?, 0, ?, ?)",
        )
        .bind(&id)
        .bind(level)
        .bind(title)
        .bind(message)
        .bind(link)
        .bind(admin_only)
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
            admin_only,
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

/// Rows the user may see: everything for an administrator, otherwise only what was sent to everyone.
const MINE: &str = "(admin_only = 0 OR ?)";

async fn list(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Value>> {
    let items: Vec<NotificationRecord> =
        sqlx::query_as(&format!("SELECT * FROM notifications WHERE {MINE} ORDER BY created_at DESC LIMIT 100"))
            .bind(user.is_admin())
            .fetch_all(&s.pool)
            .await?;
    let unread = items.iter().filter(|n| !n.is_read).count();
    Ok(Json(json!({ "items": items, "unread": unread })))
}

async fn mark_read(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let sql = format!("UPDATE notifications SET is_read = 1 WHERE id = ? AND {MINE}");
    changed(&s, sqlx::query(&sql).bind(id).bind(user.is_admin())).await
}

async fn read_all(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Value>> {
    let sql = format!("UPDATE notifications SET is_read = 1 WHERE {MINE}");
    changed(&s, sqlx::query(&sql).bind(user.is_admin())).await
}

async fn remove(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    let sql = format!("DELETE FROM notifications WHERE id = ? AND {MINE}");
    changed(&s, sqlx::query(&sql).bind(id).bind(user.is_admin())).await
}

/// What the user can see is shared with everyone else who can see it, like read and delete one.
async fn clear(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Value>> {
    let sql = format!("DELETE FROM notifications WHERE {MINE}");
    changed(&s, sqlx::query(&sql).bind(user.is_admin())).await
}

/// Runs a write on the inbox and tells every connected client to reload it.
async fn changed<'q>(s: &AppState, q: sqlx::query::Query<'q, sqlx::Sqlite, sqlx::sqlite::SqliteArguments<'q>>) -> ApiResult<Json<Value>> {
    q.execute(&s.pool).await?;
    s.bus.publish(SystemEvent::NotificationsChanged);
    Ok(Json(json!({ "success": true })))
}
