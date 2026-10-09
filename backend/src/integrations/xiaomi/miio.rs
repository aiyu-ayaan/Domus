//! miIO binary protocol over UDP/54321.
//!
//! Packet: 32-byte header (magic 0x2131, length, unknown, device id, stamp,
//! MD5 checksum) followed by an AES-128-CBC payload keyed from the device token.

use aes::cipher::{block_padding::Pkcs7, BlockDecryptMut, BlockEncryptMut, KeyIvInit};
use home_core::{integration_err, Result};
use md5::{Digest, Md5};
use serde_json::{json, Value};
use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Duration;
use tokio::net::UdpSocket;

pub const PORT: u16 = 54321;
const HELLO: [u8; 32] = {
    let mut p = [0xffu8; 32];
    p[0] = 0x21;
    p[1] = 0x31;
    p[2] = 0x00;
    p[3] = 0x20;
    p
};

static MSG_ID: AtomicU32 = AtomicU32::new(1);

pub fn parse_token(hex_token: &str) -> Result<[u8; 16]> {
    let bytes = hex::decode(hex_token.trim()).map_err(|_| integration_err("token must be 32 hex characters"))?;
    bytes
        .try_into()
        .map_err(|_| integration_err("token must be 32 hex characters"))
}

fn keys(token: &[u8; 16]) -> ([u8; 16], [u8; 16]) {
    let key: [u8; 16] = Md5::digest(token).into();
    let iv: [u8; 16] = Md5::digest([key.as_slice(), token.as_slice()].concat()).into();
    (key, iv)
}

pub fn encode(device_id: u32, stamp: u32, token: &[u8; 16], payload: &[u8]) -> Vec<u8> {
    let (key, iv) = keys(token);
    let enc = cbc::Encryptor::<aes::Aes128>::new(&key.into(), &iv.into()).encrypt_padded_vec_mut::<Pkcs7>(payload);
    let mut header = Vec::with_capacity(32 + enc.len());
    header.extend_from_slice(&[0x21, 0x31]);
    header.extend_from_slice(&((32 + enc.len()) as u16).to_be_bytes());
    header.extend_from_slice(&[0, 0, 0, 0]);
    header.extend_from_slice(&device_id.to_be_bytes());
    header.extend_from_slice(&stamp.to_be_bytes());
    let checksum = Md5::digest([&header[..16], token.as_slice(), &enc].concat());
    header.extend_from_slice(&checksum);
    header.extend_from_slice(&enc);
    header
}

pub fn decode(packet: &[u8], token: &[u8; 16]) -> Result<Value> {
    if packet.len() <= 32 || packet[..2] != [0x21, 0x31] {
        return Err(integration_err("not a miIO packet"));
    }
    let (key, iv) = keys(token);
    let plain = cbc::Decryptor::<aes::Aes128>::new(&key.into(), &iv.into())
        .decrypt_padded_vec_mut::<Pkcs7>(&packet[32..])
        .map_err(|_| integration_err("miIO decrypt failed — wrong token?"))?;
    let text = String::from_utf8_lossy(&plain);
    serde_json::from_str(text.trim_end_matches('\0')).map_err(integration_err)
}

pub struct Hello {
    pub device_id: u32,
    pub stamp: u32,
    /// Older firmware leaks the token in the hello reply; newer sends 0x00/0xff.
    pub token: Option<String>,
}

pub fn parse_hello(p: &[u8]) -> Option<Hello> {
    if p.len() != 32 || p[..2] != [0x21, 0x31] {
        return None;
    }
    let token = &p[16..32];
    let valid = !token.iter().all(|b| *b == 0) && !token.iter().all(|b| *b == 0xff);
    Some(Hello {
        device_id: u32::from_be_bytes(p[8..12].try_into().ok()?),
        stamp: u32::from_be_bytes(p[12..16].try_into().ok()?),
        token: valid.then(|| hex::encode(token)),
    })
}

