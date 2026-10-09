//! Tuya "device sharing" customer API — the same API Home Assistant's Tuya
//! integration uses after the Smart Life QR-code login. Requests are signed
//! with HMAC-SHA256 and query/body/result payloads are AES-128-GCM encrypted.

use aes_gcm::aead::{Aead, KeyInit};
use aes_gcm::{Aes128Gcm, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use hmac::{Hmac, Mac};
use home_core::{integration_err, CoreError, Result};
use md5::{Digest, Md5};
use rand::Rng;
use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use sha2::Sha256;

pub const CLIENT_ID: &str = "HA_3y9q4ak7g4ephrvke";
pub const SCHEMA: &str = "haauthorize";
pub const LOGIN_BASE: &str = "https://apigw.iotbing.com";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct TuyaCredentials {
    pub user_code: String,
    pub uid: String,
    pub username: String,
    pub endpoint: String,
    pub terminal_id: String,
    pub access_token: String,
    pub refresh_token: String,
    /// Unix ms.
    pub expire_at: i64,
}

#[derive(Deserialize)]
struct Envelope {
    #[serde(default)]
    success: bool,
    #[serde(default)]
    result: Value,
    #[serde(default)]
    code: Value,
    #[serde(default)]
    msg: Option<String>,
}

impl Envelope {
    fn error(&self) -> CoreError {
        let code = self.code.as_str().map(str::to_string).unwrap_or_else(|| self.code.to_string());
        integration_err(format!(
            "Tuya: {} ({code})",
            self.msg.clone().unwrap_or_else(|| "unknown error".into())
        ))
    }
}

pub fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .expect("http client")
}

/// Step 1 of the QR login: exchange the Smart Life "User Code" for a QR token.
pub async fn request_qr_token(http: &reqwest::Client, user_code: &str) -> Result<String> {
    let env: Envelope = http
        .post(format!("{LOGIN_BASE}/v1.0/m/life/home-assistant/qrcode/tokens"))
        .query(&[("clientid", CLIENT_ID), ("usercode", user_code), ("schema", SCHEMA)])
        .send()
        .await
        .map_err(integration_err)?
        .json()
        .await
        .map_err(integration_err)?;
    if !env.success {
        return Err(env.error());
    }
    env.result
        .get("qrcode")
        .and_then(Value::as_str)
        .map(str::to_string)
        .ok_or_else(|| integration_err("Tuya returned no QR code"))
}

/// Content to encode in the QR image that the Smart Life app scans.
pub fn qr_content(qr_token: &str) -> String {
    format!("tuyaSmart--qrLogin?token={qr_token}")
}

/// Step 2: poll until the user confirms the login in the app.
pub async fn poll_qr_login(
    http: &reqwest::Client,
    qr_token: &str,
    user_code: &str,
) -> Result<Option<TuyaCredentials>> {
    let env: Envelope = http
        .get(format!("{LOGIN_BASE}/v1.0/m/life/home-assistant/qrcode/tokens/{qr_token}"))
        .query(&[("clientid", CLIENT_ID), ("usercode", user_code)])
        .send()
        .await
        .map_err(integration_err)?
        .json()
        .await
        .map_err(integration_err)?;
    if !env.success {
        return Ok(None);
    }
    let r = &env.result;
    let s = |k: &str| r.get(k).and_then(Value::as_str).unwrap_or_default().to_string();
    let t = r.get("t").and_then(Value::as_i64).unwrap_or_else(now_ms);
    let expire = r.get("expire_time").and_then(Value::as_i64).unwrap_or(7200);
    let creds = TuyaCredentials {
        user_code: user_code.to_string(),
        uid: s("uid"),
        username: s("username"),
        endpoint: s("endpoint"),
        terminal_id: s("terminal_id"),
        access_token: s("access_token"),
        refresh_token: s("refresh_token"),
        expire_at: t + expire * 1000,
    };
    if creds.access_token.is_empty() || creds.endpoint.is_empty() {
        return Err(integration_err("Tuya login response missing token or endpoint"));
    }
    Ok(Some(creds))
}

pub fn now_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn random_nonce(len: usize) -> String {
    const CHARS: &[u8] = b"ABCDEFGHJKMNPQRSTWXYZabcdefhijkmnprstwxyz2345678";
    let mut rng = rand::thread_rng();
    (0..len).map(|_| CHARS[rng.gen_range(0..CHARS.len())] as char).collect()
}

fn hmac_hex(key: &[u8], msg: &[u8]) -> String {
    let mut mac = <Hmac<Sha256> as Mac>::new_from_slice(key).expect("hmac key");
    mac.update(msg);
    hex::encode(mac.finalize().into_bytes())
}

fn aes_encrypt(plain: &str, secret: &str) -> Result<String> {
    let cipher = Aes128Gcm::new_from_slice(secret.as_bytes()).map_err(integration_err)?;
    let nonce = random_nonce(12);
    let ct = cipher
        .encrypt(Nonce::from_slice(nonce.as_bytes()), plain.as_bytes())
        .map_err(|_| integration_err("encrypt failed"))?;
    let mut out = nonce.into_bytes();
    out.extend_from_slice(&ct);
    Ok(B64.encode(out))
}

fn aes_decrypt(data: &str, secret: &str) -> Result<String> {
    let raw = B64.decode(data).map_err(integration_err)?;
    if raw.len() < 28 {
        return Err(integration_err("encrypted payload too short"));
    }
    let cipher = Aes128Gcm::new_from_slice(secret.as_bytes()).map_err(integration_err)?;
    let plain = cipher
        .decrypt(Nonce::from_slice(&raw[..12]), &raw[12..])
        .map_err(|_| integration_err("decrypt failed"))?;
    String::from_utf8(plain).map_err(integration_err)
}

