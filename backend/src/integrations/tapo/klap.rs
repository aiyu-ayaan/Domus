//! TP-Link KLAP transport (local HTTP, AES-128-CBC with per-session keys).
//!
//! handshake1: client seed -> remote seed + server hash (proves the device knows
//! our credentials); handshake2: client proves it knows them too. Afterwards
//! each request is encrypted with a sequence-numbered IV and signed.

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use home_core::{integration_err, CoreError, Result};
use md5::Md5;
use rand::RngCore;
use serde_json::{json, Value};
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;

type Aes128CbcEnc = cbc::Encryptor<aes::Aes128>;
type Aes128CbcDec = cbc::Decryptor<aes::Aes128>;

#[derive(Debug, Clone, serde::Serialize, serde::Deserialize)]
pub struct TapoCredentials {
    pub username: String,
    pub password: String,
}

fn sha256(parts: &[&[u8]]) -> [u8; 32] {
    let mut h = Sha256::new();
    for p in parts {
        h.update(p);
    }
    h.finalize().into()
}

fn auth_hash_v2(c: &TapoCredentials) -> Vec<u8> {
    let u = Sha1::digest(c.username.as_bytes());
    let p = Sha1::digest(c.password.as_bytes());
    sha256(&[&u, &p]).to_vec()
}

fn auth_hash_v1(c: &TapoCredentials) -> Vec<u8> {
    let u = Md5::digest(c.username.as_bytes());
    let p = Md5::digest(c.password.as_bytes());
    Md5::digest([u.as_slice(), p.as_slice()].concat()).to_vec()
}

struct Session {
    cookie: String,
    key: [u8; 16],
    iv: [u8; 12],
    sig: [u8; 28],
    seq: i32,
    expires: Instant,
}

impl Session {
    fn new(local: &[u8], remote: &[u8], auth: &[u8], cookie: String, ttl: Duration) -> Self {
        let key = sha256(&[b"lsk", local, remote, auth]);
        let iv = sha256(&[b"iv", local, remote, auth]);
        let sig = sha256(&[b"ldk", local, remote, auth]);
        Self {
            cookie,
            key: key[..16].try_into().unwrap(),
            iv: iv[..12].try_into().unwrap(),
            sig: sig[..28].try_into().unwrap(),
            seq: i32::from_be_bytes(iv[28..32].try_into().unwrap()),
            // Renew a little before the device drops the session.
            expires: Instant::now() + ttl.saturating_sub(Duration::from_secs(60)),
        }
    }

    fn iv_for(&self, seq: i32) -> [u8; 16] {
        let mut iv = [0u8; 16];
        iv[..12].copy_from_slice(&self.iv);
        iv[12..].copy_from_slice(&seq.to_be_bytes());
        iv
    }

    fn encrypt(&mut self, plain: &[u8]) -> (i32, Vec<u8>) {
        self.seq = self.seq.wrapping_add(1);
        let seq = self.seq;
        let ct = Aes128CbcEnc::new(&self.key.into(), &self.iv_for(seq).into())
            .encrypt_padded_vec_mut::<Pkcs7>(plain);
        let signature = sha256(&[&self.sig, &seq.to_be_bytes(), &ct]);
        let mut out = signature.to_vec();
        out.extend_from_slice(&ct);
        (seq, out)
    }

    fn decrypt(&self, seq: i32, body: &[u8]) -> Result<Vec<u8>> {
        if body.len() < 32 {
            return Err(integration_err("short KLAP response"));
        }
        Aes128CbcDec::new(&self.key.into(), &self.iv_for(seq).into())
            .decrypt_padded_vec_mut::<Pkcs7>(&body[32..])
            .map_err(|_| integration_err("KLAP decrypt failed"))
    }
}

pub struct KlapClient {
    http: reqwest::Client,
    sessions: Mutex<HashMap<String, Arc<Mutex<Option<Session>>>>>,
    terminal_uuid: String,
}

impl Default for KlapClient {
    fn default() -> Self {
        Self::new()
    }
}

impl KlapClient {
    pub fn new() -> Self {
        use base64::Engine;
        Self {
            http: reqwest::Client::builder()
                .timeout(Duration::from_secs(5))
                // Tapo's "SHIP 2.0" HTTP server answers 400 to lowercase header names.
                .http1_title_case_headers()
                .build()
                .expect("http client"),
            sessions: Mutex::new(HashMap::new()),
            terminal_uuid: base64::engine::general_purpose::STANDARD
                .encode(Md5::digest(uuid::Uuid::new_v4().as_bytes())),
        }
    }

    async fn slot(&self, host: &str) -> Arc<Mutex<Option<Session>>> {
        self.sessions
            .lock()
            .await
            .entry(host.to_string())
            .or_default()
            .clone()
    }

