use super::model::{AdoptRequest, DeviceDto, DiscoveryRecord, ManualAddRequest, UpdateDeviceRequest};
use super::service::{visible_device, visible_devices};
use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::SystemEvent;
use crate::integrations::manager::{DiscoveryReport, DiscoverySettings};
use axum::{
    extract::{Path, Query, State},
    routing::{get, post},
    Json, Router,
};
use home_core::DeviceCommand;
use serde::Deserialize;
use serde_json::{json, Value};

pub fn device_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list))
        .route("/manual", post(add_manual))
        .route("/effects", get(effects))
        .route("/:id", get(get_one).patch(update).delete(remove))
        .route("/:id/command", post(command))
        .route("/:id/refresh", post(refresh))
}

pub fn discovery_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list_discovered))
        .route("/scan", post(scan))
        .route("/settings", get(get_settings).put(put_settings))
        .route("/:id/adopt", post(adopt))
        .route("/:id/ignore", post(ignore))
        .route("/:id/restore", post(restore))
}

async fn list(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<DeviceDto>>> {
    Ok(Json(visible_devices(&s, &user).await?.iter().map(|d| d.to_dto()).collect()))
}

/// Light moods and effects clients can offer. Which effects a light can play is in its `options.effect`.
async fn effects(_user: AuthUser) -> Json<Value> {
    let mut catalog = home_core::effects::catalog();
    // Brand presets come first; a light only shows the ones it lists itself.
    if let Some(list) = catalog["effects"].as_array_mut() {
        list.splice(0..0, crate::integrations::tapo::preset_catalog());
    }
    Json(catalog)
}

async fn get_one(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<DeviceDto>> {
    Ok(Json(visible_device(&s, &user, &id).await?.to_dto()))
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateDeviceRequest>,
) -> ApiResult<Json<DeviceDto>> {
    user.require_admin()?;
    let rec = s.manager.get(&id).await?;
    let name = req.name.map(|n| n.trim().to_string()).unwrap_or(rec.name.clone());
    if name.is_empty() {
        return Err(ApiError::BadRequest("Name cannot be empty".into()));
    }
    let room = req.room_id.unwrap_or(rec.room_id.clone()).filter(|r| !r.is_empty());
    let icon = req.icon.unwrap_or(rec.icon.clone());
    s.manager.repo.update_meta(&id, &name, room.as_deref(), icon.as_deref()).await?;
    s.bus.publish(SystemEvent::DeviceUpdated { device_id: id.clone() });
    Ok(Json(s.manager.get(&id).await?.to_dto()))
}

async fn remove(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    s.manager.remove(&id).await?;
    Ok(Json(json!({ "success": true })))
}

async fn command(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(cmd): Json<DeviceCommand>,
) -> ApiResult<Json<DeviceDto>> {
    user.require_control()?;
    visible_device(&s, &user, &id).await?;
    s.manager.command(&id, &cmd).await?;
    Ok(Json(s.manager.get(&id).await?.to_dto()))
}

async fn refresh(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<DeviceDto>> {
    visible_device(&s, &user, &id).await?;
    s.manager.refresh(&id).await?;
    Ok(Json(s.manager.get(&id).await?.to_dto()))
}

async fn add_manual(
    State(s): State<AppState>,
    user: AuthUser,
    Json(req): Json<ManualAddRequest>,
) -> ApiResult<Json<DeviceDto>> {
    user.require_admin()?;
    Ok(Json(s.manager.add_manual(req).await?.to_dto()))
}

// --- discovery -------------------------------------------------------------

#[derive(Deserialize)]
struct DiscoveredQuery {
    status: Option<String>,
}

async fn list_discovered(
    State(s): State<AppState>,
    user: AuthUser,
    Query(q): Query<DiscoveredQuery>,
) -> ApiResult<Json<Vec<DiscoveryRecord>>> {
    user.require_admin()?;
    let status = q.status.unwrap_or_else(|| "pending".into());
    Ok(Json(s.manager.repo.discoveries(&status).await?))
}

async fn scan(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<DiscoveryReport>> {
    user.require_admin()?;
    Ok(Json(s.manager.discover().await?))
}

async fn adopt(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    body: Option<Json<AdoptRequest>>,
) -> ApiResult<Json<DeviceDto>> {
    user.require_admin()?;
    let req = body.map(|b| b.0).unwrap_or_default();
    Ok(Json(s.manager.adopt(&id, req).await?.to_dto()))
}

async fn ignore(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    s.manager.ignore(&id).await?;
    Ok(Json(json!({ "success": true })))
}

async fn restore(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    s.manager.repo.set_discovery_status(&id, "pending").await?;
    Ok(Json(json!({ "success": true })))
}

async fn get_settings(State(s): State<AppState>, _user: AuthUser) -> ApiResult<Json<DiscoverySettings>> {
    Ok(Json(s.manager.settings().await))
}

async fn put_settings(
    State(s): State<AppState>,
    user: AuthUser,
    Json(mut req): Json<DiscoverySettings>,
) -> ApiResult<Json<DiscoverySettings>> {
    user.require_admin()?;
    req.interval_minutes = req.interval_minutes.clamp(1, 24 * 60);
    s.manager.save_settings(&req).await?;
    Ok(Json(req))
}
