//! Scenes: one-tap sets of device commands, plus live "Screen Sync" scenes that
//! mirror a shared screen's colour onto lights (see [`screen_sync`]).

pub mod screen_sync;

use crate::api::error::{ApiError, ApiResult, Confirmed};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::Actor;
use crate::modules::devices::service::{action_devices, require_control_of, sees_all, visible_ids};
use axum::http::HeaderMap;
use axum::{
    extract::{Path, Query, State},
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
    kind: String,
    config_json: String,
}

#[derive(Serialize)]
pub struct SceneDto {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub actions: Value,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
    pub kind: String,
    pub config: Value,
}

impl From<SceneRow> for SceneDto {
    fn from(r: SceneRow) -> Self {
        Self {
            actions: serde_json::from_str(&r.actions_json).unwrap_or(Value::Array(vec![])),
            config: serde_json::from_str(&r.config_json).unwrap_or(Value::Object(Default::default())),
            // A live session is the source of truth for Screen Sync scenes.
            is_active: if r.kind == KIND_SCREEN_SYNC { screen_sync::is_running(&r.id) } else { r.is_active },
            kind: r.kind,
            id: r.id,
            name: r.name,
            icon: r.icon,
            created_at: r.created_at,
        }
    }
}

pub const KIND_STANDARD: &str = "standard";
pub const KIND_SCREEN_SYNC: &str = "screen_sync";

#[derive(Deserialize)]
pub struct SceneRequest {
    pub name: String,
    pub icon: Option<String>,
    #[serde(default)]
    pub actions: Vec<Action>,
    /// `standard` (default) or `screen_sync`.
    #[serde(default)]
    pub kind: Option<String>,
    /// Kind-specific settings; for `screen_sync` see [`ScreenSyncConfig`].
    #[serde(default)]
    pub config: Option<Value>,
}

/// Settings of a Screen Sync scene. Colour extraction runs in the client that
/// shares its screen; the server only needs the targets and restore behaviour,
/// but stores everything so every client syncs the same way.
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct ScreenSyncConfig {
    pub device_ids: Vec<String>,
    pub group_ids: Vec<String>,
    /// `vivid` (most saturated dominant hue), `dominant` (most common colour) or `average`.
    pub style: String,
    /// `full` screen or only the `edges` (ambilight-style).
    pub region: String,
    /// Dim the lights with dark scenes and brighten them with bright ones.
    pub follow_brightness: bool,
    pub min_brightness: u8,
    pub max_brightness: u8,
    /// 0 = instant, 100 = very smooth transitions.
    pub smoothing: u8,
    /// Samples per second taken from the screen.
    pub fps: u8,
    /// Put the lights back as they were when sharing stops.
    pub restore_on_stop: bool,
}

impl Default for ScreenSyncConfig {
    fn default() -> Self {
        Self {
            device_ids: Vec::new(),
            group_ids: Vec::new(),
            style: "vivid".into(),
            region: "full".into(),
            follow_brightness: true,
            min_brightness: 10,
            max_brightness: 100,
            smoothing: 40,
            fps: 10,
            restore_on_stop: true,
        }
    }
}

impl ScreenSyncConfig {
    fn normalize(mut self) -> ApiResult<Self> {
        if self.device_ids.is_empty() && self.group_ids.is_empty() {
            return Err(ApiError::BadRequest("Pick at least one light to sync".into()));
        }
        if !["vivid", "dominant", "average"].contains(&self.style.as_str()) {
            self.style = "vivid".into();
        }
        if !["full", "edges"].contains(&self.region.as_str()) {
            self.region = "full".into();
        }
        self.min_brightness = self.min_brightness.clamp(1, 100);
        self.max_brightness = self.max_brightness.clamp(self.min_brightness, 100);
        self.smoothing = self.smoothing.min(100);
        self.fps = self.fps.clamp(1, 30);
        Ok(self)
    }
}

