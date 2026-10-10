//! HTTPS for the API. Uses the configured certificate, or generates a
//! self-signed one covering localhost, the hostname and local addresses.

use crate::config::{ServerConfig, TlsConfig};
use crate::infrastructure::crypto::write_private;
use axum_server::tls_rustls::RustlsConfig;
use std::path::PathBuf;

/// The TLS setup and the SHA-256 fingerprint of its certificate.
pub async fn load_rustls(tls: &TlsConfig, server: &ServerConfig) -> anyhow::Result<(RustlsConfig, Option<String>)> {
    let (cert, key) = match (&tls.cert_path, &tls.key_path) {
        (Some(c), Some(k)) => (c.clone(), k.clone()),
        _ => ensure_self_signed(server)?,
    };
    tracing::info!("TLS certificate: {}", cert.display());
    // Apps show this when they first meet a self-signed server; the owner compares the two.
    let fp = std::fs::read_to_string(&cert).ok().and_then(|pem| fingerprint(&pem));
    if let Some(fp) = &fp {
        tracing::info!("TLS certificate SHA-256 fingerprint: {fp}");
    }
    Ok((RustlsConfig::from_pem_file(cert, key).await?, fp))
}

/// SHA-256 of the first certificate in `pem`, as `AA:BB:..`.
fn fingerprint(pem: &str) -> Option<String> {
    use base64::Engine;
    use sha2::Digest;
    let body: String = pem
        .lines()
        .skip_while(|l| !l.starts_with("-----BEGIN CERTIFICATE"))
        .skip(1)
        .take_while(|l| !l.starts_with("-----END"))
        .collect();
    let der = base64::engine::general_purpose::STANDARD.decode(body.trim()).ok().filter(|d| !d.is_empty())?;
    let hex: Vec<String> = sha2::Sha256::digest(der).iter().map(|b| format!("{b:02X}")).collect();
    Some(hex.join(":"))
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

#[cfg(test)]
mod tests {
    #[test]
    fn fingerprint_is_sha256_of_the_der_bytes() {
        // "hello" in base64; sha256("hello") starts 2C:F2:4D.
        let pem = "-----BEGIN CERTIFICATE-----\naGVsbG8=\n-----END CERTIFICATE-----\n";
        let fp = super::fingerprint(pem).unwrap();
        assert!(fp.starts_with("2C:F2:4D:BA"));
        assert_eq!(fp.len(), 32 * 3 - 1);
        assert!(super::fingerprint("not a certificate").is_none());
    }
}
