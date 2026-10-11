//! Where clients reach this server: on the home network and from outside (a
//! tunnel or reverse proxy). Apps save both, use the local address at home and
//! the remote one elsewhere; a session token is valid on either, so switching
//! never asks the user to sign in again.

use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::database::{get_setting, set_setting};
use axum::{
    body::Body,
    extract::State,
    http::header,
    response::{IntoResponse, Response},
    routing::get,
    Json, Router,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tokio::io::AsyncReadExt;

const KEY: &str = "server_links";

/// What the running server knows about itself.
#[derive(Debug, Clone, Default)]
pub struct ServerInfo {
    /// `https://<lan-ip>:<port>`, offered until an admin sets the local address.
    pub default_local_url: String,
    /// SHA-256 of the TLS certificate, so an app that arrived by the remote
    /// address can trust the self-signed local one.
    pub fingerprint: Option<String>,
    /// Where the database and the master key live; a backup is staged here.
    pub data_dir: std::path::PathBuf,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ServerLinks {
    #[serde(default)]
    pub local_url: String,
    #[serde(default)]
    pub remote_url: String,
}

const LOCATION_KEY: &str = "location";

/// Where the home is, for sunrise and sunset. Unset until an administrator saves it.
#[derive(Debug, Clone, Copy, Serialize, Deserialize)]
pub struct HomeLocation {
    pub latitude: f64,
    pub longitude: f64,
}

/// The saved (latitude, longitude).
pub async fn location(pool: &sqlx::SqlitePool) -> Option<(f64, f64)> {
    get_setting::<HomeLocation>(pool, LOCATION_KEY).await.map(|l| (l.latitude, l.longitude))
}

pub fn server_routes() -> Router<AppState> {
    Router::new()
        .route("/links", get(get_links).put(put_links))
        .route("/location", get(get_location).put(put_location))
        .route("/backup", get(backup))
}

/// The location with today's sunrise and sunset, so the editors can show what a sun trigger means.
async fn get_location(State(s): State<AppState>, _user: AuthUser) -> Json<Value> {
    let place = location(&s.pool).await;
    let sun = place.and_then(|(lat, lon)| home_core::sun_times(chrono::Local::now().date_naive(), lat, lon));
    Json(json!({
        "latitude": place.map(|p| p.0),
        "longitude": place.map(|p| p.1),
        "sunrise": sun.map(|s| s.0),
        "sunset": sun.map(|s| s.1),
    }))
}

async fn put_location(State(s): State<AppState>, user: AuthUser, Json(req): Json<HomeLocation>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    if !(-90.0..=90.0).contains(&req.latitude) || !(-180.0..=180.0).contains(&req.longitude) {
        return Err(ApiError::BadRequest("Latitude is between -90 and 90, longitude between -180 and 180".into()));
    }
    set_setting(&s.pool, LOCATION_KEY, &req).await?;
    Ok(get_location(State(s), user).await)
}

/// The whole home as one SQLite file to download: the database with the master key inside.
/// Restored with `domus-backend restore <file>`.
async fn backup(State(s): State<AppState>, user: AuthUser) -> ApiResult<Response> {
    user.require_admin()?;
    let path = s.server.data_dir.join(format!("backup-{}.db", uuid::Uuid::new_v4()));
    let written = crate::infrastructure::backup::write(&s.pool, &s.server.data_dir, &path).await;
    let opened = tokio::fs::File::open(&path).await;
    // Unlinked while open: the copy is gone from disk as soon as the download ends or is dropped.
    let _ = tokio::fs::remove_file(&path).await;
    written?;
    let file = opened.map_err(|e| ApiError::Internal(e.to_string()))?;
    let len = file.metadata().await.map_err(|e| ApiError::Internal(e.to_string()))?.len();
    // A read error ends the stream early; the length header lets the client notice.
    let chunks = futures::stream::unfold(file, |mut file| async move {
        let mut buf = vec![0u8; 64 * 1024];
        let n = file.read(&mut buf).await.ok().filter(|n| *n > 0)?;
        buf.truncate(n);
        Some((Ok::<_, std::io::Error>(buf), file))
    });
    let name = format!("domus-backup-{}.db", chrono::Local::now().format("%Y-%m-%d"));
    Ok((
        [
            (header::CONTENT_TYPE, "application/vnd.sqlite3".to_string()),
            (header::CONTENT_LENGTH, len.to_string()),
            (header::CONTENT_DISPOSITION, format!("attachment; filename=\"{name}\"")),
            (header::CACHE_CONTROL, "no-store".to_string()),
        ],
        Body::from_stream(chunks),
    )
        .into_response())
}

async fn get_links(State(s): State<AppState>, _user: AuthUser) -> Json<Value> {
    let mut links: ServerLinks = get_setting(&s.pool, KEY).await.unwrap_or_default();
    if links.local_url.is_empty() {
        links.local_url = s.server.default_local_url.clone();
    }
    Json(json!({ "local_url": links.local_url, "remote_url": links.remote_url, "fingerprint": s.server.fingerprint }))
}

async fn put_links(State(s): State<AppState>, user: AuthUser, Json(req): Json<ServerLinks>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    let links = ServerLinks { local_url: normalize(&req.local_url)?, remote_url: normalize(&req.remote_url)? };
    set_setting(&s.pool, KEY, &links).await?;
    Ok(get_links(State(s), user).await)
}

/// Empty stays empty (unset); otherwise the origin of an http(s) URL. A bare
/// `host:port` gets `https://`.
fn normalize(input: &str) -> Result<String, ApiError> {
    let input = input.trim();
    if input.is_empty() {
        return Ok(String::new());
    }
    let with_scheme = if input.contains("://") { input.to_string() } else { format!("https://{input}") };
    reqwest::Url::parse(&with_scheme)
        .ok()
        .filter(|u| matches!(u.scheme(), "http" | "https") && u.host_str().is_some())
        .map(|u| u.origin().ascii_serialization())
        .ok_or_else(|| ApiError::BadRequest(format!("\"{input}\" is not a server address")))
}

#[cfg(test)]
mod tests {
    use super::normalize;

    #[test]
    fn addresses_become_origins() {
        assert_eq!(normalize("").unwrap(), "");
        assert_eq!(normalize(" home.example.com/ ").unwrap(), "https://home.example.com");
        assert_eq!(normalize("192.168.1.10:8443").unwrap(), "https://192.168.1.10:8443");
        assert_eq!(normalize("https://home.example.com/app?x=1").unwrap(), "https://home.example.com");
        assert!(normalize("ftp://home.example.com").is_err());
        assert!(normalize("not a url").is_err());
    }
}
