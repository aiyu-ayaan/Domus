//! Mi Home cloud: sign in with a Xiaomi account to fetch device tokens and
//! local IPs. Device control itself stays local (miIO); the cloud is only
//! used for discovery.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use home_core::{integration_err, CoreError, Result};
use md5::Md5;
use rand::{Rng, RngCore};
use rc4::{consts::U32, KeyInit, Rc4, StreamCipher};
use reqwest::cookie::{CookieStore, Jar};
use reqwest::header::{HeaderMap, COOKIE, SET_COOKIE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::Sha1;
use sha2::{Digest, Sha256};
use std::sync::Arc;
use std::time::Duration;

const USER_AGENT: &str = "Android-7.1.1-1.0.0-ONEPLUS A3010-136-AAAAAAAAAAAAAA APP/xiaomi.smarthome APPV/62830";
pub const REGIONS: &[&str] = &["cn", "de", "us", "ru", "tw", "sg", "in", "i2"];

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct XiaomiCredentials {
    pub username: String,
    pub password: String,
    pub region: String,
    #[serde(default)]
    pub user_id: String,
    #[serde(default)]
    pub ssecurity: String,
    #[serde(default)]
    pub service_token: String,
    #[serde(default)]
    pub device_id: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CloudDevice {
    pub did: String,
    #[serde(default)]
    pub token: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub localip: String,
    #[serde(default)]
    pub model: String,
    #[serde(default)]
    pub mac: String,
    #[serde(default, rename = "isOnline")]
    pub is_online: bool,
}

fn builder() -> reqwest::ClientBuilder {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(USER_AGENT)
}

fn client() -> reqwest::Client {
    builder().build().expect("http client")
}

/// Sign-in needs a real cookie jar: the 2FA pages set several session cookies.
fn login_client(jar: Arc<Jar>) -> reqwest::Client {
    builder().cookie_provider(jar).build().expect("http client")
}

fn strip_json(text: &str) -> Result<Value> {
    serde_json::from_str(text.trim_start_matches("&&&START&&&")).map_err(integration_err)
}

fn cookie_value(headers: &HeaderMap, name: &str) -> Option<String> {
    headers.get_all(SET_COOKIE).iter().find_map(|v| {
        let s = v.to_str().ok()?;
        let first = s.split(';').next()?;
        let (k, v) = first.split_once('=')?;
        (k.trim() == name).then(|| v.to_string())
    })
}

fn jar_value(jar: &Jar, url: &str, name: &str) -> Option<String> {
    let header = jar.cookies(&url.parse().ok()?)?;
    header.to_str().ok()?.split("; ").find_map(|kv| {
        let (k, v) = kv.split_once('=')?;
        (k == name).then(|| v.to_string())
    })
}

pub fn new_device_id() -> String {
    let mut rng = rand::thread_rng();
    (0..16).map(|_| (b'a' + rng.gen_range(0..26)) as char).collect()
}

const ACCOUNT: &str = "https://account.xiaomi.com";

/// A sign-in waiting for the code Xiaomi sent by email or SMS.
pub struct PendingLogin {
    http: reqwest::Client,
    jar: Arc<Jar>,
    context: String,
    /// Xiaomi identity flag: 4 = phone (SMS), 8 = email.
    flag: u8,
    username: String,
    password: String,
    region: String,
    device_id: String,
}

impl PendingLogin {
    pub fn via(&self) -> &'static str {
        if self.flag == 4 { "phone" } else { "email" }
    }
}

pub enum Login {
    Done(XiaomiCredentials),
    NeedsCode(PendingLogin),
}

async fn text(r: reqwest::RequestBuilder) -> Result<String> {
    r.send().await.map_err(integration_err)?.text().await.map_err(integration_err)
}

/// Sign in and obtain `ssecurity` + `serviceToken`. Reusing `device_id` lets
/// Xiaomi recognise this server so it does not ask for a code every time.
pub async fn login(username: &str, password: &str, region: &str, device_id: Option<&str>) -> Result<Login> {
    let device_id = device_id.filter(|d| !d.is_empty()).map(str::to_string).unwrap_or_else(new_device_id);
    let jar = Arc::new(Jar::default());
    for domain in ["xiaomi.com", "mi.com"] {
        let url = format!("https://{domain}").parse().map_err(integration_err)?;
        jar.add_cookie_str(&format!("sdkVersion=accountsdk-18.8.15; Domain={domain}"), &url);
        jar.add_cookie_str(&format!("deviceId={device_id}; Domain={domain}"), &url);
    }
    let http = login_client(jar.clone());

    let step1 = text(
        http.get(format!("{ACCOUNT}/pass/serviceLogin?sid=xiaomiio&_json=true"))
            .header(COOKIE, format!("userId={username}")),
    )
    .await?;
    let sign = strip_json(&step1)?
        .get("_sign")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let hash = hex::encode_upper(Md5::digest(password.as_bytes()));
    let step2 = text(http.post(format!("{ACCOUNT}/pass/serviceLoginAuth2")).form(&[
        ("sid", "xiaomiio"),
        ("hash", hash.as_str()),
        ("callback", "https://sts.api.io.mi.com/sts"),
        ("qs", "%3Fsid%3Dxiaomiio%26_json%3Dtrue"),
        ("user", username),
        ("_sign", sign.as_str()),
        ("_json", "true"),
    ]))
    .await?;
    let auth = strip_json(&step2)?;
    let get = |k: &str| auth.get(k).map(|v| match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    });

    let Some(ssecurity) = get("ssecurity").filter(|s| s.len() > 4) else {
        if let Some(url) = get("notificationUrl").filter(|u| u.starts_with("http")) {
            return start_verification(http, jar, &url, username, password, region, device_id).await;
        }
        if get("captchaUrl").is_some_and(|c| !c.is_empty() && c != "null") {
            return Err(CoreError::AuthError(
                "Xiaomi asked for a captcha. Sign in once in the Mi Home app or browser, then retry".into(),
            ));
        }
        return Err(CoreError::AuthError("invalid Xiaomi username or password".into()));
    };
    let location = get("location").ok_or_else(|| integration_err("Xiaomi login returned no location"))?;
    let (service_token, sts_user) = sts(&http, &location).await?;

    Ok(Login::Done(XiaomiCredentials {
        username: username.to_string(),
        password: password.to_string(),
        region: region.to_string(),
        user_id: get("userId").or(sts_user).unwrap_or_default(),
        ssecurity,
        service_token,
        device_id,
    }))
}

