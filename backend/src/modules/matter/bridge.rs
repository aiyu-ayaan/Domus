//! The Matter side of the bridge: every exposed Domus device is a bridged endpoint (an On/Off light
//! or plug) behind an Aggregator, served by rs-matter on its own executor.

use core::pin::pin;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Arc;

use embassy_futures::select::{select, select4};
use rs_matter::crypto::{default_crypto, Crypto};
use rs_matter::dm::clusters::app::on_off::{self, EffectVariantEnum, OnOffHooks, OutOfBandMessage, StartUpOnOffEnum};
use rs_matter::dm::clusters::basic_info::BasicInfoConfig;
use rs_matter::dm::clusters::decl::on_off as on_off_cluster;
use rs_matter::dm::clusters::decl::bridged_device_basic_information::{self, ClusterHandler as _, KeepActiveRequest};
use rs_matter::dm::clusters::desc::{self, ClusterHandler as _};
use rs_matter::dm::clusters::groups::{self, ClusterHandler as _};
use rs_matter::dm::devices::test::{DAC_PRIVKEY, TEST_DEV_ATT, TEST_PID, TEST_VID};
use rs_matter::dm::devices::{DEV_TYPE_AGGREGATOR, DEV_TYPE_BRIDGED_NODE, DEV_TYPE_ON_OFF_LIGHT};
use rs_matter::dm::endpoints;
use rs_matter::dm::networks::eth::EthNetwork;
use rs_matter::dm::networks::SysNetifs;
use rs_matter::dm::{
    Async, AsyncHandler, Cluster, Dataver, DeviceType, Endpoint, EndptId, HandlerContext, InvokeContext, InvokeReply, MatchContext, Node,
    ReadContext, ReadReply, WriteContext,
};
use rs_matter::error::{Error, ErrorCode};
use rs_matter::im::{EthInteractionModelState, InteractionModel};
use rs_matter::persist::DirKvBlobStore;
use rs_matter::respond::DefaultResponder;
use rs_matter::sc::pase::{Spake2pVerifierPassword, Spake2pVerifierPasswordRef};
use rs_matter::sc::pase::MAX_COMM_WINDOW_TIMEOUT_SECS;
use rs_matter::tlv::{Nullable, TLVBuilderParent, Utf8StrBuilder};
use rs_matter::transport::exchange::MatterBuffers;
use rs_matter::transport::MATTER_SOCKET_BIND_ADDR;
use rs_matter::utils::select::Coalesce;
use rs_matter::{clusters, devices, root_endpoint, with, BasicCommData, Matter, MATTER_PORT};

/// The On/Off Plug-in Unit device type; rs-matter only names the light.
const DEV_TYPE_ON_OFF_PLUG_IN_UNIT: DeviceType = DeviceType { dtype: 0x010A, drev: 3 };

const ROOT: Endpoint<'static> = root_endpoint!(eth);
/// Lists every bridged endpoint, as Matter requires of a bridge.
const AGGREGATOR: Endpoint<'static> = Endpoint::new(1, devices!(DEV_TYPE_AGGREGATOR), clusters!(desc::DescHandler::CLUSTER));

/// One Domus device as the bridge sees it. Domus keeps `on` and `online` current and sends on
/// `changed` so the bridge reports them to the controllers.
pub struct Bridged {
    pub endpoint: EndptId,
    pub id: String,
    pub name: String,
    pub light: bool,
    pub on: Arc<AtomicBool>,
    pub online: Arc<AtomicBool>,
    pub changed: async_channel::Receiver<()>,
}

/// Where the bridge keeps its fabrics, and the secret that commissions it.
pub struct Setup {
    pub dir: PathBuf,
    pub passcode: u32,
    pub discriminator: u16,
    /// The mDNS host name: 12 hex digits, unique on the network.
    pub host: String,
    /// Open a commissioning window even when already paired, to add another ecosystem.
    pub pairing: bool,
}

fn comm(setup: &Setup) -> BasicCommData {
    BasicCommData {
        password: Spake2pVerifierPassword::new_from_ref(Spake2pVerifierPasswordRef::new(&setup.passcode.to_le_bytes())),
        discriminator: setup.discriminator,
    }
}

