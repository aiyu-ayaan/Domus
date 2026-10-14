//! End to end: a Matter controller (rs-matter's own commissioner) pairs with the Domus bridge over
//! UDP, then switches, dims and colours the bridged devices, and sees changes made in Domus.
//! The controller side follows rs-matter's tests/commissioning.rs (Apache-2.0, Project CHIP Authors).
//!
//! It binds UDP on the LAN address, so it needs a network interface with IPv4.

use core::num::NonZeroU8;
use core::pin::pin;
use std::net::UdpSocket;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use domus_backend::modules::matter::bridge::{self, Bridged, Kind, Live, Setup};
use embassy_futures::select::{select, Either};
use home_core::DeviceCommand;
use rand_matter::rand_core::Rng;
use rs_matter::cert::gen::VALID_FOREVER;
use rs_matter::cert::{MAX_CERT_TLV_AND_ASN1_LEN, MAX_CERT_TLV_LEN};
use rs_matter::crypto::{default_crypto, CanonAeadKey, CanonPkcSecretKey, Crypto, SecretKey, SigningSecretKey};
use rs_matter::dm::devices::test::{DAC_PRIVKEY, TEST_DEV_ATT, TEST_DEV_COMM, TEST_DEV_DET};
use rs_matter::error::Error;
use rs_matter::onboard::cac::{IcacGenerator, RcacGenerator};
use rs_matter::onboard::noc::NocGenerator;
use rs_matter::onboard::{CommissionOptions, Commissioner};
use rs_matter::transport::exchange::Exchange;
use rs_matter::transport::network::mdns::{DottedName, MdnsRemoteService};
use rs_matter::transport::network::{Address, IpAddr, MatterRemoteService, NoNetwork, SocketAddr, SocketAddrV6};
use rs_matter::transport::TransportPreference;
use rs_matter::Matter;
use socket2::{Domain, Protocol, Socket, Type};

const PORT: u16 = 5591;
const PASSCODE: u32 = 34_567_891;
const PLUG: u16 = 2;
const LAMP: u16 = 3;

type Sent = Arc<Mutex<Vec<(String, DeviceCommand)>>>;

struct Device {
    live: Arc<Live>,
    on_tx: async_channel::Sender<()>,
    level_tx: async_channel::Sender<()>,
}

fn device(endpoint: u16, id: &str, kind: Kind, on: bool, brightness: u8) -> (Bridged, Device) {
    let live = Arc::new(Live { on: AtomicBool::new(on), online: AtomicBool::new(true), brightness: AtomicU8::new(brightness) });
    let (on_tx, on_changed) = async_channel::bounded(1);
    let (level_tx, level_changed) = async_channel::bounded(1);
    let bridged = Bridged { endpoint, id: id.into(), name: id.into(), kind, live: live.clone(), on_changed, level_changed };
    (bridged, Device { live, on_tx, level_tx })
}

fn lan_ipv4() -> std::net::Ipv4Addr {
    if_addrs::get_if_addrs()
        .unwrap()
        .into_iter()
        .filter(|ia| !ia.is_loopback())
        .find_map(|ia| match ia.addr {
            if_addrs::IfAddr::V4(v4) => Some(v4.ip),
            _ => None,
        })
        .expect("a LAN interface with IPv4")
}

#[test]
fn a_controller_pairs_and_drives_the_bridge() {
    let _ = env_logger::builder().is_test(true).try_init();
    let dir = std::path::Path::new(env!("CARGO_TARGET_TMPDIR")).join(format!("matter-bridge-{}", std::process::id()));
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).unwrap();

    let (plug, plug_side) = device(PLUG, "plug", Kind::Plug, false, 100);
    let (lamp, lamp_side) = device(LAMP, "lamp", Kind::Color, true, 50);
    let sent: Sent = Default::default();
    let (stop_tx, stop_rx) = async_channel::bounded(1);

    let bridge_sent = sent.clone();
    let bridge_dir = dir.clone();
    let bridge = std::thread::spawn(move || {
        let setup = Setup { dir: bridge_dir, passcode: PASSCODE, discriminator: 1234, host: "D0D0D0D0D0D0".into(), pairing: false, port: PORT };
        let send = move |id: &str, cmd: DeviceCommand| bridge_sent.lock().unwrap().push((id.to_string(), cmd));
        let paired = AtomicBool::new(false);
        bridge::run(&setup, &[plug, lamp], &send, stop_rx, &paired).unwrap();
    });

    // A big future: run it on a thread with room for it, like rs-matter's own test.
    let controller = std::thread::Builder::new()
        .stack_size(32 * 1024 * 1024)
        .spawn(move || futures_lite::future::block_on(controller(sent, plug_side, lamp_side)))
        .unwrap();
    let result = controller.join().unwrap();
    let _ = stop_tx.try_send(());
    bridge.join().unwrap();
    let _ = std::fs::remove_dir_all(&dir);
    result.unwrap();
}

