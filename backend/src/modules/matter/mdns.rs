//! mDNS for the Matter bridge: rs-matter's built-in responder on the LAN interface.
//! Adapted from rs-matter's examples/src/common/mdns.rs (Apache-2.0, Project CHIP Authors).

use std::net::UdpSocket;

use rs_matter::crypto::Crypto;
use rs_matter::error::{Error, ErrorCode};
use rs_matter::transport::network::mdns::builtin::{BuiltinMdns, Host};
use rs_matter::transport::network::mdns::{MDNS_IPV4_BROADCAST_ADDR, MDNS_IPV6_BROADCAST_ADDR, MDNS_SOCKET_DEFAULT_BIND_ADDR};
use rs_matter::transport::network::{Ipv4Addr, Ipv6Addr};
use rs_matter::Matter;
use socket2::{Domain, Protocol, Socket, Type};

/// The LAN interface: one with both an IPv4 and an IPv6 address, preferring a link-local IPv6
/// (Docker and VPN interfaces are usually IPv4 only). Returns its IPv4, every IPv6 and its index.
fn lan() -> Result<(Ipv4Addr, Vec<Ipv6Addr>, u32), Error> {
    let all = if_addrs::get_if_addrs().map_err(|_| ErrorCode::StdIoError)?;
    let v4_of = |name: &str| {
        all.iter().find_map(|ia| match ia.addr {
            if_addrs::IfAddr::V4(ref v4) if ia.name == name && !ia.is_loopback() => Some(v4.ip),
            _ => None,
        })
    };
    let pick = |filter: fn(&std::net::Ipv6Addr) -> bool| {
        all.iter().filter(|ia| !ia.is_loopback()).find_map(|ia| match ia.addr {
            if_addrs::IfAddr::V6(ref v6) if filter(&v6.ip) => v4_of(&ia.name).map(|v4| (ia.name.clone(), v4, ia.index.unwrap_or(0))),
            _ => None,
        })
    };
    let (name, v4, index) = pick(|ip| ip.is_unicast_link_local())
        .or_else(|| pick(|_| true))
        .or_else(|| {
            all.iter().filter(|ia| !ia.is_loopback()).find_map(|ia| match ia.addr {
                if_addrs::IfAddr::V4(ref v4) => Some((ia.name.clone(), v4.ip, ia.index.unwrap_or(0))),
                _ => None,
            })
        })
        .ok_or(ErrorCode::StdIoError)?;
    // Every IPv6 of the interface is published: a peer behind a reflector needs a routable one.
    let v6: Vec<Ipv6Addr> = all
        .iter()
        .filter(|ia| ia.name == name)
        .filter_map(|ia| match ia.addr {
            if_addrs::IfAddr::V6(ref v6) if !v6.ip.is_loopback() => Some(v6.ip.octets().into()),
            _ => None,
        })
        .collect();
    tracing::info!("Matter: mDNS on {name} ({v4})");
    Ok((v4.octets().into(), v6, index))
}

pub async fn run<C: Crypto>(matter: &Matter<'_>, crypto: C, hostname: &str) -> Result<(), Error> {
    let (ipv4, ipv6, interface) = lan()?;
    let socket = Socket::new(Domain::IPV6, Type::DGRAM, Some(Protocol::UDP))?;
    // Shared with the system's own responder (avahi) when there is one.
    socket.set_reuse_address(true)?;
    socket.set_only_v6(false)?;
    socket.bind(&MDNS_SOCKET_DEFAULT_BIND_ADDR.into())?;
    let socket = async_io::Async::<UdpSocket>::new_nonblocking(socket.into())?;
    socket.get_ref().join_multicast_v6(&MDNS_IPV6_BROADCAST_ADDR, interface)?;
    socket.get_ref().join_multicast_v4(&MDNS_IPV4_BROADCAST_ADDR, &ipv4)?;
    BuiltinMdns::new()
        .run(&socket, &socket, &Host { hostname, ip: ipv4, ipv6: &ipv6 }, Some(ipv4), Some(interface), matter, crypto)
        .await
}
