//! Plugin catalog and account linking (Tuya QR login, Tapo and Xiaomi sign-in, MQTT broker and Hue bridge forms).

use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::SystemEvent;
use crate::integrations::accounts::AccountRecord;
use crate::integrations::hue::HueIntegration;
use crate::integrations::mqtt;
use crate::integrations::tapo::klap::TapoCredentials;
use crate::integrations::tuya::api as tuya;
use crate::integrations::xiaomi::cloud;
use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Json, Router,
};
use home_core::IntegrationType;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::time::{Duration, Instant};

/// Pending Tuya QR logins: qr token -> (user code, created).
pub type TuyaLogins = std::sync::Arc<tokio::sync::Mutex<std::collections::HashMap<String, (String, Instant)>>>;

/// Xiaomi sign-ins waiting for a 2FA code: verify id -> (login, created).
pub type XiaomiLogins = std::sync::Arc<tokio::sync::Mutex<std::collections::HashMap<String, (std::sync::Arc<cloud::PendingLogin>, Instant)>>>;

const QR_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Serialize)]
struct CatalogEntry {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    /// How an account is linked: "qr", "credentials", "form" or "none".
    link: &'static str,
    /// Inputs of a "form" link; posted as strings to `/integrations/<id>/accounts`.
    fields: &'static [FormField],
    local: bool,
    enabled: bool,
    accounts: Vec<AccountRecord>,
    device_count: i64,
}

#[derive(Serialize)]
struct FormField {
    key: &'static str,
    label: &'static str,
    /// "text", "password" or "number".
    kind: &'static str,
    required: bool,
    hint: &'static str,
    default: &'static str,
}

const fn field(key: &'static str, label: &'static str, kind: &'static str, required: bool, hint: &'static str, default: &'static str) -> FormField {
    FormField { key, label, kind, required, hint, default }
}

const MQTT_FIELDS: &[FormField] = &[
    field("host", "Broker address", "text", true, "IP address or hostname, e.g. 192.168.1.10.", ""),
    field("port", "Port", "number", true, "Usually 1883. Port 8883 connects with TLS.", "1883"),
    field("username", "Username", "text", false, "Leave empty if the broker allows anonymous clients.", ""),
    field("password", "Password", "password", false, "", ""),
];

const HUE_FIELDS: &[FormField] = &[
    field("host", "Bridge IP address", "text", false, "Press the round button on the bridge first, then link within 30 seconds. Leave empty to find the bridge automatically.", ""),
];

const CATALOG: &[(IntegrationType, &str, &str, &str, bool, &[FormField])] = &[
    (IntegrationType::Tuya, "Tuya / Smart Life", "Plugs, switches, lights and purifiers from the Smart Life and Tuya Smart apps. Linked by scanning a QR code — no developer account needed.", "qr", false, &[]),
    (IntegrationType::Tapo, "TP-Link Tapo", "Tapo plugs, bulbs, switches and the H100 hub with its sensors, controlled locally over your network. Energy monitoring on P110/P115.", "credentials", true, &[]),
    (IntegrationType::Xiaomi, "Xiaomi Mi Home", "Mi Home / MIoT devices such as air purifiers, lamps and plugs. Tokens come from your Xiaomi account; control is local.", "credentials", true, &[]),
    (IntegrationType::Mqtt, "MQTT", "Any device that announces itself on your MQTT broker through Home Assistant discovery: Zigbee2MQTT, ESPHome and many more brands. Lights, switches, plugs, fans and sensors.", "form", true, MQTT_FIELDS),
    (IntegrationType::Hue, "Philips Hue", "Lights and smart plugs paired with a Hue bridge, controlled locally over your network. Linked by pressing the button on the bridge.", "form", true, HUE_FIELDS),
];

pub fn integration_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(catalog))
        .route("/accounts/:id", delete(remove_account))
        .route("/tuya/qr", post(tuya_qr_start))
        .route("/tuya/qr/:token", get(tuya_qr_poll))
        .route("/tapo/accounts", post(tapo_link))
        .route("/mqtt/accounts", post(mqtt_link))
        .route("/hue/accounts", post(hue_link))
        .route("/xiaomi/accounts", post(xiaomi_link))
        .route("/xiaomi/verify", post(xiaomi_verify))
}