async fn controller(sent: Sent, plug: Device, lamp: Device) -> Result<(), Error> {
    // Give the bridge a moment to bind.
    async_io::Timer::after(Duration::from_millis(500)).await;
    with_controller(|matter| Box::pin(async move { flow(matter, &default_crypto(rand_matter::rng(), DAC_PRIVKEY), sent, plug, lamp).await })).await
}

type Flow<'a> = core::pin::Pin<Box<dyn core::future::Future<Output = Result<(), Error>> + 'a>>;

/// Runs `flow` with a controller's Matter stack and transport.
async fn with_controller(flow: impl for<'a> FnOnce(&'a Matter<'a>) -> Flow<'a>) -> Result<(), Error> {
    let matter = Matter::new(&TEST_DEV_DET, TEST_DEV_COMM, &TEST_DEV_ATT, 0);
    let crypto = default_crypto(rand_matter::rng(), DAC_PRIVKEY);
    let socket = Socket::new(Domain::IPV6, Type::DGRAM, Some(Protocol::UDP)).unwrap();
    socket.set_only_v6(false).unwrap();
    socket.bind(&std::net::SocketAddrV6::new(std::net::Ipv6Addr::UNSPECIFIED, 0, 0, 0).into()).unwrap();
    let socket = async_io::Async::<UdpSocket>::new_nonblocking(socket.into()).unwrap();

    let mut transport = pin!(matter.run(&crypto, &socket, &socket, NoNetwork));
    let mut flow = flow(&matter);
    let mut timeout = pin!(async_io::Timer::after(Duration::from_secs(90)));
    match select(&mut flow, select(&mut transport, &mut timeout)).await {
        Either::First(result) => result,
        Either::Second(Either::First(r)) => panic!("controller transport ended: {r:?}"),
        Either::Second(Either::Second(_)) => panic!("timed out"),
    }
}

/// Polls `sent` for a command to `id` matching `check`, for up to two seconds.
async fn expect(sent: &Sent, id: &str, what: &str, check: impl Fn(&DeviceCommand) -> bool) {
    for _ in 0..40 {
        if sent.lock().unwrap().iter().any(|(i, c)| i == id && check(c)) {
            return;
        }
        async_io::Timer::after(Duration::from_millis(50)).await;
    }
    panic!("no {what} for {id}; sent: {:?}", sent.lock().unwrap());
}

