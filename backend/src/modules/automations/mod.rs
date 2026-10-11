use crate::api::error::{ApiError, ApiResult, Confirmed};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::modules::devices::service::{action_devices, require_control_of, sees_all, visible_ids};
use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use home_core::{Action, Condition, Trigger};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashSet;
use uuid::Uuid;

#[derive(sqlx::FromRow)]
struct AutomationRow {
    id: String,
    name: String,
    description: Option<String>,
    triggers_json: String,
    conditions_json: String,
    actions_json: String,
    is_enabled: bool,
    created_at: DateTime<Utc>,
    updated_at: DateTime<Utc>,
    last_triggered_at: Option<DateTime<Utc>>,
}

#[derive(Serialize)]
pub struct AutomationDto {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub triggers: Value,
    pub conditions: Value,
    pub actions: Value,
    pub is_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
    pub last_triggered_at: Option<DateTime<Utc>>,
}

impl From<AutomationRow> for AutomationDto {
    fn from(r: AutomationRow) -> Self {
        let parse = |s: &str| serde_json::from_str(s).unwrap_or(Value::Array(vec![]));
        Self {
            triggers: parse(&r.triggers_json),
            conditions: parse(&r.conditions_json),
            actions: parse(&r.actions_json),
            id: r.id,
            name: r.name,
            description: r.description,
            is_enabled: r.is_enabled,
            created_at: r.created_at,
            updated_at: r.updated_at,
            last_triggered_at: r.last_triggered_at,
        }
    }
}

/// Typed so invalid rules are rejected at save time.
#[derive(Deserialize)]
pub struct AutomationRequest {
    pub name: String,
    pub description: Option<String>,
    pub triggers: Vec<Trigger>,
    #[serde(default)]
    pub conditions: Vec<Condition>,
    pub actions: Vec<Action>,
    #[serde(default = "enabled")]
    pub is_enabled: bool,
}

fn enabled() -> bool {
    true
}

impl AutomationRequest {
    fn validate(&self) -> ApiResult<()> {
        if self.name.trim().is_empty() {
            return Err(ApiError::BadRequest("Name is required".into()));
        }
        if self.triggers.is_empty() {
            return Err(ApiError::BadRequest("Add at least one trigger".into()));
        }
        if self.actions.is_empty() {
            return Err(ApiError::BadRequest("Add at least one action".into()));
        }
        for t in &self.triggers {
            if let Trigger::Time { at, .. } = t {
                if home_core::parse_hhmm(at).is_none() {
                    return Err(ApiError::BadRequest(format!("Invalid time '{at}', use HH:MM")));
                }
            }
            if matches!(t, Trigger::Sun { offset_minutes, .. } if offset_minutes.abs() > 360) {
                return Err(ApiError::BadRequest("Sunrise and sunset can be shifted by at most 6 hours".into()));
            }
        }
        Ok(())
    }
}

pub fn automation_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", get(get_one).put(update).delete(remove))
        .route("/:id/toggle", post(toggle))
        .route("/:id/run", post(run_now))
}

async fn fetch(s: &AppState, id: &str) -> ApiResult<AutomationRow> {
    sqlx::query_as("SELECT * FROM automations WHERE id = ?")
        .bind(id)
        .fetch_optional(&s.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("Automation not found".into()))
}

/// An automation is offered only to users who can see every device it watches or acts on.
async fn sees_rule(s: &AppState, visible: &Option<HashSet<String>>, row: &AutomationRow) -> ApiResult<bool> {
    if visible.is_none() {
        return Ok(true);
    }
    let (Ok(triggers), Ok(conditions), Ok(actions)) = (
        serde_json::from_str::<Vec<Trigger>>(&row.triggers_json),
        serde_json::from_str::<Vec<Condition>>(&row.conditions_json),
        serde_json::from_str::<Vec<Action>>(&row.actions_json),
    ) else {
        return Ok(false);
    };
    let mut ids = action_devices(s, actions).await?;
    for t in triggers {
        match t {
            Trigger::DeviceState { device_id, .. } | Trigger::PowerAbove { device_id, .. } | Trigger::DeviceOffline { device_id } => {
                ids.push(device_id)
            }
            Trigger::Time { .. } | Trigger::Sun { .. } | Trigger::DeviceDiscovered => {}
        }
    }
    for c in conditions {
        match c {
            Condition::DeviceState { device_id, .. } => ids.push(device_id),
            Condition::TimeBetween { .. } => {}
        }
    }
    Ok(sees_all(visible, &ids))
}

