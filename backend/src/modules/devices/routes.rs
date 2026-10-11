use super::model::{AdoptRequest, DeviceDto, DeviceRecord, DiscoveryRecord, ManualAddRequest, UpdateDeviceRequest};
use super::service::{access, can_control, can_edit, can_see, Access};
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

/// The device as this user gets it, or 404 when it is not theirs to see (so ids are not confirmed).
fn dto_for(access: &Option<Access>, user: &AuthUser, rec: &DeviceRecord) -> ApiResult<DeviceDto> {
    if !can_see(access, rec) {
        return Err(ApiError::NotFound("Device not found".into()));
    }
    Ok(DeviceDto { can_control: can_control(access, user, rec), can_edit: can_edit(access, user, rec), ..rec.to_dto() })
}

async fn list(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<DeviceDto>>> {
    let access = access(&s, &user).await?;
    Ok(Json(s.manager.repo.list_all().await?.iter().filter_map(|d| dto_for(&access, &user, d).ok()).collect()))
}

/// Light moods and effects clients can offer. Which effects a light can play is in its `options.effect`.
async fn effects(_user: AuthUser) -> Json<Value> {
    Json(home_core::effects::catalog())
}

async fn get_one(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<DeviceDto>> {
    Ok(Json(dto_for(&access(&s, &user).await?, &user, &s.manager.get(&id).await?)?))
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateDeviceRequest>,
) -> ApiResult<Json<DeviceDto>> {
    let rec = s.manager.get(&id).await?;
    // Administrators change anything. Others need an edit grant, and may rename but not move a device.
    if !user.is_admin() {
        if !dto_for(&access(&s, &user).await?, &user, &rec)?.can_edit {
            return Err(ApiError::Forbidden("You cannot edit this device".into()));
        }
        if req.room_id.is_some() {
            return Err(ApiError::Forbidden("Only an administrator can move a device to another room".into()));
        }
    }
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
    let access = access(&s, &user).await?;
    if !dto_for(&access, &user, &s.manager.get(&id).await?)?.can_control {
        return Err(ApiError::Forbidden("You can see this device but not control it".into()));
    }
    s.manager.command(&id, &cmd).await?;
    dto_for(&access, &user, &s.manager.get(&id).await?).map(Json)
}

async fn refresh(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<DeviceDto>> {
    let access = access(&s, &user).await?;
    dto_for(&access, &user, &s.manager.get(&id).await?)?;
    s.manager.refresh(&id).await?;
    dto_for(&access, &user, &s.manager.get(&id).await?).map(Json)
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