async fn catalog(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<Value>>> {
    let enabled = s.manager.enabled_integrations();
    let counts: Vec<(String, i64)> = sqlx::query_as("SELECT integration_type, COUNT(*) FROM devices GROUP BY integration_type")
        .fetch_all(&s.pool)
        .await?;
    let accounts = if user.is_admin() { s.manager.accounts.list(None).await? } else { vec![] };
    let out = CATALOG
        .iter()
        .map(|(t, name, description, link, local, fields)| {
            let entry = CatalogEntry {
                id: t.as_str(),
                name,
                description,
                link,
                fields,
                local: *local,
                enabled: enabled.contains(t),
                accounts: accounts.iter().filter(|a| a.integration_type == t.as_str()).cloned().collect(),
                device_count: counts.iter().find(|(k, _)| k == t.as_str()).map_or(0, |c| c.1),
            };
            serde_json::to_value(entry).unwrap_or_default()
        })
        .collect();
    Ok(Json(out))
}

/// Scan right after an account is linked so its devices show up immediately.
fn discover_soon(s: &AppState) {
    let manager = s.manager.clone();
    tokio::spawn(async move {
        if let Err(e) = manager.discover().await {
            tracing::debug!("post-link discovery: {e}");
        }
    });
}

async fn remove_account(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let devices: Vec<(String,)> = sqlx::query_as("SELECT id FROM devices WHERE account_id = ?")
        .bind(&id)
        .fetch_all(&s.pool)
        .await?;
    for (device_id,) in &devices {
        s.manager.remove(device_id).await?;
    }
    s.manager
        .accounts
        .delete(&id)
        .await?
        .ok_or_else(|| ApiError::NotFound("Account not found".into()))?;
    s.bus.publish(SystemEvent::IntegrationsChanged);
    Ok(Json(json!({ "success": true, "removed_devices": devices.len() })))
}

// --- Tuya QR -----------------------------------------------------------------

#[derive(Deserialize)]
struct QrStart {
    user_code: String,
}

async fn tuya_qr_start(State(s): State<AppState>, user: AuthUser, Json(req): Json<QrStart>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let tuya_plugin = s.tuya.as_ref().ok_or_else(|| ApiError::BadRequest("Tuya integration is disabled".into()))?;
    let code = req.user_code.trim();
    if code.is_empty() {
        return Err(ApiError::BadRequest("Enter the User Code from the Smart Life app".into()));
    }
    let token = tuya::request_qr_token(tuya_plugin.http(), code).await?;
    let mut pending = s.tuya_logins.lock().await;
    pending.retain(|_, (_, at)| at.elapsed() < QR_TTL);
    pending.insert(token.clone(), (code.to_string(), Instant::now()));
    Ok(Json(json!({
        "qr_token": token,
        "qr_content": tuya::qr_content(&token),
        "expires_in": QR_TTL.as_secs(),
    })))
}

async fn tuya_qr_poll(State(s): State<AppState>, user: AuthUser, Path(token): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let tuya_plugin = s.tuya.as_ref().ok_or_else(|| ApiError::BadRequest("Tuya integration is disabled".into()))?;
    let user_code = {
        let pending = s.tuya_logins.lock().await;
        match pending.get(&token) {
            Some((code, at)) if at.elapsed() < QR_TTL => code.clone(),
            _ => return Ok(Json(json!({ "status": "expired" }))),
        }
    };
    let Some(creds) = tuya::poll_qr_login(tuya_plugin.http(), &token, &user_code).await? else {
        return Ok(Json(json!({ "status": "waiting" })));
    };
    s.tuya_logins.lock().await.remove(&token);

    let name = if creds.username.is_empty() { format!("Smart Life {}", creds.uid) } else { creds.username.clone() };
    let value = serde_json::to_value(&creds).map_err(|e| ApiError::Internal(e.to_string()))?;
    let id = match s.manager.accounts.find_by_name("tuya", &name).await? {
        Some(existing) => {
            s.manager.accounts.update_credentials(&existing.id, &value).await?;
            existing.id
        }
        None => s.manager.accounts.create("tuya", &name, &value).await?,
    };
    s.bus.publish(SystemEvent::IntegrationsChanged);
    discover_soon(&s);
    Ok(Json(json!({ "status": "linked", "account_id": id, "name": name })))
}

// --- Tapo / Xiaomi -----------------------------------------------------------

async fn tapo_link(State(s): State<AppState>, user: AuthUser, Json(req): Json<TapoCredentials>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    if req.username.trim().is_empty() || req.password.is_empty() {
        return Err(ApiError::BadRequest("Email and password are required".into()));
    }
    let creds = TapoCredentials { username: req.username.trim().into(), password: req.password };
    let value = serde_json::to_value(&creds).map_err(|e| ApiError::Internal(e.to_string()))?;
    // Tapo credentials can only be verified against a device, which discovery does next.
    let id = match s.manager.accounts.find_by_name("tapo", &creds.username).await? {
        Some(existing) => {
            s.manager.accounts.update_credentials(&existing.id, &value).await?;
            existing.id
        }
        None => s.manager.accounts.create("tapo", &creds.username, &value).await?,
    };
    s.bus.publish(SystemEvent::IntegrationsChanged);
    discover_soon(&s);
    Ok(Json(json!({ "account_id": id })))
}

#[derive(Deserialize)]
struct XiaomiLink {
    username: String,
    password: String,
    #[serde(default = "default_region")]
    region: String,
}

fn default_region() -> String {
    "de".into()
}

async fn xiaomi_link(State(s): State<AppState>, user: AuthUser, Json(req): Json<XiaomiLink>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    if !cloud::REGIONS.contains(&req.region.as_str()) {
        return Err(ApiError::BadRequest(format!("region must be one of {}", cloud::REGIONS.join(", "))));
    }
    let creds = match cloud::login(req.username.trim(), &req.password, &req.region, None).await? {
        cloud::Login::Done(c) => c,
        cloud::Login::NeedsCode(pending) => {
            let via = pending.via();
            let verify_id = uuid::Uuid::new_v4().to_string();
            let mut logins = s.xiaomi_logins.lock().await;
            logins.retain(|_, (_, at)| at.elapsed() < QR_TTL);
            logins.insert(verify_id.clone(), (std::sync::Arc::new(pending), Instant::now()));
            return Ok(Json(json!({ "verify_id": verify_id, "via": via })));
        }
    };
    save_xiaomi(&s, creds).await
}

#[derive(Deserialize)]
struct XiaomiVerify {
    verify_id: String,
    code: String,
}

async fn xiaomi_verify(State(s): State<AppState>, user: AuthUser, Json(req): Json<XiaomiVerify>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let pending = match s.xiaomi_logins.lock().await.get(&req.verify_id) {
        Some((p, at)) if at.elapsed() < QR_TTL => p.clone(),
        _ => return Err(ApiError::BadRequest("Verification expired; sign in again".into())),
    };
    let creds = cloud::verify(&pending, req.code.trim()).await?;
    s.xiaomi_logins.lock().await.remove(&req.verify_id);
    save_xiaomi(&s, creds).await
}

async fn save_xiaomi(s: &AppState, creds: cloud::XiaomiCredentials) -> ApiResult<Json<Value>> {
    let value = serde_json::to_value(&creds).map_err(|e| ApiError::Internal(e.to_string()))?;
    let id = match s.manager.accounts.find_by_name("xiaomi", &creds.username).await? {
        Some(existing) => {
            s.manager.accounts.update_credentials(&existing.id, &value).await?;
            existing.id
        }
        None => s.manager.accounts.create("xiaomi", &creds.username, &value).await?,
    };
    s.bus.publish(SystemEvent::IntegrationsChanged);
    discover_soon(s);
    Ok(Json(json!({ "account_id": id })))
}

// --- Form links ----------------------------------------------------------------

type Form = std::collections::HashMap<String, String>;

/// Store a linked account, replacing the one with the same name.
async fn save_account(s: &AppState, kind: &str, name: &str, credentials: &impl Serialize) -> ApiResult<Json<Value>> {
    let value = serde_json::to_value(credentials).map_err(|e| ApiError::Internal(e.to_string()))?;
    let id = match s.manager.accounts.find_by_name(kind, name).await? {
        Some(existing) => {
            s.manager.accounts.update_credentials(&existing.id, &value).await?;
            existing.id
        }
        None => s.manager.accounts.create(kind, name, &value).await?,
    };
    s.bus.publish(SystemEvent::IntegrationsChanged);
    discover_soon(s);
    Ok(Json(json!({ "account_id": id })))
}

async fn mqtt_link(State(s): State<AppState>, user: AuthUser, Json(form): Json<Form>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let get = |k: &str| form.get(k).map_or("", |v| v.trim());
    let broker = mqtt::Broker {
        host: get("host").into(),
        port: if get("port").is_empty() { 1883 } else { get("port").parse().map_err(|_| ApiError::BadRequest("Port must be a number".into()))? },
        username: get("username").into(),
        password: form.get("password").cloned().unwrap_or_default(),
    };
    if broker.host.is_empty() {
        return Err(ApiError::BadRequest("Enter the broker address".into()));
    }
    mqtt::check(&broker).await?;
    save_account(&s, "mqtt", &format!("{}:{}", broker.host, broker.port), &broker).await
}

async fn hue_link(State(s): State<AppState>, user: AuthUser, Json(form): Json<Form>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    if !s.manager.enabled_integrations().contains(&IntegrationType::Hue) {
        return Err(ApiError::BadRequest("Philips Hue integration is disabled".into()));
    }
    let (bridge, name) = HueIntegration::new().pair(form.get("host").map_or("", |h| h.trim())).await?;
    save_account(&s, "hue", &name, &bridge).await
}