async fn flow<C: Crypto>(matter: &Matter<'_>, crypto: &C, sent: Sent, plug: Device, lamp: Device) -> Result<(), Error> {
    use rs_matter::dm::clusters::app::color_control::ColorControlClient;
    use rs_matter::dm::clusters::app::level_control::LevelControlClient;
    use rs_matter::dm::clusters::app::on_off::OnOffClient;
    use rs_matter::dm::clusters::decl::bridged_device_basic_information::BridgedDeviceBasicInformationClient;

    let (fab, node) = commission(matter, crypto, PORT, PASSCODE).await?;
    let ex = || Exchange::initiate(matter, default_crypto(rand_matter::rng(), DAC_PRIVKEY), fab, node);

    // Names and reachability come from Domus.
    let label = ex().await?.bridged_device_basic_information().node_label_read_with(LAMP, |v| v.map(String::from)).await??;
    assert_eq!(label, "lamp");
    assert!(ex().await?.bridged_device_basic_information().reachable_read(PLUG).await?);

    // Matter -> Domus: switch the plug on.
    assert!(!ex().await?.on_off().on_off_read(PLUG).await?);
    ex().await?.on_off().on(PLUG).await?;
    expect(&sent, "plug", "is_on", |c| c.is_on == Some(true)).await;

    // Brightness: Matter level 203 of 254 is 80 %.
    assert_eq!(ex().await?.level_control().current_level_read(LAMP).await?.into_option(), Some(bridge::percent_to_level(50)));
    ex().await?
        .level_control()
        .move_to_level(LAMP, |r| r.level(203)?.transition_time(rs_matter::tlv::Nullable::none())?.options_mask(Default::default())?.options_override(Default::default())?.end())
        .await?;
    expect(&sent, "lamp", "brightness 80", |c| c.brightness == Some(80)).await;

    // Colour: hue 0, full saturation is red.
    ex().await?
        .color_control()
        .move_to_hue_and_saturation(LAMP, |r| {
            r.hue(0)?.saturation(254)?.transition_time(0)?.options_mask(Default::default())?.options_override(Default::default())?.end()
        })
        .await?;
    expect(&sent, "lamp", "red", |c| c.color.as_deref() == Some("#ff0000") && c.color_mode.as_deref() == Some("color")).await;

    // White: 400 mireds is 2500 K, the warmest Domus has.
    ex().await?
        .color_control()
        .move_to_color_temperature(LAMP, |r| {
            r.color_temperature_mireds(400)?.transition_time(0)?.options_mask(Default::default())?.options_override(Default::default())?.end()
        })
        .await?;
    expect(&sent, "lamp", "warm white", |c| c.color_temp == Some(0) && c.color_mode.as_deref() == Some("white")).await;

    // Domus -> Matter: the lamp switched off and dimmed in Domus shows in Matter.
    lamp.live.on.store(false, Ordering::Relaxed);
    let _ = lamp.on_tx.try_send(());
    lamp.live.brightness.store(20, Ordering::Relaxed);
    let _ = lamp.level_tx.try_send(());
    async_io::Timer::after(Duration::from_millis(300)).await;
    assert!(!ex().await?.on_off().on_off_read(LAMP).await?);
    assert_eq!(ex().await?.level_control().current_level_read(LAMP).await?.into_option(), Some(bridge::percent_to_level(20)));

    // The plug has no level control: Matter refuses it rather than reaching Domus.
    assert!(ex().await?.level_control().current_level_read(PLUG).await.is_err());
    drop(plug);
    Ok(())
}

