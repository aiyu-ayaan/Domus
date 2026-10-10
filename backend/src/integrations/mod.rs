//! Integration plugins. Each implements `home_core::IntegrationPlugin`; the
//! `DeviceManager` is the only caller.

pub mod accounts;
pub mod manager;
pub mod mqtt;
pub mod tapo;
pub mod tuya;
pub mod xiaomi;

pub use manager::DeviceManager;

/// Broadcast targets for LAN discovery: global broadcast plus the /24 of the
/// primary interface (some routers drop 255.255.255.255).
pub fn broadcast_addresses() -> Vec<String> {
    let mut out = vec!["255.255.255.255".to_string()];
    if let Some(ip) = crate::infrastructure::tls::local_ip() {
        if let Some((prefix, _)) = ip.rsplit_once('.') {
            out.push(format!("{prefix}.255"));
        }
    }
    out
}
