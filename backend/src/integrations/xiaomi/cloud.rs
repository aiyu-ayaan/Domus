//! Mi Home cloud: sign in with a Xiaomi account to fetch device tokens and
//! local IPs. Device control itself stays local (miIO); the cloud is only
//! used for discovery.

use base64::{engine::general_purpose::STANDARD as B64, Engine};
use home_core::{integration_err, CoreError, Result};
use md5::Md5;
use rand::{Rng, RngCore};
use rc4::{consts::U32, KeyInit, Rc4, StreamCipher};
use reqwest::header::{HeaderMap, COOKIE, SET_COOKIE};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sha1::Sha1;
use sha2::{Digest, Sha256};
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

fn client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(Duration::from_secs(15))
        .redirect(reqwest::redirect::Policy::none())
        .user_agent(USER_AGENT)
        .build()
        .expect("http client")
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

fn device_id() -> String {
    let mut rng = rand::thread_rng();
    (0..16).map(|_| (b'a' + rng.gen_range(0..26)) as char).collect()
}

/// Sign in and obtain `ssecurity` + `serviceToken`.
pub async fn login(username: &str, password: &str, region: &str) -> Result<XiaomiCredentials> {
    let http = client();
    let base_cookies = format!("sdkVersion=accountsdk-18.8.15; deviceId={}", device_id());

    let step1 = http
        .get("https://account.xiaomi.com/pass/serviceLogin?sid=xiaomiio&_json=true")
        .header(COOKIE, format!("{base_cookies}; userId={username}"))
        .send()
        .await
        .map_err(integration_err)?
        .text()
        .await
        .map_err(integration_err)?;
    let sign = strip_json(&step1)?
        .get("_sign")
        .and_then(Value::as_str)
        .unwrap_or_default()
        .to_string();

    let hash = hex::encode_upper(Md5::digest(password.as_bytes()));
    let step2 = http
        .post("https://account.xiaomi.com/pass/serviceLoginAuth2")
        .header(COOKIE, &base_cookies)
        .form(&[
            ("sid", "xiaomiio"),
            ("hash", hash.as_str()),
            ("callback", "https://sts.api.io.mi.com/sts"),
            ("qs", "%3Fsid%3Dxiaomiio%26_json%3Dtrue"),
            ("user", username),
            ("_sign", sign.as_str()),
            ("_json", "true"),
        ])
        .send()
        .await
        .map_err(integration_err)?
        .text()
        .await
        .map_err(integration_err)?;
    let auth = strip_json(&step2)?;
    let get = |k: &str| auth.get(k).map(|v| match v {
        Value::String(s) => s.clone(),
        other => other.to_string(),
    });

    let Some(ssecurity) = get("ssecurity").filter(|s| s.len() > 4) else {
        if let Some(url) = get("notificationUrl") {
            return Err(CoreError::AuthError(format!(
                "Xiaomi requires two-step verification. Open {url} in a browser, approve the sign-in, then try again"
            )));
        }
        if get("captchaUrl").is_some_and(|c| !c.is_empty() && c != "null") {
            return Err(CoreError::AuthError(
                "Xiaomi asked for a captcha. Sign in once in the Mi Home app or browser, then retry".into(),
            ));
        }
        return Err(CoreError::AuthError("invalid Xiaomi username or password".into()));
    };
    let user_id = get("userId").unwrap_or_default();
    let location = get("location").ok_or_else(|| integration_err("Xiaomi login returned no location"))?;

    let step3 = http
        .get(&location)
        .header(COOKIE, &base_cookies)
        .send()
        .await
        .map_err(integration_err)?;
    let service_token = cookie_value(step3.headers(), "serviceToken")
        .ok_or_else(|| integration_err("Xiaomi login returned no service token"))?;

    Ok(XiaomiCredentials {
        username: username.to_string(),
        password: password.to_string(),
        region: region.to_string(),
        user_id,
        ssecurity,
        service_token,
    })
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