// shortcut: the Matter SDK's test attestation (VID 0xFFF1), so controllers call the bridge uncertified;
// certification needs a CSA vendor ID and a real DAC.
const DETAILS: BasicInfoConfig = BasicInfoConfig {
    vid: TEST_VID,
    pid: TEST_PID,
    hw_ver: 1,
    hw_ver_str: "1",
    sw_ver: 1,
    sw_ver_str: "1",
    serial_no: "domus",
    manufacturing_date: "20261015",
    product_name: "Domus Bridge",
    vendor_name: "Domus",
    device_name: "Domus",
    ..BasicInfoConfig::new()
};

/// The manual pairing code typed into a controller, e.g. "3497-011-2332".
pub fn pairing_code(setup: &Setup) -> String {
    comm(setup).compute_pretty_pairing_code().to_string()
}

/// The QR a controller scans: its "MT:" payload and its modules, one string of '1'/'0' per row.
pub fn pairing_qr(setup: &Setup) -> Result<(String, Vec<String>), Error> {
    use rs_matter::pairing::qr::{no_optional_data, CommFlowType, Qr, QrPayload};
    use rs_matter::pairing::DiscoveryCapabilities;
    let payload = QrPayload::new_from_basic_info(DiscoveryCapabilities::IP, CommFlowType::Standard, comm(setup), &DETAILS, no_optional_data as fn() -> _);
    let mut buf = vec![0u8; 4096];
    let (text, rest) = payload.as_str(&mut buf)?;
    let text = text.to_string();
    let (tmp, out) = rest.split_at_mut(rest.len() / 2);
    let qr = Qr::compute(&text, tmp, out)?;
    let size = qr.size() as i32;
    let rows = (0..size).map(|y| (0..size).map(|x| if qr.get_module(x, y) { '1' } else { '0' }).collect()).collect();
    Ok((text, rows))
}

struct Hooks<'a> {
    device: &'a Bridged,
    send: &'a (dyn Fn(&str, bool) + Sync),
}

impl OnOffHooks for Hooks<'_> {
    const CLUSTER: Cluster<'static> = on_off_cluster::FULL_CLUSTER
        .with_revision(6)
        .with_features(on_off::Feature::LIGHTING.bits())
        .with_attrs(with!(
            required;
            on_off_cluster::AttributeId::OnOff
                | on_off_cluster::AttributeId::GlobalSceneControl
                | on_off_cluster::AttributeId::OnTime
                | on_off_cluster::AttributeId::OffWaitTime
                | on_off_cluster::AttributeId::StartUpOnOff
        ))
        .with_cmds(with!(
            on_off_cluster::CommandId::Off
                | on_off_cluster::CommandId::On
                | on_off_cluster::CommandId::Toggle
                | on_off_cluster::CommandId::OffWithEffect
                | on_off_cluster::CommandId::OnWithRecallGlobalScene
                | on_off_cluster::CommandId::OnWithTimedOff
        ));

    fn on_off(&self) -> bool {
        self.device.on.load(Ordering::Relaxed)
    }

    fn set_on_off(&self, on: bool) {
        if self.device.on.swap(on, Ordering::Relaxed) != on {
            (self.send)(&self.device.id, on);
        }
    }

    // What a device does after a power cut is up to the device, not the bridge.
    fn start_up_on_off(&self) -> Nullable<StartUpOnOffEnum> {
        Nullable::none()
    }

    fn set_start_up_on_off(&self, _value: Nullable<StartUpOnOffEnum>) -> Result<(), Error> {
        Ok(())
    }

    async fn handle_off_with_effect(&self, _effect: EffectVariantEnum) {}

    async fn run<F: Fn(OutOfBandMessage)>(&self, notify: F) {
        while self.device.changed.recv().await.is_ok() {
            notify(OutOfBandMessage::Update);
        }
        core::future::pending::<()>().await
    }
}

struct Info<'a> {
    dataver: Dataver,
    device: &'a Bridged,
}

impl Info<'_> {
    const fn adapt(self) -> bridged_device_basic_information::HandlerAdaptor<Self> {
        bridged_device_basic_information::HandlerAdaptor(self)
    }
}