/// One linked Smart Life account. Tokens are refreshed transparently; callers
/// persist `credentials()` when `refreshed` reports a change.
pub struct TuyaSession {
    http: reqwest::Client,
    creds: tokio::sync::Mutex<TuyaCredentials>,
}

impl TuyaSession {
    pub fn new(http: reqwest::Client, creds: TuyaCredentials) -> Self {
        Self {
            http,
            creds: tokio::sync::Mutex::new(creds),
        }
    }

    pub async fn credentials(&self) -> TuyaCredentials {
        self.creds.lock().await.clone()
    }

    /// Refresh the access token if it expires within a minute. Returns true when refreshed.
    pub async fn refresh_if_needed(&self) -> Result<bool> {
        let mut creds = self.creds.lock().await;
        if creds.expire_at - 60_000 > now_ms() {
            return Ok(false);
        }
        let path = format!("/v1.0/m/token/{}", creds.refresh_token);
        let result = self.raw_request(&creds, "", reqwest::Method::GET, &path, None, None).await?;
        let get = |a: &str, b: &str| {
            result
                .get(a)
                .or_else(|| result.get(b))
                .cloned()
                .unwrap_or(Value::Null)
        };
        let access = get("accessToken", "access_token");
        let refresh = get("refreshToken", "refresh_token");
        let expire = get("expireTime", "expire_time").as_i64().unwrap_or(7200);
        creds.access_token = access.as_str().unwrap_or_default().to_string();
        if let Some(r) = refresh.as_str() {
            creds.refresh_token = r.to_string();
        }
        creds.expire_at = now_ms() + expire * 1000;
        tracing::debug!("Tuya access token refreshed for {}", creds.username);
        Ok(true)
    }

    pub async fn get(&self, path: &str, params: Option<Map<String, Value>>) -> Result<Value> {
        let creds = self.creds.lock().await.clone();
        self.raw_request(&creds, &creds.access_token, reqwest::Method::GET, path, params, None)
            .await
    }

    pub async fn post(&self, path: &str, body: Map<String, Value>) -> Result<Value> {
        let creds = self.creds.lock().await.clone();
        self.raw_request(&creds, &creds.access_token, reqwest::Method::POST, path, None, Some(body))
            .await
    }

    async fn raw_request(
        &self,
        creds: &TuyaCredentials,
        access_token: &str,
        method: reqwest::Method,
        path: &str,
        params: Option<Map<String, Value>>,
        body: Option<Map<String, Value>>,
    ) -> Result<Value> {
        let rid = uuid::Uuid::new_v4().to_string();
        let hash_key = hex::encode(Md5::digest(format!("{rid}{}", creds.refresh_token)));
        // sid is empty for this API, so the secret is HMAC(rid, hash_key)[..16].
        let secret = hmac_hex(rid.as_bytes(), hash_key.as_bytes())[..16].to_string();

        let query_enc = match &params {
            Some(p) if !p.is_empty() => aes_encrypt(&Value::Object(p.clone()).to_string(), &secret)?,
            _ => String::new(),
        };
        let body_enc = match &body {
            Some(b) if !b.is_empty() => aes_encrypt(&Value::Object(b.clone()).to_string(), &secret)?,
            _ => String::new(),
        };

        let t = now_ms().to_string();
        let mut headers: Vec<(&str, String)> = vec![
            ("X-appKey", CLIENT_ID.to_string()),
            ("X-requestId", rid.clone()),
            ("X-sid", String::new()),
            ("X-time", t),
        ];
        if !access_token.is_empty() {
            headers.push(("X-token", access_token.to_string()));
        }
        let mut sign_str = headers
            .iter()
            .filter(|(_, v)| !v.is_empty())
            .map(|(k, v)| format!("{k}={v}"))
            .collect::<Vec<_>>()
            .join("||");
        sign_str.push_str(&query_enc);
        sign_str.push_str(&body_enc);
        let sign = hmac_hex(hash_key.as_bytes(), sign_str.as_bytes());

        let mut req = self
            .http
            .request(method, format!("{}{}", creds.endpoint, path))
            .header("X-sign", sign);
        for (k, v) in &headers {
            req = req.header(*k, v);
        }
        if !query_enc.is_empty() {
            req = req.query(&[("encdata", &query_enc)]);
        }
        if !body_enc.is_empty() {
            req = req.json(&json!({ "encdata": body_enc }));
        }

        let env: Envelope = req
            .send()
            .await
            .map_err(integration_err)?
            .json()
            .await
            .map_err(integration_err)?;
        if !env.success {
            return Err(env.error());
        }
        Ok(match env.result {
            Value::String(s) => match aes_decrypt(&s, &secret) {
                Ok(plain) => serde_json::from_str(&plain).unwrap_or(Value::String(plain)),
                Err(_) => Value::String(s),
            },
            other => other,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn aes_roundtrip_matches_sdk_layout() {
        let secret = "0123456789abcdef";
        let enc = aes_encrypt(r#"{"homeId":"1"}"#, secret).unwrap();
        let raw = B64.decode(&enc).unwrap();
        // 12-char ASCII nonce + ciphertext + 16-byte tag
        assert_eq!(raw.len(), 12 + 14 + 16);
        assert_eq!(aes_decrypt(&enc, secret).unwrap(), r#"{"homeId":"1"}"#);
    }
}