/// Visit the STS callback, which sets `serviceToken` (and `userId`).
async fn sts(http: &reqwest::Client, url: &str) -> Result<(String, Option<String>)> {
    let resp = http.get(url).send().await.map_err(integration_err)?;
    let token = cookie_value(resp.headers(), "serviceToken")
        .ok_or_else(|| integration_err("Xiaomi login returned no service token"))?;
    Ok((token, cookie_value(resp.headers(), "userId")))
}

/// Ask Xiaomi to send a verification code (email preferred, else SMS).
async fn start_verification(
    http: reqwest::Client,
    jar: Arc<Jar>,
    notification_url: &str,
    username: &str,
    password: &str,
    region: &str,
    device_id: String,
) -> Result<Login> {
    let context = reqwest::Url::parse(notification_url)
        .ok()
        .and_then(|u| u.query_pairs().find(|(k, _)| k == "context").map(|(_, v)| v.into_owned()))
        .ok_or_else(|| integration_err("Xiaomi verification link has no context"))?;
    // authStart sets the identity session cookies.
    http.get(notification_url).send().await.map_err(integration_err)?;

    let q = [("sid", "xiaomiio"), ("context", context.as_str()), ("_locale", "en_US")];
    let list = text(http.get(format!("{ACCOUNT}/identity/list")).query(&q)).await?;
    let options: Vec<i64> = strip_json(&list)
        .ok()
        .and_then(|v| v.get("options").cloned())
        .and_then(|o| serde_json::from_value(o).ok())
        .unwrap_or_default();
    let flag = if options.contains(&8) || !options.contains(&4) { 8 } else { 4 };
    let kind = if flag == 4 { "Phone" } else { "Email" };

    let ick = jar_value(&jar, ACCOUNT, "ick").unwrap_or_default();
    let dc = chrono::Utc::now().timestamp_millis().to_string();
    let sent = text(
        http.post(format!("{ACCOUNT}/identity/auth/send{kind}Ticket"))
            .query(&[("_dc", dc.as_str()), ("mask", "0")])
            .query(&q)
            .form(&[("retry", "0"), ("icode", ""), ("_json", "true"), ("ick", ick.as_str())]),
    )
    .await?;
    let sent = strip_json(&sent).unwrap_or_default();
    if sent.get("code").and_then(Value::as_i64).is_some_and(|c| c != 0) {
        let why = sent.get("tips").or(sent.get("description")).and_then(Value::as_str).unwrap_or("unknown error");
        return Err(CoreError::AuthError(format!("Xiaomi could not send a verification code: {why}")));
    }

    Ok(Login::NeedsCode(PendingLogin {
        http,
        jar,
        context,
        flag,
        username: username.into(),
        password: password.into(),
        region: region.into(),
        device_id,
    }))
}

