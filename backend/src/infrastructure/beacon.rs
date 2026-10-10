//! LAN discovery beacon. Apps broadcast `DOMUS_DISCOVER` over UDP and every
//! server answers with where its API listens, so nobody has to type an address.
//! The reply is only a hint: clients still verify the TLS certificate.

use serde_json::json;
use tokio::net::UdpSocket;

pub const BEACON_PORT: u16 = 48443;
const PROBE: &[u8] = b"DOMUS_DISCOVER";

fn reply(port: u16, tls: bool) -> Vec<u8> {
    let name = std::fs::read_to_string("/etc/hostname").unwrap_or_default();
    let name = if name.trim().is_empty() { "Domus" } else { name.trim() };
    json!({ "service": "domus", "name": name, "port": port, "tls": tls, "version": env!("CARGO_PKG_VERSION") })
        .to_string()
        .into_bytes()
}

pub async fn run(port: u16, tls: bool) {
    let socket = match UdpSocket::bind(("0.0.0.0", BEACON_PORT)).await {
        Ok(s) => s,
        Err(e) => {
            tracing::warn!("Discovery beacon disabled (UDP {BEACON_PORT}): {e}");
            return;
        }
    };
    tracing::info!("Discovery beacon listening on udp://0.0.0.0:{BEACON_PORT}");
    let answer = reply(port, tls);
    let mut buf = [0u8; 64];
    loop {
        if let Ok((n, from)) = socket.recv_from(&mut buf).await {
            if &buf[..n] == PROBE {
                let _ = socket.send_to(&answer, from).await;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reply_tells_clients_where_the_api_is() {
        let v: serde_json::Value = serde_json::from_slice(&reply(8443, true)).unwrap();
        assert_eq!(v["service"], "domus");
        assert_eq!(v["port"], 8443);
        assert_eq!(v["tls"], true);
    }
}