/// Unicast hello: confirms the device is reachable and returns its id.
pub async fn hello(host: &str) -> Result<Hello> {
    let sock = UdpSocket::bind("0.0.0.0:0").await.map_err(integration_err)?;
    sock.connect((host, PORT)).await.map_err(integration_err)?;
    let mut buf = [0u8; 64];
    for _ in 0..3 {
        sock.send(&HELLO).await.map_err(integration_err)?;
        if let Ok(Ok(n)) = tokio::time::timeout(Duration::from_secs(2), sock.recv(&mut buf)).await {
            if let Some(h) = parse_hello(&buf[..n]) {
                return Ok(h);
            }
        }
    }
    Err(integration_err(format!("no miIO device answered at {host}")))
}

/// Send one command and wait for the matching reply.
pub async fn call(host: &str, token: &[u8; 16], method: &str, params: Value) -> Result<Value> {
    let sock = UdpSocket::bind("0.0.0.0:0").await.map_err(integration_err)?;
    sock.connect((host, PORT)).await.map_err(integration_err)?;
    let mut buf = vec![0u8; 8192];

    let mut last_err = integration_err("device did not respond");
    for _ in 0..3 {
        sock.send(&HELLO).await.map_err(integration_err)?;
        let hello = match tokio::time::timeout(Duration::from_secs(2), sock.recv(&mut buf)).await {
            Ok(Ok(n)) => parse_hello(&buf[..n]),
            _ => None,
        };
        let Some(hello) = hello else { continue };

        let id = MSG_ID.fetch_add(1, Ordering::Relaxed) % 1_000_000 + 1;
        let msg = json!({ "id": id, "method": method, "params": params });
        let packet = encode(hello.device_id, hello.stamp.wrapping_add(1), token, msg.to_string().as_bytes());
        sock.send(&packet).await.map_err(integration_err)?;

        let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
        while let Ok(Ok(n)) = tokio::time::timeout_at(deadline, sock.recv(&mut buf)).await {
            let resp = match decode(&buf[..n], token) {
                Ok(v) => v,
                Err(e) => {
                    last_err = e;
                    continue;
                }
            };
            if resp.get("id").and_then(Value::as_u64) != Some(id as u64) {
                continue;
            }
            if let Some(err) = resp.get("error") {
                return Err(integration_err(format!("miIO error: {err}")));
            }
            return Ok(resp.get("result").cloned().unwrap_or(Value::Null));
        }
    }
    Err(last_err)
}

/// Broadcast hello and collect replies: (ip, device id, leaked token).
pub async fn scan(broadcast: &[String]) -> Result<Vec<(String, u32, Option<String>)>> {
    let sock = UdpSocket::bind("0.0.0.0:0").await.map_err(integration_err)?;
    sock.set_broadcast(true).map_err(integration_err)?;
    for addr in broadcast {
        for _ in 0..2 {
            let _ = sock.send_to(&HELLO, (addr.as_str(), PORT)).await;
        }
    }
    let mut out: Vec<(String, u32, Option<String>)> = Vec::new();
    let mut buf = [0u8; 64];
    let deadline = tokio::time::Instant::now() + Duration::from_secs(3);
    while let Ok(Ok((n, from))) = tokio::time::timeout_at(deadline, sock.recv_from(&mut buf)).await {
        if let Some(h) = parse_hello(&buf[..n]) {
            if !out.iter().any(|(_, id, _)| *id == h.device_id) {
                out.push((from.ip().to_string(), h.device_id, h.token));
            }
        }
    }
    Ok(out)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn packet_roundtrip() {
        let token = [0x11u8; 16];
        let pkt = encode(0x1234, 99, &token, br#"{"id":1,"result":["ok"]}"#);
        assert_eq!(u16::from_be_bytes([pkt[2], pkt[3]]) as usize, pkt.len());
        let v = decode(&pkt, &token).unwrap();
        assert_eq!(v["result"][0], "ok");
        assert!(decode(&pkt, &[0x22u8; 16]).is_err());
    }

    #[test]
    fn hello_parsing() {
        let mut p = [0xffu8; 32];
        p[..4].copy_from_slice(&[0x21, 0x31, 0x00, 0x20]);
        p[8..12].copy_from_slice(&7u32.to_be_bytes());
        p[12..16].copy_from_slice(&42u32.to_be_bytes());
        let h = parse_hello(&p).unwrap();
        assert_eq!((h.device_id, h.stamp, h.token), (7, 42, None));
    }
}
