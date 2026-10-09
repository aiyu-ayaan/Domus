//! HTTPS for the API. Uses the configured certificate, or generates a
//! self-signed one covering localhost, the hostname and local addresses.

use crate::config::{ServerConfig, TlsConfig};
use crate::infrastructure::crypto::write_private;
use axum_server::tls_rustls::RustlsConfig;
use std::path::PathBuf;

pub async fn load_rustls(tls: &TlsConfig, server: &ServerConfig) -> anyhow::Result<RustlsConfig> {
    let (cert, key) = match (&tls.cert_path, &tls.key_path) {
        (Some(c), Some(k)) => (c.clone(), k.clone()),
        _ => ensure_self_signed(server)?,
    };
    tracing::info!("TLS certificate: {}", cert.display());
    Ok(RustlsConfig::from_pem_file(cert, key).await?)
}

fn ensure_self_signed(server: &ServerConfig) -> anyhow::Result<(PathBuf, PathBuf)> {
    let dir = server.data_dir.join("tls");
    let cert_path = dir.join("cert.pem");
    let key_path = dir.join("key.pem");
    if cert_path.exists() && key_path.exists() {
        return Ok((cert_path, key_path));
    }
    std::fs::create_dir_all(&dir)?;

    let mut names = vec!["localhost".to_string(), "127.0.0.1".to_string(), "::1".to_string()];
    if let Ok(host) = std::fs::read_to_string("/etc/hostname") {
        let host = host.trim();
        if !host.is_empty() {
            names.push(host.to_string());
            names.push(format!("{host}.local"));
        }
    }
    if let Some(ip) = local_ip() {
        names.push(ip);
    }

    let cert = rcgen::generate_simple_self_signed(names)?;
    std::fs::write(&cert_path, cert.cert.pem())?;
    write_private(&key_path, cert.key_pair.serialize_pem().as_bytes())?;
    tracing::info!("Generated self-signed TLS certificate in {}", dir.display());
    Ok((cert_path, key_path))
}

/// Primary LAN address (no packets are sent; UDP connect only picks a route).
pub fn local_ip() -> Option<String> {
    let sock = std::net::UdpSocket::bind("0.0.0.0:0").ok()?;
    sock.connect("8.8.8.8:80").ok()?;
    Some(sock.local_addr().ok()?.ip().to_string())
}
