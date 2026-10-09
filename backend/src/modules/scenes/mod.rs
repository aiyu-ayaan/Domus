use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use axum::{
    extract::{Path, State},
    routing::{get, post, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use home_core::Action;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct SceneRow {
    id: String,
    name: String,
    icon: Option<String>,
    actions_json: String,
    is_active: bool,
    created_at: DateTime<Utc>,
}

#[derive(Serialize)]
pub struct SceneDto {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub actions: Value,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

impl From<SceneRow> for SceneDto {
    fn from(r: SceneRow) -> Self {
        Self {
            actions: serde_json::from_str(&r.actions_json).unwrap_or(Value::Array(vec![])),
            id: r.id,
            name: r.name,
            icon: r.icon,
            is_active: r.is_active,
            created_at: r.created_at,
        }
    }
}

#[derive(Deserialize)]
pub struct SceneRequest {
    pub name: String,
    pub icon: Option<String>,
    pub actions: Vec<Action>,
}

pub fn scene_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
        .route("/:id/activate", post(activate))
        .route("/:id/deactivate", post(deactivate))
        .route("/:id/toggle", post(toggle))
}

async fn list(State(s): State<AppState>, _user: AuthUser) -> ApiResult<Json<Vec<SceneDto>>> {
    let rows: Vec<SceneRow> = sqlx::query_as("SELECT * FROM scenes ORDER BY name COLLATE NOCASE")
        .fetch_all(&s.pool)
        .await?;
    Ok(Json(rows.into_iter().map(Into::into).collect()))
}

fn validate(req: &SceneRequest) -> ApiResult<String> {
    if req.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Name is required".into()));
    }
    if req.actions.is_empty() {
        return Err(ApiError::BadRequest("Add at least one action".into()));
    }
    Ok(serde_json::to_string(&req.actions).unwrap_or_else(|_| "[]".into()))
}

async fn create(State(s): State<AppState>, user: AuthUser, Json(req): Json<SceneRequest>) -> ApiResult<Json<SceneDto>> {
    user.require_admin()?;
    let actions = validate(&req)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    sqlx::query("INSERT INTO scenes (id, name, icon, actions_json, is_active, created_at) VALUES (?, ?, ?, ?, 0, ?)")
        .bind(&id)
        .bind(req.name.trim())
        .bind(&req.icon)
        .bind(&actions)
        .bind(now)
        .execute(&s.pool)
        .await?;
    Ok(Json(SceneDto {
        id,
        name: req.name.trim().into(),
        icon: req.icon,
        actions: serde_json::from_str(&actions).unwrap_or_default(),
        is_active: false,
        created_at: now,
    }))
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<SceneRequest>,
) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let actions = validate(&req)?;
    let res = sqlx::query("UPDATE scenes SET name = ?, icon = ?, actions_json = ? WHERE id = ?")
        .bind(req.name.trim())
        .bind(&req.icon)
        .bind(&actions)
        .bind(&id)
        .execute(&s.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound("Scene not found".into()));
    }
    Ok(Json(json!({ "success": true })))
}

async fn activate(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_control()?;
    let actions = s
        .automations
        .scene_actions(&id)
        .await
        .ok_or_else(|| ApiError::NotFound("Scene not found".into()))?;
    let errors = s.automations.execute(&actions, 1).await;
    sqlx::query("UPDATE scenes SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END")
        .bind(&id)
        .execute(&s.pool)
        .await?;
    Ok(Json(json!({ "success": errors.is_empty(), "errors": errors })))
}

async fn remove(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    sqlx::query("DELETE FROM scenes WHERE id = ?").bind(&id).execute(&s.pool).await?;
    Ok(Json(json!({ "success": true })))
}

#[derive(Deserialize, Default)]
pub struct ToggleRequest {
    pub on: Option<bool>,
}

async fn deactivate(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_control()?;
    let actions = s
        .automations
        .scene_actions(&id)
        .await
        .ok_or_else(|| ApiError::NotFound("Scene not found".into()))?;

    let off_cmd = home_core::DeviceCommand {
        is_on: Some(false),
        ..Default::default()
    };
    let mut off_actions = Vec::new();
    for action in actions {
        match action {
            Action::DeviceCommand { device_id, .. } => {
                off_actions.push(Action::DeviceCommand {
                    device_id,
                    command: off_cmd.clone(),
                });
            }
            Action::GroupCommand { group_id, .. } => {
                off_actions.push(Action::GroupCommand {
                    group_id,
                    command: off_cmd.clone(),
                });
            }
            Action::Scene { scene_id } => {
                off_actions.push(Action::Scene { scene_id });
            }
            _ => {}
        }
    }

    let errors = s.automations.execute(&off_actions, 1).await;
    sqlx::query("UPDATE scenes SET is_active = 0 WHERE id = ?")
        .bind(&id)
        .execute(&s.pool)
        .await?;
    Ok(Json(json!({ "success": errors.is_empty(), "errors": errors })))
}

async fn toggle(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    payload: Option<Json<ToggleRequest>>,
) -> ApiResult<Json<Value>> {
    user.require_control()?;
    let turn_on = match payload.and_then(|Json(p)| p.on) {
        Some(explicit) => explicit,
        None => {
            let row: Option<(bool,)> = sqlx::query_as("SELECT is_active FROM scenes WHERE id = ?")
                .bind(&id)
                .fetch_optional(&s.pool)
                .await?;
            let is_active = row.map(|r| r.0).unwrap_or(false);
            !is_active
        }
    };

    if turn_on {
        activate(State(s), user, Path(id)).await
    } else {
        deactivate(State(s), user, Path(id)).await
    }
}