impl bridged_device_basic_information::ClusterHandler for Info<'_> {
    const CLUSTER: Cluster<'static> = bridged_device_basic_information::FULL_CLUSTER
        .with_features(0)
        .with_attrs(with!(
            required;
            bridged_device_basic_information::AttributeId::NodeLabel | bridged_device_basic_information::AttributeId::UniqueID
        ))
        .with_cmds(with!());

    fn dataver(&self) -> u32 {
        self.dataver.get()
    }

    fn dataver_changed(&self) {
        self.dataver.changed();
    }

    fn reachable(&self, _ctx: impl ReadContext) -> Result<bool, Error> {
        Ok(self.device.online.load(Ordering::Relaxed))
    }

    fn unique_id<P: TLVBuilderParent>(&self, _ctx: impl ReadContext, builder: Utf8StrBuilder<P>) -> Result<P, Error> {
        builder.set(&self.device.id)
    }

    fn node_label<P: TLVBuilderParent>(&self, _ctx: impl ReadContext, builder: Utf8StrBuilder<P>) -> Result<P, Error> {
        builder.set(&self.device.name)
    }

    fn handle_keep_active(&self, _ctx: impl InvokeContext, _request: KeepActiveRequest<'_>) -> Result<(), Error> {
        Ok(())
    }
}

/// Routes each request to the bridged device that owns its endpoint. The `chain` builder only takes
/// `fn` matchers, so it cannot hold a list that is only known at run time.
struct Bridge<S> {
    slots: Vec<(EndptId, S)>,
}

impl<S> Bridge<S> {
    fn find(&self, ctx: &impl MatchContext) -> Option<&S> {
        let endpoint = ctx.endpt()?;
        self.slots.iter().find(|(e, _)| *e == endpoint).map(|(_, s)| s)
    }
}

type Done = core::future::Ready<Result<(), Error>>;

fn missing() -> Done {
    core::future::ready(Err(ErrorCode::EndpointNotFound.into()))
}

impl<S: AsyncHandler> AsyncHandler for Bridge<S> {
    fn read_awaits(&self, ctx: impl ReadContext) -> bool {
        self.find(&ctx).is_some_and(|s| s.read_awaits(ctx))
    }

    fn write_awaits(&self, ctx: impl WriteContext) -> bool {
        self.find(&ctx).is_some_and(|s| s.write_awaits(ctx))
    }

    fn invoke_awaits(&self, ctx: impl InvokeContext) -> bool {
        self.find(&ctx).is_some_and(|s| s.invoke_awaits(ctx))
    }

    fn read(&self, ctx: impl ReadContext, reply: impl ReadReply) -> impl core::future::Future<Output = Result<(), Error>> {
        match self.find(&ctx) {
            Some(s) => futures::future::Either::Left(s.read(ctx, reply)),
            None => futures::future::Either::Right(missing()),
        }
    }

    fn write(&self, ctx: impl WriteContext) -> impl core::future::Future<Output = Result<(), Error>> {
        match self.find(&ctx) {
            Some(s) => futures::future::Either::Left(s.write(ctx)),
            None => futures::future::Either::Right(missing()),
        }
    }

    fn invoke(&self, ctx: impl InvokeContext, reply: impl InvokeReply) -> impl core::future::Future<Output = Result<(), Error>> {
        match self.find(&ctx) {
            Some(s) => futures::future::Either::Left(s.invoke(ctx, reply)),
            None => futures::future::Either::Right(missing()),
        }
    }

    fn bump_dataver(&self, ctx: impl MatchContext) {
        let endpoint = ctx.endpt();
        for (e, s) in &self.slots {
            if endpoint.is_none_or(|x| x == *e) {
                s.bump_dataver(&ctx);
            }
        }
    }

    fn lifecycle(&self, ctx: impl HandlerContext, op: rs_matter::dm::LifecycleOp) -> Result<(), Error> {
        for (_, s) in &self.slots {
            s.lifecycle(&ctx, op)?;
        }
        Ok(())
    }

    async fn run(&self, ctx: impl HandlerContext) -> Result<(), Error> {
        if self.slots.is_empty() {
            return core::future::pending().await;
        }
        futures::future::select_all(self.slots.iter().map(|(_, s)| Box::pin(s.run(&ctx)))).await.0
    }
}