/// The config of a Screen Sync scene, or `None` for missing / standard scenes.
pub async fn screen_sync_config(s: &AppState, scene_id: &str) -> Option<ScreenSyncConfig> {
    let row: Option<(String, String)> = sqlx::query_as("SELECT kind, config_json FROM scenes WHERE id = ?")
        .bind(scene_id)
        .fetch_optional(&s.pool)
        .await
        .ok()?;
    match row {
        Some((kind, json)) if kind == KIND_SCREEN_SYNC => serde_json::from_str(&json).ok(),
        _ => None,
    }
}

pub fn scene_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
        .route("/:id/activate", post(activate))
        .route("/:id/deactivate", post(deactivate))
        .route("/:id/toggle", post(toggle))
        .route("/:id/sync", get(screen_sync::sync_ws))
}

/// Every device a scene touches: its actions, or the lights of a Screen Sync scene.
async fn scene_devices(s: &AppState, row: &SceneRow) -> ApiResult<Vec<String>> {
    if row.kind != KIND_SCREEN_SYNC {
        return action_devices(s, serde_json::from_str(&row.actions_json).unwrap_or_default()).await;
    }
    let cfg: ScreenSyncConfig = serde_json::from_str(&row.config_json).unwrap_or_default();
    let mut ids = cfg.device_ids;
    for g in &cfg.group_ids {
        ids.extend(s.manager.group_device_ids(g).await?);
    }
    Ok(ids)
}

/// A scene is offered only to users who can see every device it touches.
async fn list(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<SceneDto>>> {
    let rows: Vec<SceneRow> = sqlx::query_as("SELECT * FROM scenes ORDER BY name COLLATE NOCASE")
        .fetch_all(&s.pool)
        .await?;
    let visible = visible_ids(&s, &user).await?;
    let mut out = Vec::with_capacity(rows.len());
    for row in rows {
        if visible.is_none() || sees_all(&visible, &scene_devices(&s, &row).await?) {
            out.push(row.into());
        }
    }
    Ok(Json(out))
}

/// Running a scene needs control of every device it touches: 404 when the user
/// is not offered the scene at all, 403 when some of its devices are see-only.
pub(super) async fn ensure_runnable(s: &AppState, user: &AuthUser, id: &str) -> ApiResult<()> {
    let visible = visible_ids(s, user).await?;
    if visible.is_none() {
        return Ok(());
    }
    let row: Option<SceneRow> = sqlx::query_as("SELECT * FROM scenes WHERE id = ?").bind(id).fetch_optional(&s.pool).await?;
    let Some(row) = row else { return Err(ApiError::NotFound("Scene not found".into())) };
    let ids = scene_devices(s, &row).await?;
    if !sees_all(&visible, &ids) {
        return Err(ApiError::NotFound("Scene not found".into()));
    }
    require_control_of(s, user, &ids).await
}

/// Validated scene columns: (kind, actions_json, config_json).
struct ValidScene {
    kind: &'static str,
    actions: String,
    config: String,
}

fn validate(req: &SceneRequest) -> ApiResult<ValidScene> {
    if req.name.trim().is_empty() {
        return Err(ApiError::BadRequest("Name is required".into()));
    }
    match req.kind.as_deref().unwrap_or(KIND_STANDARD) {
        KIND_STANDARD => {
            if req.actions.is_empty() {
                return Err(ApiError::BadRequest("Add at least one action".into()));
            }
            Ok(ValidScene {
                kind: KIND_STANDARD,
                actions: serde_json::to_string(&req.actions).unwrap_or_else(|_| "[]".into()),
                config: "{}".into(),
            })
        }
        KIND_SCREEN_SYNC => {
            let cfg: ScreenSyncConfig = serde_json::from_value(req.config.clone().unwrap_or(Value::Null))
                .map_err(|e| ApiError::BadRequest(format!("Invalid Screen Sync settings: {e}")))?;
            let cfg = cfg.normalize()?;
            Ok(ValidScene {
                kind: KIND_SCREEN_SYNC,
                actions: "[]".into(),
                config: serde_json::to_string(&cfg).unwrap_or_else(|_| "{}".into()),
            })
        }
        other => Err(ApiError::BadRequest(format!("Unknown scene type '{other}'"))),
    }
}

async fn create(State(s): State<AppState>, user: AuthUser, Json(req): Json<SceneRequest>) -> ApiResult<Json<SceneDto>> {
    user.require_admin()?;
    let v = validate(&req)?;
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    sqlx::query(
        "INSERT INTO scenes (id, name, icon, actions_json, is_active, created_at, kind, config_json) VALUES (?, ?, ?, ?, 0, ?, ?, ?)",
    )
    .bind(&id)
    .bind(req.name.trim())
    .bind(&req.icon)
    .bind(&v.actions)
    .bind(now)
    .bind(v.kind)
    .bind(&v.config)
    .execute(&s.pool)
    .await?;
    Ok(Json(SceneDto {
        id,
        name: req.name.trim().into(),
        icon: req.icon,
        actions: serde_json::from_str(&v.actions).unwrap_or_default(),
        is_active: false,
        created_at: now,
        kind: v.kind.into(),
        config: serde_json::from_str(&v.config).unwrap_or_default(),
    }))
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<SceneRequest>,
) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let v = validate(&req)?;
    let res = sqlx::query("UPDATE scenes SET name = ?, icon = ?, actions_json = ?, kind = ?, config_json = ? WHERE id = ?")
        .bind(req.name.trim())
        .bind(&req.icon)
        .bind(&v.actions)
        .bind(v.kind)
        .bind(&v.config)
        .bind(&id)
        .execute(&s.pool)
        .await?;
    if res.rows_affected() == 0 {
        return Err(ApiError::NotFound("Scene not found".into()));
    }
    Ok(Json(json!({ "success": true })))
}

