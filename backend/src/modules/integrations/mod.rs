//! Plugin catalog and account linking (Tuya QR login, Tapo and Xiaomi sign-in).

use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::SystemEvent;
use crate::integrations::accounts::AccountRecord;
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

const QR_TTL: Duration = Duration::from_secs(5 * 60);

#[derive(Serialize)]
struct CatalogEntry {
    id: &'static str,
    name: &'static str,
    description: &'static str,
    /// How an account is linked: "qr", "credentials" or "none".
    link: &'static str,
    local: bool,
    enabled: bool,
    accounts: Vec<AccountRecord>,
    device_count: i64,
}

const CATALOG: &[(IntegrationType, &str, &str, &str, bool)] = &[
    (IntegrationType::Tuya, "Tuya / Smart Life", "Plugs, switches, lights and purifiers from the Smart Life and Tuya Smart apps. Linked by scanning a QR code — no developer account needed.", "qr", false),
    (IntegrationType::Tapo, "TP-Link Tapo", "Tapo plugs, bulbs and switches, controlled locally over your network. Energy monitoring on P110/P115.", "credentials", true),
    (IntegrationType::Xiaomi, "Xiaomi Mi Home", "Mi Home / MIoT devices such as air purifiers, lamps and plugs. Tokens come from your Xiaomi account; control is local.", "credentials", true),
];

pub fn integration_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(catalog))
        .route("/accounts/:id", delete(remove_account))
        .route("/tuya/qr", post(tuya_qr_start))
        .route("/tuya/qr/:token", get(tuya_qr_poll))
        .route("/tapo/accounts", post(tapo_link))
        .route("/xiaomi/accounts", post(xiaomi_link))
}

async fn catalog(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<Value>>> {
    let enabled = s.manager.enabled_integrations();
    let counts: Vec<(String, i64)> = sqlx::query_as("SELECT integration_type, COUNT(*) FROM devices GROUP BY integration_type")
        .fetch_all(&s.pool)
        .await?;
    let accounts = if user.is_admin() { s.manager.accounts.list(None).await? } else { vec![] };
    let out = CATALOG
        .iter()
        .map(|(t, name, description, link, local)| {
            let entry = CatalogEntry {
                id: t.as_str(),
                name,
                description,
                link,
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
    let creds = cloud::login(req.username.trim(), &req.password, &req.region).await?;
    let value = serde_json::to_value(&creds).map_err(|e| ApiError::Internal(e.to_string()))?;
    let id = match s.manager.accounts.find_by_name("xiaomi", &creds.username).await? {
        Some(existing) => {
            s.manager.accounts.update_credentials(&existing.id, &value).await?;
            existing.id
        }
        None => s.manager.accounts.create("xiaomi", &creds.username, &value).await?,
    };
    s.bus.publish(SystemEvent::IntegrationsChanged);
    discover_soon(&s);
    Ok(Json(json!({ "account_id": id })))
}
