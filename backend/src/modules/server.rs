//! Where clients reach this server: on the home network and from outside (a
//! tunnel or reverse proxy). Apps save both, use the local address at home and
//! the remote one elsewhere; a session token is valid on either, so switching
//! never asks the user to sign in again.

use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::database::{get_setting, set_setting};
use axum::{extract::State, routing::get, Json, Router};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};

const KEY: &str = "server_links";

/// What the running server knows about itself.
#[derive(Debug, Clone, Default)]
pub struct ServerInfo {
    /// `https://<lan-ip>:<port>`, offered until an admin sets the local address.
    pub default_local_url: String,
    /// SHA-256 of the TLS certificate, so an app that arrived by the remote
    /// address can trust the self-signed local one.
    pub fingerprint: Option<String>,
}

#[derive(Debug, Default, Serialize, Deserialize)]
pub struct ServerLinks {
    #[serde(default)]
    pub local_url: String,
    #[serde(default)]
    pub remote_url: String,
}

pub fn server_routes() -> Router<AppState> {
    Router::new().route("/links", get(get_links).put(put_links))
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