/// Finish a sign-in with the code from the email or SMS.
pub async fn verify(p: &PendingLogin, code: &str) -> Result<XiaomiCredentials> {
    let kind = if p.flag == 4 { "Phone" } else { "Email" };
    let flag = p.flag.to_string();
    let ick = jar_value(&p.jar, ACCOUNT, "ick").unwrap_or_default();
    let q = [("sid", "xiaomiio"), ("context", p.context.as_str()), ("_locale", "en_US"), ("mask", "0")];
    let resp = p
        .http
        .post(format!("{ACCOUNT}/identity/auth/verify{kind}"))
        .query(&q)
        .query(&[("_flag", flag.as_str()), ("_json", "true")])
        // trust=true remembers this device id, so later re-logins skip the code.
        .form(&[("_flag", flag.as_str()), ("ticket", code), ("trust", "true"), ("_json", "true"), ("ick", ick.as_str())])
        .send()
        .await
        .map_err(integration_err)?;
    let header_loc = resp.headers().get("location").and_then(|v| v.to_str().ok()).map(str::to_string);
    let body = strip_json(&resp.text().await.map_err(integration_err)?).unwrap_or_default();
    if body.get("code").and_then(Value::as_i64).is_some_and(|c| c != 0) {
        return Err(CoreError::AuthError("wrong or expired verification code".into()));
    }
    let mut next = body.get("location").and_then(Value::as_str).map(str::to_string).or(header_loc);
    if next.is_none() {
        let r = p.http.get(format!("{ACCOUNT}/identity/result/check")).query(&q[..3]).send().await.map_err(integration_err)?;
        next = r.headers().get("location").and_then(|v| v.to_str().ok()).map(str::to_string);
    }

    // Follow identity/result/check -> serviceLoginAuth2/end, which carries
    // ssecurity in its `extension-pragma` header and redirects to STS.
    let mut url = next.ok_or_else(|| CoreError::AuthError("Xiaomi did not accept the code".into()))?;
    for _ in 0..6 {
        let r = p.http.get(&url).send().await.map_err(integration_err)?;
        let pragma = r.headers().get("extension-pragma").and_then(|v| v.to_str().ok());
        let ssecurity = pragma
            .and_then(|v| serde_json::from_str::<Value>(v).ok())
            .and_then(|v| v.get("ssecurity").and_then(Value::as_str).map(str::to_string));
        let location = r.headers().get("location").and_then(|v| v.to_str().ok()).map(str::to_string);
        if let (Some(ssecurity), Some(sts_url)) = (ssecurity, &location) {
            let (service_token, sts_user) = sts(&p.http, sts_url).await?;
            let user_id = sts_user.or_else(|| jar_value(&p.jar, ACCOUNT, "userId")).unwrap_or_default();
            return Ok(XiaomiCredentials {
                username: p.username.clone(),
                password: p.password.clone(),
                region: p.region.clone(),
                user_id,
                ssecurity,
                service_token,
                device_id: p.device_id.clone(),
            });
        }
        // Auth2/end sometimes serves a "Tips" page first; asking again redirects.
        url = location.unwrap_or(url);
    }
    Err(integration_err("Xiaomi verification did not finish"))
}

