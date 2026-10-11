//! Per-user device access. Admins and "whole home" users reach everything;
//! everyone else reaches the rooms granted as a whole plus the devices granted
//! one by one, each at a level: see only, control, or edit (control plus renaming). Scenes, automations and groups
//! follow from the devices they touch.

use super::model::DeviceRecord;
use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::modules::auth::grants;
use home_core::Action;
use std::collections::{HashMap, HashSet};

/// What a grant lets the user do with a device. Each level includes the ones before it.
#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord)]
pub enum Level {
    View,
    Control,
    Edit,
}

impl Level {
    fn of(control: bool, edit: bool) -> Self {
        match (control, edit) {
            (false, _) => Self::View,
            (true, false) => Self::Control,
            (true, true) => Self::Edit,
        }
    }
}

/// What a restricted user was granted: id -> level.
#[derive(Default)]
pub struct Access {
    /// Rooms granted as a whole, including devices added to them later.
    pub rooms: HashMap<String, Level>,
    /// Single devices; the grant follows the device when it changes room.
    pub devices: HashMap<String, Level>,
}

impl Access {
    /// The grant that applies to a device: its own, else its room's.
    fn grant(&self, device: &DeviceRecord) -> Option<Level> {
        self.devices
            .get(&device.id)
            .or_else(|| device.room_id.as_ref().and_then(|r| self.rooms.get(r)))
            .copied()
    }

    pub fn allows(&self, device: &DeviceRecord) -> bool {
        self.grant(device).is_some()
    }

    pub fn controls(&self, device: &DeviceRecord) -> bool {
        self.grant(device) >= Some(Level::Control)
    }

    pub fn edits(&self, device: &DeviceRecord) -> bool {
        self.grant(device) == Some(Level::Edit)
    }
}

async fn levels(s: &AppState, kind: &str, user: &AuthUser) -> ApiResult<HashMap<String, Level>> {
    Ok(grants(&s.pool, kind, &user.id).await?.into_iter().map(|(id, c, e)| (id, Level::of(c, e))).collect())
}

/// `None` means no restriction.
pub async fn access(s: &AppState, user: &AuthUser) -> ApiResult<Option<Access>> {
    if user.sees_everything() {
        return Ok(None);
    }
    Ok(Some(Access { rooms: levels(s, "room", user).await?, devices: levels(s, "device", user).await? }))
}

pub fn can_see(access: &Option<Access>, device: &DeviceRecord) -> bool {
    access.as_ref().is_none_or(|a| a.allows(device))
}

pub async fn visible_devices(s: &AppState, user: &AuthUser) -> ApiResult<Vec<DeviceRecord>> {
    let access = access(s, user).await?;
    Ok(s
        .manager
        .repo
        .list_all()
        .await?
        .into_iter()
        .filter(|d| can_see(&access, d))
        .collect())
}

/// Whether the user may operate the device: guests never, others unless the grant is see-only.
pub fn can_control(access: &Option<Access>, user: &AuthUser, device: &DeviceRecord) -> bool {
    user.role.can_control() && access.as_ref().is_none_or(|a| a.controls(device))
}

/// Whether the user may rename the device. Whole-home members control but do not edit: that takes an
/// edit grant (custom access) or the administrator role.
pub fn can_edit(access: &Option<Access>, user: &AuthUser, device: &DeviceRecord) -> bool {
    user.role.can_control()
        && match access {
            None => user.is_admin(),
            Some(a) => a.edits(device),
        }
}

/// Ids of the devices the user can see; `None` means all of them.
pub async fn visible_ids(s: &AppState, user: &AuthUser) -> ApiResult<Option<HashSet<String>>> {
    if user.sees_everything() {
        return Ok(None);
    }
    Ok(Some(visible_devices(s, user).await?.into_iter().map(|d| d.id).collect()))
}

/// Ids of the devices the user's grants let them control; `None` means all of them.
/// The guest role is checked separately (`AuthUser::require_control`).
pub async fn controllable_ids(s: &AppState, user: &AuthUser) -> ApiResult<Option<HashSet<String>>> {
    let Some(access) = access(s, user).await? else { return Ok(None) };
    Ok(Some(s.manager.repo.list_all().await?.into_iter().filter(|d| access.controls(d)).map(|d| d.id).collect()))
}