/// Like [`fetch`], but 404 for an automation the user is not offered.
async fn fetch_visible(s: &AppState, user: &AuthUser, id: &str) -> ApiResult<AutomationRow> {
    let row = fetch(s, id).await?;
    if sees_rule(s, &visible_ids(s, user).await?, &row).await? {
        Ok(row)
    } else {
        Err(ApiError::NotFound("Automation not found".into()))
    }
}

async fn list(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<AutomationDto>>> {
    let rows: Vec<AutomationRow> = sqlx::query_as("SELECT * FROM automations ORDER BY created_at DESC")
        .fetch_all(&s.pool)
        .await?;
    let visible = visible_ids(&s, &user).await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        if sees_rule(&s, &visible, &row).await? {
            out.push(row.into());
        }
    }
    Ok(Json(out))
}

async fn get_one(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<AutomationDto>> {
    Ok(Json(fetch_visible(&s, &user, &id).await?.into()))
}

fn to_json<T: Serialize>(v: &T) -> String {
    serde_json::to_string(v).unwrap_or_else(|_| "[]".into())
}

async fn create(State(s): State<AppState>, user: AuthUser, Json(req): Json<AutomationRequest>) -> ApiResult<Json<AutomationDto>> {
    user.require_admin()?;
    req.validate()?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    sqlx::query(
        "INSERT INTO automations (id, name, description, triggers_json, conditions_json, actions_json, is_enabled, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(req.name.trim())
    .bind(&req.description)
    .bind(to_json(&req.triggers))
    .bind(to_json(&req.conditions))
    .bind(to_json(&req.actions))
    .bind(req.is_enabled)
    .bind(now)
    .bind(now)
    .execute(&s.pool)
    .await?;
    s.automations.reload().await;
    Ok(Json(fetch(&s, &id).await?.into()))
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<AutomationRequest>,
) -> ApiResult<Json<AutomationDto>> {
    user.require_admin()?;
    req.validate()?;
    fetch(&s, &id).await?;
    sqlx::query(
        "UPDATE automations SET name = ?, description = ?, triggers_json = ?, conditions_json = ?, actions_json = ?,
         is_enabled = ?, updated_at = ? WHERE id = ?",
    )
    .bind(req.name.trim())
    .bind(&req.description)
    .bind(to_json(&req.triggers))
    .bind(to_json(&req.conditions))
    .bind(to_json(&req.actions))
    .bind(req.is_enabled)
    .bind(Utc::now())
    .bind(&id)
    .execute(&s.pool)
    .await?;
    s.automations.reload().await;
    Ok(Json(fetch(&s, &id).await?.into()))
}

async fn toggle(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<AutomationDto>> {
    user.require_admin()?;
    sqlx::query("UPDATE automations SET is_enabled = NOT is_enabled, updated_at = ? WHERE id = ?")
        .bind(Utc::now())
        .bind(&id)
        .execute(&s.pool)
        .await?;
    s.automations.reload().await;
    Ok(Json(fetch(&s, &id).await?.into()))
}

async fn run_now(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>, Query(q): Query<Confirmed>) -> ApiResult<Json<Value>> {
    user.require_control()?;
    let row = fetch_visible(&s, &user, &id).await?;
    let actions: Vec<Action> =
        serde_json::from_str(&row.actions_json).map_err(|e| ApiError::BadRequest(format!("invalid actions: {e}")))?;
    require_control_of(&s, &user, &action_devices(&s, actions.clone()).await?).await?;
    s.automations.require_confirmed(&actions, q.confirmed).await?;
    let errors = s.automations.execute(&actions, 0).await;
    Ok(Json(json!({ "success": errors.is_empty(), "errors": errors })))
}

async fn remove(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    sqlx::query("DELETE FROM automations WHERE id = ?").bind(&id).execute(&s.pool).await?;
    s.automations.reload().await;
    Ok(Json(json!({ "success": true })))
}