fn rc4_apply(key_b64: &str, data: &mut [u8]) -> Result<()> {
    let key = B64.decode(key_b64).map_err(integration_err)?;
    let mut cipher = Rc4::<U32>::new_from_slice(&key).map_err(|_| integration_err("bad rc4 key"))?;
    cipher.apply_keystream(&mut [0u8; 1024]);
    cipher.apply_keystream(data);
    Ok(())
}

fn enc_signature(method: &str, path: &str, signed_nonce: &str, params: &[(String, String)]) -> String {
    let mut parts = vec![method.to_string(), path.to_string()];
    parts.extend(params.iter().map(|(k, v)| format!("{k}={v}")));
    parts.push(signed_nonce.to_string());
    B64.encode(Sha1::digest(parts.join("&").as_bytes()))
}

/// Encrypted ("RC4") Mi Home API call.
pub async fn api_call(creds: &XiaomiCredentials, path: &str, data: &str) -> Result<Value> {
    let host = if creds.region == "cn" {
        "https://api.io.mi.com/app".to_string()
    } else {
        format!("https://{}.api.io.mi.com/app", creds.region)
    };
    let url = format!("{host}{path}");

    let mut nonce_bytes = vec![0u8; 8];
    rand::thread_rng().fill_bytes(&mut nonce_bytes);
    let minutes = (chrono::Utc::now().timestamp_millis() / 60_000) as u32;
    nonce_bytes.extend_from_slice(&minutes.to_be_bytes());
    let nonce = B64.encode(&nonce_bytes);
    let ssec = B64.decode(&creds.ssecurity).map_err(integration_err)?;
    let signed_nonce = B64.encode(Sha256::digest([ssec.as_slice(), &nonce_bytes].concat()));

    let mut params = vec![("data".to_string(), data.to_string())];
    let rc4_hash = enc_signature("POST", path, &signed_nonce, &params);
    params.push(("rc4_hash__".into(), rc4_hash));
    for (_, v) in params.iter_mut() {
        let mut bytes = v.clone().into_bytes();
        rc4_apply(&signed_nonce, &mut bytes)?;
        *v = B64.encode(bytes);
    }
    let signature = enc_signature("POST", path, &signed_nonce, &params);
    params.push(("signature".into(), signature));
    params.push(("ssecurity".into(), creds.ssecurity.clone()));
    params.push(("_nonce".into(), nonce));

    let cookies = format!(
        "userId={uid}; yetAnotherServiceToken={tok}; serviceToken={tok}; locale=en_GB; timezone=GMT+00:00; is_daylight=0; dst_offset=0; channel=MI_APP_STORE",
        uid = creds.user_id,
        tok = creds.service_token
    );
    let resp = client()
        .post(&url)
        .header(COOKIE, cookies)
        .header("Accept-Encoding", "identity")
        .header("x-xiaomi-protocal-flag-cli", "PROTOCAL-HTTP2")
        .header("MIOT-ENCRYPT-ALGORITHM", "ENCRYPT-RC4")
        .form(&params)
        .send()
        .await
        .map_err(integration_err)?;
    if resp.status() == reqwest::StatusCode::UNAUTHORIZED {
        return Err(CoreError::AuthError("Xiaomi session expired".into()));
    }
    let text = resp.text().await.map_err(integration_err)?;
    let mut bytes = B64
        .decode(text.trim())
        .map_err(|_| CoreError::AuthError("Xiaomi session expired".into()))?;
    rc4_apply(&signed_nonce, &mut bytes)?;
    let v: Value = serde_json::from_slice(&bytes).map_err(integration_err)?;
    match v.get("code").and_then(Value::as_i64) {
        Some(0) | None => Ok(v.get("result").cloned().unwrap_or(Value::Null)),
        Some(code) => Err(integration_err(format!(
            "Mi cloud error {code}: {}",
            v.get("message").and_then(Value::as_str).unwrap_or("")
        ))),
    }
}

pub async fn device_list(creds: &XiaomiCredentials) -> Result<Vec<CloudDevice>> {
    let data = r#"{"getVirtualModel":true,"getHuamiDevices":1,"get_split_device":false,"support_smart_home":true}"#;
    let result = api_call(creds, "/home/device_list", data).await?;
    let list = result.get("list").cloned().unwrap_or(Value::Array(vec![]));
    serde_json::from_value(list).map_err(integration_err)
}