/// The clusters of one bridged device; [Bridge] has already picked the endpoint.
fn slot<'a, O: AsyncHandler + 'a>(rand: &mut impl rand_matter::Rng, device: &'a Bridged, on_off: O) -> impl AsyncHandler + 'a {
    rs_matter::dm::EmptyHandler
        .chain(|_, c| c == desc::DescHandler::CLUSTER.id, Async(desc::DescHandler::new(Dataver::new_rand(rand)).adapt()))
        .chain(|_, c| c == groups::GroupsHandler::CLUSTER.id, Async(groups::GroupsHandler::new(Dataver::new_rand(rand)).adapt()))
        .chain(|_, c| c == Hooks::CLUSTER.id, on_off)
        .chain(|_, c| c == Info::CLUSTER.id, Async(Info { dataver: Dataver::new_rand(rand), device }.adapt()))
}

/// Serves the bridge until `stop` gets a message. Blocking: give it a thread of its own.
/// `paired` follows whether any controller has paired.
pub fn run(
    setup: &Setup,
    devices: &[Bridged],
    send: &(dyn Fn(&str, bool) + Sync),
    stop: async_channel::Receiver<()>,
    paired: &AtomicBool,
) -> Result<(), Error> {
    let matter = Matter::new(&DETAILS, comm(setup), &TEST_DEV_ATT, MATTER_PORT);
    let buffers: MatterBuffers = MatterBuffers::new();
    let state: EthInteractionModelState = EthInteractionModelState::new(EthNetwork::new_default());
    let kv = matter.kv(DirKvBlobStore::new(setup.dir.clone()));
    matter.startup(&kv)?;
    let crypto = default_crypto(rand_matter::rng(), DAC_PRIVKEY);
    let mut rand = crypto.rand()?;

    let on_offs: Vec<_> = devices
        .iter()
        .map(|d| on_off::OnOffHandler::new_standalone(Dataver::new_rand(&mut rand), d.endpoint, Hooks { device: d, send }))
        .collect();
    let mut endpoints = vec![ROOT, AGGREGATOR];
    endpoints.extend(devices.iter().map(|d| {
        let kinds = if d.light { devices!(DEV_TYPE_ON_OFF_LIGHT, DEV_TYPE_BRIDGED_NODE) } else { devices!(DEV_TYPE_ON_OFF_PLUG_IN_UNIT, DEV_TYPE_BRIDGED_NODE) };
        Endpoint::new(d.endpoint, kinds, clusters!(desc::DescHandler::CLUSTER, groups::GroupsHandler::CLUSTER, Info::CLUSTER, Hooks::CLUSTER))
    }));
    let node = Node { endpoints: &endpoints };
    let bridge = Bridge {
        slots: devices.iter().zip(&on_offs).map(|(d, h)| (d.endpoint, slot(&mut rand, d, on_off::HandlerAsyncAdaptor(h)))).collect(),
    };
    let model = (
        node,
        endpoints::EthSysHandlerBuilder::new()
            .netif_diag(&SysNetifs)
            .build(rand)
            .chain(|e, c| e == 1 && c == desc::DescHandler::CLUSTER.id, Async(desc::DescHandler::new_aggregator(Dataver::new_rand(&mut rand)).adapt()))
            .chain(|e, _| e >= 2, bridge),
    );
    let im = InteractionModel::new(&matter, &crypto, &buffers, model, &kv, &state);
    futures_lite::future::block_on(im.startup())?;

    let responder = DefaultResponder::new(&im);
    let mut respond = pin!(responder.run::<4, 4>());
    let mut im_job = pin!(im.run());
    let socket = async_io::Async::<UdpSocket>::bind(MATTER_SOCKET_BIND_ADDR)?;
    let mut mdns = pin!(super::mdns::run(&matter, &crypto, &setup.host));
    let mut transport = pin!(matter.run(&crypto, &socket, &socket, &socket));
    if !matter.has_fabrics() || setup.pairing {
        matter.open_basic_comm_window(MAX_COMM_WINDOW_TIMEOUT_SECS, &crypto, &())?;
    }
    let all = select4(&mut transport, &mut mdns, &mut respond, &mut im_job).coalesce();
    let watch = async {
        loop {
            paired.store(matter.has_fabrics(), Ordering::Relaxed);
            async_io::Timer::after(std::time::Duration::from_secs(5)).await;
        }
    };
    match futures_lite::future::block_on(select(all, select(stop.recv(), watch))) {
        embassy_futures::select::Either::First(Err(e)) => Err(e),
        _ => Ok(()),
    }
}
