//! Per-user device visibility: admins and "all rooms" members see everything;
//! everyone else only sees devices in rooms they were granted.

use super::model::DeviceRecord;
use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use std::collections::HashSet;

pub async fn allowed_rooms(s: &AppState, user: &AuthUser) -> ApiResult<Option<HashSet<String>>> {
    if user.sees_everything() {
        return Ok(None);
    }
    Ok(Some(s.manager.repo.allowed_rooms(&user.id).await?.into_iter().collect()))
}

pub fn can_see(rooms: &Option<HashSet<String>>, device: &DeviceRecord) -> bool {
    match rooms {
        None => true,
        Some(set) => device.room_id.as_ref().is_some_and(|r| set.contains(r)),
    }
}

pub async fn visible_devices(s: &AppState, user: &AuthUser) -> ApiResult<Vec<DeviceRecord>> {
    let rooms = allowed_rooms(s, user).await?;
    Ok(s
        .manager
        .repo
        .list_all()
        .await?
        .into_iter()
        .filter(|d| can_see(&rooms, d))
        .collect())
}

/// Load a device the user is allowed to see (404 otherwise, to avoid leaking ids).
pub async fn visible_device(s: &AppState, user: &AuthUser, id: &str) -> ApiResult<DeviceRecord> {
    let rec = s.manager.get(id).await?;
    if can_see(&allowed_rooms(s, user).await?, &rec) {
        Ok(rec)
    } else {
        Err(ApiError::NotFound("Device not found".into()))
    }
}