async fn activate(
    State(s): State<AppState>,
    user: AuthUser,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(q): Query<Confirmed>,
) -> ApiResult<Json<Value>> {
    user.require_control()?;
    ensure_runnable(&s, &user, &id).await?;
    if screen_sync_config(&s, &id).await.is_some() {
        return Err(ApiError::BadRequest(
            "Screen Sync needs a screen to share. Start it from the Domus app on the device showing the content.".into(),
        ));
    }
    let actions = s
        .automations
        .scene_actions(&id)
        .await
        .ok_or_else(|| ApiError::NotFound("Scene not found".into()))?;
    s.automations.require_confirmed(&actions, q.confirmed).await?;
    let errors = s.automations.execute(&actions, 1, &Actor::user(&user, &headers)).await;
    sqlx::query("UPDATE scenes SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END")
        .bind(&id)
        .execute(&s.pool)
        .await?;
    Ok(Json(json!({ "success": errors.is_empty(), "errors": errors })))
}

async fn remove(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    screen_sync::stop_session(&id);
    sqlx::query("DELETE FROM scenes WHERE id = ?").bind(&id).execute(&s.pool).await?;
    Ok(Json(json!({ "success": true })))
}

#[derive(Deserialize, Default)]
pub struct ToggleRequest {
    pub on: Option<bool>,
}

async fn deactivate(
    State(s): State<AppState>,
    user: AuthUser,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(q): Query<Confirmed>,
) -> ApiResult<Json<Value>> {
    user.require_control()?;
    ensure_runnable(&s, &user, &id).await?;
    // Stopping a Screen Sync scene ends its live session; the session restores the lights.
    if screen_sync_config(&s, &id).await.is_some() {
        screen_sync::stop_session(&id);
        sqlx::query("UPDATE scenes SET is_active = 0 WHERE id = ?").bind(&id).execute(&s.pool).await?;
        return Ok(Json(json!({ "success": true, "errors": [] })));
    }
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

    s.automations.require_confirmed(&off_actions, q.confirmed).await?;
    let errors = s.automations.execute(&off_actions, 1, &Actor::user(&user, &headers)).await;
    sqlx::query("UPDATE scenes SET is_active = 0 WHERE id = ?")
        .bind(&id)
        .execute(&s.pool)
        .await?;
    Ok(Json(json!({ "success": errors.is_empty(), "errors": errors })))
}

async fn toggle(
    State(s): State<AppState>,
    user: AuthUser,
    headers: HeaderMap,
    Path(id): Path<String>,
    Query(q): Query<Confirmed>,
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
        activate(State(s), user, headers, Path(id), Query(q)).await
    } else {
        deactivate(State(s), user, headers, Path(id), Query(q)).await
    }
}