/// Builds the controller's fabric and commissions the bridge into it (PASE, then CASE).
async fn commission<C: Crypto>(matter: &Matter<'_>, crypto: &C, port: u16, passcode: u32) -> Result<(NonZeroU8, u64), Error> {
    const FABRIC_ID: u64 = 1;
    const CONTROLLER_NODE_ID: u64 = 112233;
    const DEVICE_NODE_ID: u64 = 112234;

    let mut rcac_buf = [0u8; MAX_CERT_TLV_AND_ASN1_LEN];
    let mut rcac_gen = RcacGenerator::new(&mut rcac_buf);
    let (rcac_priv, rcac) = rcac_gen.generate(crypto, FABRIC_ID, VALID_FOREVER)?;
    let mut icac_buf = [0u8; MAX_CERT_TLV_AND_ASN1_LEN];
    let mut icac_gen = IcacGenerator::new(&mut icac_buf);
    let (icac_priv, icac) = icac_gen.generate(crypto, rcac_priv.reference(), rcac, VALID_FOREVER)?;
    drop(rcac_priv);

    let key = crypto.generate_secret_key()?;
    let mut csr_buf = [0u8; 256];
    let csr = key.csr(&mut csr_buf)?;
    let mut key_canon = CanonPkcSecretKey::new();
    key.write_canon(&mut key_canon)?;

    let mut noc_buf = [0u8; MAX_CERT_TLV_AND_ASN1_LEN];
    let mut nocs = NocGenerator::create(icac_priv.reference(), rcac, icac, &mut noc_buf)?;
    let noc = nocs.generate(crypto, csr, CONTROLLER_NODE_ID, &[], VALID_FOREVER)?;
    let mut ipk = CanonAeadKey::new();
    crypto.rand()?.fill_bytes(ipk.access_mut());
    let fab = matter.with_state(|state| {
        state
            .fabrics
            .add(crypto, key_canon.reference(), rcac, noc, icac, Some(ipk.reference()), 0xFFF1, CONTROLLER_NODE_ID)
            .map(|f| f.fab_idx())
    })?;

    let mut buf = [0u8; MAX_CERT_TLV_LEN];
    let mut commissioner = Commissioner::new(matter, crypto, fab, &mut nocs, &mut buf).with_transport(TransportPreference::Mrp);
    let opts = CommissionOptions { allow_test_attestation: true, ..CommissionOptions::default() };
    let peer = SocketAddrV6::new(lan_ipv4().to_ipv6_mapped(), port, 0, 0);
    let result = commissioner.commission(Address::Udp(SocketAddr::V6(peer)), passcode, &opts, DEVICE_NODE_ID, VALID_FOREVER).await?;

    // No mDNS here: answer the operational lookup with the bridge's address.
    let resolver = async {
        loop {
            let service = matter.transport().wait_mdns_resolve_request().await;
            let MatterRemoteService::Operational { .. } = &service else { continue };
            let mut name = heapless::String::<128>::new();
            service.instance_name(&mut name);
            matter.transport().try_deposit_mdns_resolve(
                &MdnsRemoteService {
                    instance_name: DottedName(name.as_str()),
                    port: Some(port),
                    addrs: core::iter::once(IpAddr::V6(*peer.ip())),
                    txt: core::iter::empty(),
                    scope_id: 0,
                },
                &[],
            );
        }
    };
    match select(pin!(commissioner.complete_via_case(&result)), pin!(resolver)).await {
        Either::First(r) => r?,
        Either::Second(()) => unreachable!(),
    }
    Ok((fab, result.device_node_id))
}

/// Pairs with a running Domus server and drives its shared devices, end to end through to the real
/// (or fake) devices behind it. Opt in: set DOMUS_MATTER_PORT and DOMUS_MATTER_PASSCODE, and
/// DOMUS_MATTER_PLUG / DOMUS_MATTER_LAMP to the endpoints to switch and to dim and colour.
#[test]
#[ignore]
fn a_controller_drives_a_running_server() {
    let _ = env_logger::builder().is_test(true).try_init();
    let var = |k: &str| std::env::var(k).unwrap_or_else(|_| panic!("set {k}")).parse::<u32>().unwrap();
    let (port, passcode, plug, lamp) = (var("DOMUS_MATTER_PORT") as u16, var("DOMUS_MATTER_PASSCODE"), var("DOMUS_MATTER_PLUG") as u16, var("DOMUS_MATTER_LAMP") as u16);
    std::thread::Builder::new()
        .stack_size(32 * 1024 * 1024)
        .spawn(move || {
            futures_lite::future::block_on(with_controller(|matter| {
                Box::pin(async move {
                    let crypto = &default_crypto(rand_matter::rng(), DAC_PRIVKEY);
                    use rs_matter::dm::clusters::app::color_control::ColorControlClient;
                    use rs_matter::dm::clusters::app::level_control::LevelControlClient;
                    use rs_matter::dm::clusters::app::on_off::OnOffClient;
                    let (fab, node) = commission(matter, crypto, port, passcode).await?;
                    let ex = || Exchange::initiate(matter, default_crypto(rand_matter::rng(), DAC_PRIVKEY), fab, node);
                    ex().await?.on_off().toggle(plug).await?;
                    ex().await?
                        .level_control()
                        .move_to_level(lamp, |r| r.level(127)?.transition_time(rs_matter::tlv::Nullable::none())?.options_mask(Default::default())?.options_override(Default::default())?.end())
                        .await?;
                    ex().await?
                        .color_control()
                        .move_to_hue_and_saturation(lamp, |r| r.hue(85)?.saturation(254)?.transition_time(0)?.options_mask(Default::default())?.options_override(Default::default())?.end())
                        .await?;
                    async_io::Timer::after(Duration::from_secs(1)).await;
                    Ok(())
                })
            }))
        })
        .unwrap()
        .join()
        .unwrap()
        .unwrap();
}
