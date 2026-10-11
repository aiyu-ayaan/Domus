//! Device groups: arbitrary sets of devices controlled together
//! (e.g. "All lights", "Night mode plugs").

use crate::api::error::{ApiError, ApiResult, Confirmed};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::modules::devices::service::{controllable_ids, visible_ids};
use axum::{
    extract::{Path, Query, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use home_core::DeviceCommand;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct GroupRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Serialize)]
pub struct GroupDto {
    #[serde(flatten)]
    pub group: GroupRecord,
    pub device_ids: Vec<String>,
}

#[derive(Deserialize)]
pub struct GroupRequest {
    pub name: String,
    pub description: Option<String>,
    #[serde(default)]
    pub device_ids: Vec<String>,
}

pub fn group_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
        .route("/:id/command", post(command))
}

async fn list(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<GroupDto>>> {
    let groups: Vec<GroupRecord> = sqlx::query_as("SELECT * FROM device_groups ORDER BY name COLLATE NOCASE")
        .fetch_all(&s.pool)
        .await?;
    let allowed = visible_ids(&s, &user).await?;
    let mut out = Vec::new();
    for g in groups {
        let ids = s.manager.group_device_ids(&g.id).await?;
        let visible: Vec<String> = ids
            .into_iter()
            .filter(|id| allowed.as_ref().is_none_or(|a| a.contains(id)))
            .collect();
        if allowed.is_none() || !visible.is_empty() {
            out.push(GroupDto { group: g, device_ids: visible });
        }
    }
    Ok(Json(out))
}

async fn save_members(s: &AppState, group_id: &str, ids: &[String]) -> ApiResult<()> {
    let mut tx = s.pool.begin().await?;
    sqlx::query("DELETE FROM device_group_members WHERE group_id = ?")
        .bind(group_id)
        .execute(&mut *tx)
        .await?;
    for d in ids {
        sqlx::query("INSERT OR IGNORE INTO device_group_members (group_id, device_id) VALUES (?, ?)")
            .bind(group_id)
            .bind(d)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn create(State(s): State<AppState>, user: AuthUser, Json(req): Json<GroupRequest>) -> ApiResult<Json<GroupDto>> {
    user.require_admin()?;
    if req.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Name is required".into()));
    }
    let g = GroupRecord {
        id: Uuid::new_v4().to_string(),
        name: req.name.trim().into(),
        description: req.description,
        created_at: Utc::now(),
    };
    sqlx::query("INSERT INTO device_groups (id, name, description, created_at) VALUES (?, ?, ?, ?)")
        .bind(&g.id)
        .bind(&g.name)
        .bind(&g.description)
        .bind(g.created_at)
        .execute(&s.pool)
        .await?;
    save_members(&s, &g.id, &req.device_ids).await?;
    Ok(Json(GroupDto { group: g, device_ids: req.device_ids }))
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<GroupRequest>,
) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let res = sqlx::query("UPDATE device_groups SET name = ?, description = ? WHERE id = ?")
        .bind(req.name.trim())
        .bind(&req.description)
        .bind(&id)
        .execute(&s.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound("Group not found".into()));
    }
    save_members(&s, &id, &req.device_ids).await?;
    Ok(Json(json!({ "success": true })))
}

async fn remove(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    sqlx::query("DELETE FROM device_groups WHERE id = ?").bind(&id).execute(&s.pool).await?;
    Ok(Json(json!({ "success": true })))
}

async fn command(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Query(q): Query<Confirmed>,
    Json(cmd): Json<DeviceCommand>,
) -> ApiResult<Json<Value>> {
    user.require_control()?;
    s.automations
        .require_confirmed(&[home_core::Action::GroupCommand { group_id: id.clone(), command: cmd.clone() }], q.confirmed)
        .await?;
    let allowed = controllable_ids(&s, &user).await?;
    let ids: Vec<String> = s
        .manager
        .group_device_ids(&id)
        .await?
        .into_iter()
        .filter(|i| allowed.as_ref().is_none_or(|a| a.contains(i)))
        .collect();
    let failures = s.manager.command_many(&ids, &cmd).await;
    Ok(Json(json!({
        "sent": ids.len() - failures.len(),
        "failed": failures.iter().map(|(id, e)| json!({ "device_id": id, "error": e })).collect::<Vec<_>>(),
    })))
}
