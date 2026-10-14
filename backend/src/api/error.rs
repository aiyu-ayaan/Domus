use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use home_core::CoreError;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Bad Request: {0}")]
    BadRequest(String),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Not Found: {0}")]
    NotFound(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    /// Switching these devices needs the person's confirmation first (the devices that ask before switching).
    #[error("Confirmation needed: {}", .0.join(", "))]
    Confirm(Vec<String>),
    #[error("Too Many Requests: {0}")]
    TooManyRequests(String),
    /// Upstream device/cloud failure; message is safe to show.
    #[error("Bad Gateway: {0}")]
    Upstream(String),
    #[error("Internal Server Error: {0}")]
    Internal(String),
}

pub type ApiResult<T> = Result<T, ApiError>;

/// `?confirmed=true`: the person has said yes to the warning for devices that ask before switching.
#[derive(Debug, Default, serde::Deserialize)]
pub struct Confirmed {
    #[serde(default)]
    pub confirmed: bool,
}

/// Maps an error message and status to a stable catalog code and placeholder map for localized clients.
pub fn classify_error(status: StatusCode, message: &str) -> (&'static str, serde_json::Value) {
    match message {
        "Already exists" => ("error.already_exists", json!({})),
        "Referenced item does not exist" => ("error.reference_missing", json!({})),
        "Internal server error" => ("error.internal", json!({})),
        "Invalid or expired session" => ("error.session_expired", json!({})),
        "Administrator access required" => ("error.admin_required", json!({})),
        "Guests cannot control devices" => ("error.guest_no_control", json!({})),
        "Not signed in" => ("error.not_signed_in", json!({})),
        "Missing Authorization header" => ("error.missing_auth", json!({})),
        "Account no longer exists" => ("error.account_gone", json!({})),
        "Change your password first" => ("error.must_change_password", json!({})),
        "Device not found" => ("error.device_not_found", json!({})),
        "empty command" => ("error.empty_command", json!({})),
        "A scan is already running" => ("error.scan_running", json!({})),
        "Discovered device not found" => ("error.discovered_not_found", json!({})),
        "This device is already added" => ("error.device_already_added", json!({})),
        "Username must be at least 3 characters" => ("error.username_too_short", json!({})),
        "Password must be at least 8 characters" => ("error.password_too_short", json!({})),
        "Setup has already been completed" => ("error.setup_already_done", json!({})),
        "Invalid username or password" => ("error.invalid_credentials", json!({})),
        "That code is wrong or no longer valid. Ask an administrator for a new one." => ("error.invalid_reset_code", json!({})),
        "Current password is incorrect" => ("error.wrong_current_password", json!({})),
        "Choose a password different from the current one" => ("error.same_password", json!({})),
        "Avatar string too long" => ("error.avatar_too_long", json!({})),
        "Name is required" => ("error.name_required", json!({})),
        "Add at least one trigger" => ("error.trigger_required", json!({})),
        "Add at least one action" => ("error.action_required", json!({})),
        "Sunrise and sunset can be shifted by at most 6 hours" => ("error.sun_offset_range", json!({})),
        "A power trigger can wait 1 minute to 24 hours" => ("error.power_duration_range", json!({})),
        "Automation not found" => ("error.automation_not_found", json!({})),
        "You cannot edit this device" => ("error.cannot_edit_device", json!({})),
        "Only an administrator can move a device to another room" => ("error.admin_only_move_room", json!({})),
        "Name cannot be empty" => ("error.name_empty", json!({})),
        "You can see this device but not control it" => ("error.view_only_device", json!({})),
        "You can see these devices but not control them" => ("error.view_only_devices", json!({})),
        "Rates cannot be negative" => ("error.negative_rate", json!({})),
        "Billing day must be between 1 and 28" => ("error.invalid_billing_day", json!({})),
        "Currency must be a 3-letter ISO code" => ("error.invalid_currency", json!({})),
        "Each slab must end above the previous one" => ("error.slab_order", json!({})),
        "Only the last slab can be open-ended" => ("error.slab_open_ended", json!({})),
        "Time-of-use windows need a start and an end as HH:MM" => ("error.tou_format", json!({})),
        "A time-of-use window cannot start and end at the same time" => ("error.tou_zero_length", json!({})),
        "Time-of-use windows cannot overlap" => ("error.tou_overlap", json!({})),
        "Group not found" => ("error.group_not_found", json!({})),
        "Account not found" => ("error.account_not_found", json!({})),
        "Tuya integration is disabled" => ("error.tuya_disabled", json!({})),
        "Enter the User Code from the Smart Life app" => ("error.tuya_user_code_required", json!({})),
        "Email and password are required" => ("error.credentials_required", json!({})),
        "Verification expired; sign in again" => ("error.verification_expired", json!({})),
        "Port must be a number" => ("error.invalid_port", json!({})),
        "Enter the broker address" => ("error.broker_required", json!({})),
        "Philips Hue integration is disabled" => ("error.hue_disabled", json!({})),
        "Room name is required" => ("error.room_name_required", json!({})),
        "Room not found" => ("error.room_not_found", json!({})),
        "Pick at least one light to sync" => ("error.sync_lights_required", json!({})),
        "Scene not found" => ("error.scene_not_found", json!({})),
        "Screen Sync needs a screen to share. Start it from the Domus app on the device showing the content." => {
            ("error.screen_sync_needs_screen", json!({}))
        }
        "Place search is not reachable. Enter the latitude and longitude instead." => ("error.place_search_unreachable", json!({})),
        "Latitude is between -90 and 90, longitude between -180 and 180" => ("error.invalid_coordinates", json!({})),
        "Every suggested address for that username is taken" => ("error.email_suggestions_exhausted", json!({})),
        "role must be admin, member or guest" => ("error.invalid_role", json!({})),
        "A kid's account needs a password" => ("error.kid_password_required", json!({})),
        "That email is already used by another account" => ("error.email_taken", json!({})),
        "User not found" => ("error.user_not_found", json!({})),
        "There must be at least one administrator" => ("error.last_admin", json!({})),
        "You cannot delete your own account" => ("error.cannot_delete_self", json!({})),
        "Press the round button on the Hue bridge, then link again within 30 seconds" => ("error.hue_press_button", json!({})),
        "No Hue bridge found; enter its IP address" => ("error.hue_not_found", json!({})),
        "device no longer in Smart Life" => ("error.tuya_device_gone", json!({})),
        "device token is required" => ("error.device_token_required", json!({})),
        "Authentication failed: the Hue bridge no longer accepts this link; link it again" => ("error.hue_link_expired", json!({})),
        "Authentication failed: Hue bridge was removed" => ("error.hue_removed", json!({})),
        "Authentication failed: MQTT broker was removed" => ("error.mqtt_removed", json!({})),
        "Authentication failed: the device rejected your TP-Link account email/password" => ("error.tapo_auth_rejected", json!({})),
        "Authentication failed: add your TP-Link account to control Tapo devices" => ("error.tapo_account_required", json!({})),
        "Authentication failed: TP-Link account was removed" => ("error.tapo_removed", json!({})),
        "Authentication failed: Xiaomi asked for a captcha. Sign in once in the Mi Home app or browser, then retry" => {
            ("error.xiaomi_captcha", json!({}))
        }
        "Authentication failed: invalid Xiaomi username or password" => ("error.xiaomi_invalid_credentials", json!({})),
        "Authentication failed: wrong or expired verification code" => ("error.xiaomi_invalid_code", json!({})),
        "Authentication failed: Xiaomi did not accept the code" => ("error.xiaomi_code_rejected", json!({})),
        "Authentication failed: Xiaomi session expired" => ("error.xiaomi_session_expired", json!({})),
        "Authentication failed: Xiaomi wants a verification code; link the account again under Integrations" => {
            ("error.xiaomi_verify_needed", json!({}))
        }
        "Not supported: this device does not support that command" => ("error.unsupported_command", json!({})),
        "Not supported: this light cannot play that effect" => ("error.unsupported_effect", json!({})),
        "Not supported: this Xiaomi model has no MIoT spec" => ("error.xiaomi_no_spec", json!({})),
        _ => {
            if let Some(rest) = message.strip_prefix("Too many wrong passwords. Try again in ") {
                if let Some((minutes, _)) = rest.split_once(" minute") {
                    if let Ok(n) = minutes.parse::<i64>() {
                        return ("error.rate_limited", json!({ "count": n }));
                    }
                }
            }
            if let Some(integration) = message.strip_prefix("integration '").and_then(|s| s.strip_suffix("' is not enabled")) {
                return ("error.integration_disabled", json!({ "integration": integration }));
            }
            if let Some(time) = message.strip_prefix("Invalid time '").and_then(|s| s.strip_suffix("', use HH:MM")) {
                return ("error.invalid_time", json!({ "time": time }));
            }
            if let Some(reason) = message.strip_prefix("invalid actions: ") {
                return ("error.invalid_actions", json!({ "reason": reason }));
            }
            if let Some(regions) = message.strip_prefix("region must be one of ") {
                return ("error.invalid_region", json!({ "regions": regions }));
            }
            if let Some(reason) = message.strip_prefix("Invalid Screen Sync settings: ") {
                return ("error.invalid_sync_settings", json!({ "reason": reason }));
            }
            if let Some(kind) = message.strip_prefix("Unknown scene type '").and_then(|s| s.strip_suffix('\'')) {
                return ("error.unknown_scene_type", json!({ "kind": kind }));
            }
            if let Some(address) = message.strip_prefix('"').and_then(|s| s.strip_suffix("\" is not a server address")) {
                return ("error.invalid_server_address", json!({ "address": address }));
            }
            if let Some(reason) = message.strip_prefix("Authentication failed: Xiaomi could not send a verification code: ") {
                return ("error.xiaomi_send_code_failed", json!({ "reason": reason }));
            }
            if let Some(reason) = message.strip_prefix("Authentication failed: ") {
                return ("error.auth_failed", json!({ "reason": reason }));
            }
            if let Some(reason) = message.strip_prefix("Not supported: ") {
                return ("error.not_supported", json!({ "reason": reason }));
            }
            let fallback = match status {
                StatusCode::BAD_REQUEST => "error.bad_request",
                StatusCode::UNAUTHORIZED => "error.unauthorized",
                StatusCode::FORBIDDEN => "error.forbidden",
                StatusCode::NOT_FOUND => "error.not_found",
                StatusCode::CONFLICT => "error.conflict",
                StatusCode::TOO_MANY_REQUESTS => "error.too_many_requests",
                StatusCode::BAD_GATEWAY => "error.upstream",
                _ => "error.internal",
            };
            (fallback, json!({ "message": message }))
        }
    }
}

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        if let ApiError::Confirm(names) = &self {
            let joined = names.join(", ");
            let body = Json(json!({
                "error": {
                    "code": "error.confirm_switching",
                    "params": { "names": joined },
                    "message": format!("Confirm switching {joined}"),
                    "status": 428,
                    "confirm": names
                }
            }));
            return (StatusCode::PRECONDITION_REQUIRED, body).into_response();
        }
        let (status, message) = match self {
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            ApiError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            ApiError::Conflict(msg) => (StatusCode::CONFLICT, msg),
            ApiError::Confirm(_) => unreachable!("answered above"),
            ApiError::TooManyRequests(msg) => (StatusCode::TOO_MANY_REQUESTS, msg),
            ApiError::Upstream(msg) => (StatusCode::BAD_GATEWAY, msg),
            ApiError::Internal(msg) => {
                tracing::error!("internal error: {msg}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let (code, params) = classify_error(status, &message);
        let body = Json(json!({
            "error": {
                "code": code,
                "params": params,
                "message": message,
                "status": status.as_u16(),
            }
        }));

        (status, body).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        if let sqlx::Error::Database(db) = &e {
            if db.is_unique_violation() {
                return ApiError::Conflict("Already exists".into());
            }
            if db.is_foreign_key_violation() {
                return ApiError::BadRequest("Referenced item does not exist".into());
            }
        }
        ApiError::Internal(e.to_string())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        ApiError::Internal(format!("{e:#}"))
    }
}

impl From<CoreError> for ApiError {
    fn from(e: CoreError) -> Self {
        match e {
            CoreError::NotFound(m) => ApiError::NotFound(m),
            CoreError::ValidationError(m) => ApiError::BadRequest(m),
            CoreError::AuthError(m) => ApiError::Upstream(format!("Authentication failed: {m}")),
            CoreError::IntegrationError(m) => ApiError::Upstream(m),
            CoreError::Unsupported(m) => ApiError::BadRequest(format!("Not supported: {m}")),
            CoreError::Internal(m) => ApiError::Internal(m),
        }
    }
}