/// 403 unless the user's grants let them control every device in `ids`.
pub async fn require_control_of(s: &AppState, user: &AuthUser, ids: &[String]) -> ApiResult<()> {
    if sees_all(&controllable_ids(s, user).await?, ids) {
        Ok(())
    } else {
        Err(ApiError::Forbidden("You can see these devices but not control them".into()))
    }
}

/// Whether every id is visible. Ids of deleted devices count as hidden.
pub fn sees_all(visible: &Option<HashSet<String>>, ids: &[String]) -> bool {
    visible.as_ref().is_none_or(|v| ids.iter().all(|id| v.contains(id)))
}

/// Every device the actions reach, following groups and nested scenes.
pub async fn action_devices(s: &AppState, actions: Vec<Action>) -> ApiResult<Vec<String>> {
    let mut ids = Vec::new();
    let mut scenes = HashSet::new();
    let mut todo = actions;
    while let Some(action) = todo.pop() {
        match action {
            Action::DeviceCommand { device_id, .. } => ids.push(device_id),
            Action::GroupCommand { group_id, .. } => ids.extend(s.manager.group_device_ids(&group_id).await?),
            Action::Scene { scene_id } => {
                if scenes.insert(scene_id.clone()) {
                    todo.extend(s.automations.scene_actions(&scene_id).await.unwrap_or_default());
                }
            }
            Action::Notify { .. } | Action::Delay { .. } => {}
        }
    }
    Ok(ids)
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::Utc;

    fn device(id: &str, room: Option<&str>) -> DeviceRecord {
        DeviceRecord {
            id: id.into(),
            name: id.into(),
            room_id: room.map(Into::into),
            integration_type: "tuya".into(),
            device_type: "light".into(),
            model: None,
            ip_address: None,
            mac_address: None,
            config_json: "{}".into(),
            state_json: "{}".into(),
            is_online: true,
            created_at: Utc::now(),
            updated_at: Utc::now(),
            external_id: None,
            account_id: None,
            secrets_enc: None,
            icon: None,
            last_seen: None,
        }
    }

    #[test]
    fn room_and_device_grants() {
        let access = Some(Access {
            rooms: HashMap::from([("bedroom".to_string(), Level::Control), ("study".to_string(), Level::View), ("den".to_string(), Level::Edit)]),
            devices: HashMap::from([("lamp".to_string(), Level::Control), ("loose".to_string(), Level::View), ("safe".to_string(), Level::View)]),
        });
        // A whole-room grant covers everything in the room.
        assert!(can_see(&access, &device("fan", Some("bedroom"))));
        // A device grant opens one device, not its room.
        assert!(can_see(&access, &device("lamp", Some("living"))));
        assert!(!can_see(&access, &device("lock", Some("living"))));
        // Devices without a room are reachable only by a device grant.
        assert!(can_see(&access, &device("loose", None)));
        assert!(!can_see(&access, &device("other", None)));
        assert!(can_see(&None, &device("lock", Some("living"))));

        let a = access.as_ref().unwrap();
        assert!(a.controls(&device("fan", Some("bedroom"))));
        // See-only room, see-only device, and nothing granted: no control.
        assert!(!a.controls(&device("desk", Some("study"))));
        assert!(!a.controls(&device("loose", None)));
        assert!(!a.controls(&device("lock", Some("living"))));
        // The device's own grant wins over its room's, both ways.
        assert!(!a.controls(&device("safe", Some("bedroom"))));
        assert!(a.controls(&device("lamp", Some("study"))));
        // Edit includes control; control does not include edit.
        assert!(a.controls(&device("tv", Some("den"))) && a.edits(&device("tv", Some("den"))));
        assert!(!a.edits(&device("fan", Some("bedroom"))) && !a.edits(&device("desk", Some("study"))));
    }

    #[test]
    fn sees_all_needs_every_id() {
        let visible = Some(HashSet::from(["a".to_string()]));
        assert!(sees_all(&visible, &["a".into()]));
        assert!(!sees_all(&visible, &["a".into(), "gone".into()]));
        assert!(sees_all(&None, &["gone".into()]));
    }
}