    async fn handshake(&self, host: &str, creds: &TapoCredentials) -> Result<Session> {
        let mut local = [0u8; 16];
        rand::thread_rng().fill_bytes(&mut local);

        let resp = self
            .http
            .post(format!("http://{host}/app/handshake1"))
            .body(local.to_vec())
            .send()
            .await
            .map_err(|e| integration_err(format!("Tapo device unreachable: {e}")))?;
        if !resp.status().is_success() {
            return Err(integration_err(format!(
                "Tapo handshake rejected ({}); device may not use KLAP",
                resp.status()
            )));
        }
        let (cookie, ttl) = parse_cookie(resp.headers());
        let body = resp.bytes().await.map_err(integration_err)?;
        if body.len() < 48 {
            return Err(integration_err("unexpected Tapo handshake response"));
        }
        let remote = &body[..16];
        let server_hash = &body[16..48];

        // Try the user's credentials, then factory defaults, under both KLAP versions.
        let blank = TapoCredentials { username: String::new(), password: String::new() };
        let kasa = TapoCredentials { username: "kasa@tp-link.net".into(), password: "kasaSetup".into() };
        let mut matched = None;
        'outer: for c in [creds, &blank, &kasa] {
            let v2 = auth_hash_v2(c);
            if sha256(&[&local, remote, &v2]) == server_hash {
                matched = Some((v2, 2));
                break 'outer;
            }
            let v1 = auth_hash_v1(c);
            if sha256(&[&local, &v1]) == server_hash {
                matched = Some((v1, 1));
                break 'outer;
            }
        }
        let (auth, version) = matched.ok_or_else(|| {
            CoreError::AuthError("the device rejected your TP-Link account email/password".into())
        })?;

        let payload = if version == 2 {
            sha256(&[remote, &local, &auth])
        } else {
            sha256(&[remote, &auth])
        };
        let resp = self
            .http
            .post(format!("http://{host}/app/handshake2"))
            .header("Cookie", &cookie)
            .body(payload.to_vec())
            .send()
            .await
            .map_err(integration_err)?;
        if !resp.status().is_success() {
            return Err(CoreError::AuthError(format!("handshake2 failed ({})", resp.status())));
        }
        Ok(Session::new(&local, remote, &auth, cookie, ttl))
    }

    /// Call a Tapo "smart" method, e.g. `get_device_info`.
    pub async fn request(
        &self,
        host: &str,
        creds: &TapoCredentials,
        method: &str,
        params: Option<Value>,
    ) -> Result<Value> {
        let slot = self.slot(host).await;
        let mut guard = slot.lock().await;
        for attempt in 0..2 {
            if guard.as_ref().is_none_or(|s| s.expires <= Instant::now()) {
                *guard = Some(self.handshake(host, creds).await?);
            }
            let session = guard.as_mut().unwrap();

            let mut msg = json!({
                "method": method,
                "request_time_milis": chrono::Utc::now().timestamp_millis(),
                "terminal_uuid": self.terminal_uuid,
            });
            if let Some(p) = &params {
                msg["params"] = p.clone();
            }
            let (seq, payload) = session.encrypt(msg.to_string().as_bytes());
            let resp = self
                .http
                .post(format!("http://{host}/app/request"))
                .query(&[("seq", seq)])
                .header("Cookie", &session.cookie)
                .body(payload)
                .send()
                .await
                .map_err(|e| integration_err(format!("Tapo device unreachable: {e}")))?;

            if !resp.status().is_success() {
                *guard = None;
                if attempt == 0 {
                    continue;
                }
                return Err(integration_err(format!("Tapo request failed ({})", resp.status())));
            }
            let body = resp.bytes().await.map_err(integration_err)?;
            let plain = session.decrypt(seq, &body)?;
            let value: Value = serde_json::from_slice(&plain).map_err(integration_err)?;
            let code = value.get("error_code").and_then(Value::as_i64).unwrap_or(0);
            match code {
                0 => return Ok(value.get("result").cloned().unwrap_or(Value::Null)),
                // session expired / invalid
                -1012 | 9999 | -40401 if attempt == 0 => {
                    *guard = None;
                    continue;
                }
                _ => return Err(TapoError(code).into()),
            }
        }
        Err(integration_err("Tapo request failed"))
    }
}

pub struct TapoError(pub i64);

impl From<TapoError> for CoreError {
    fn from(e: TapoError) -> Self {
        match e.0 {
            -1 | -40210 | -1001 | -1002 => CoreError::Unsupported(format!("Tapo method (code {})", e.0)),
            code => integration_err(format!("Tapo error code {code}")),
        }
    }
}

fn parse_cookie(headers: &reqwest::header::HeaderMap) -> (String, Duration) {
    let mut cookie = String::new();
    let mut ttl = Duration::from_secs(86400);
    for v in headers.get_all(reqwest::header::SET_COOKIE) {
        let Ok(s) = v.to_str() else { continue };
        for part in s.split(';').map(str::trim) {
            if part.starts_with("TP_SESSIONID=") {
                cookie = part.to_string();
            } else if let Some(t) = part.strip_prefix("TIMEOUT=") {
                if let Ok(secs) = t.parse() {
                    ttl = Duration::from_secs(secs);
                }
            }
        }
    }
    (cookie, ttl)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn session_roundtrip() {
        let mut s = Session::new(&[1; 16], &[2; 16], &[3; 32], String::new(), Duration::from_secs(3600));
        let start = s.seq;
        let (seq, payload) = s.encrypt(b"{\"method\":\"get_device_info\"}");
        assert_eq!(seq, start.wrapping_add(1));
        assert_eq!(s.decrypt(seq, &payload).unwrap(), b"{\"method\":\"get_device_info\"}");
    }
}
