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

/// Gives system-authored notifications a catalog code and placeholder parameters while leaving
/// user-authored automation notifications (`Action::Notify`) as plain text.
pub fn classify_notification(title: &str, message: &str) -> (Option<String>, Option<Value>) {
    if title == "New device added" {
        if let Some(rest) = message.strip_suffix(") was found and added automatically") {
            if let Some((name, integration)) = rest.rsplit_once(" (") {
                return (
                    Some("notification.device_added".into()),
                    Some(json!({ "name": name, "integration": integration })),
                );
            }
        }
    }
    if title == "New device found" {
        if let Some(rest) = message.strip_suffix(") is ready to add") {
            if let Some((name, integration)) = rest.rsplit_once(" (") {
                return (
                    Some("notification.device_found".into()),
                    Some(json!({ "name": name, "integration": integration })),
                );
            }
        }
    }
    if title == "Password reset requested" {
        if let Some(username) =
            message.strip_suffix(" forgot their password. An administrator can give them a reset code in Settings, under People and access.")
        {
            return (
                Some("notification.password_reset".into()),
                Some(json!({ "username": username })),
            );
        }
    }
    if let Some(name) = title.strip_suffix(" left on") {
        if let Some(minutes) = message.strip_prefix(&format!("{name} has been on for ")).and_then(|m| m.strip_suffix(" minutes.")) {
            // Params are strings: older apps read them as such.
            return (Some("notification.left_on".into()), Some(json!({ "name": name, "minutes": minutes })));
        }
    }
    if let Some(name) = title.strip_prefix("Replace the filter of ") {
        if let Some(percent) = message.strip_suffix("% of the filter life is left.") {
            return (Some("notification.filter_low".into()), Some(json!({ "name": name, "percent": percent })));
        }
    }
    if let Some(name) = title.strip_prefix("Automation \"").and_then(|s| s.strip_suffix("\" had problems")) {
        return (
            Some("notification.automation_failed".into()),
            Some(json!({ "name": name, "errors": message })),
        );
    }
    (None, None)
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
        let (code, params) = classify_notification(title, message);
        self.bus.publish(SystemEvent::Notification {
            id,
            level: level.into(),
            title: title.into(),
            message: message.into(),
            code,
            params,
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
    let rows: Vec<NotificationRecord> =
        sqlx::query_as(&format!("SELECT * FROM notifications WHERE {MINE} ORDER BY created_at DESC LIMIT 100"))
            .bind(user.is_admin())
            .fetch_all(&s.pool)
            .await?;
    let unread = rows.iter().filter(|n| !n.is_read).count();
    let items: Vec<Value> = rows
        .into_iter()
        .map(|n| {
            let (code, params) = classify_notification(&n.title, &n.message);
            let mut obj = serde_json::to_value(&n).unwrap_or_default();
            if let Some(map) = obj.as_object_mut() {
                if let Some(c) = code {
                    map.insert("code".into(), Value::String(c));
                }
                if let Some(p) = params {
                    map.insert("params".into(), p);
                }
            }
            obj
        })
        .collect();
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn watchdog_alerts_get_codes() {
        let (code, params) = classify_notification("Heater left on", "Heater has been on for 90 minutes.");
        assert_eq!(code.as_deref(), Some("notification.left_on"));
        assert_eq!(params, Some(json!({ "name": "Heater", "minutes": "90" })));
        let (code, params) = classify_notification("Replace the filter of Purifier", "8% of the filter life is left.");
        assert_eq!(code.as_deref(), Some("notification.filter_low"));
        assert_eq!(params, Some(json!({ "name": "Purifier", "percent": "8" })));
    }
}
