//! The Matter side of the bridge: every exposed Domus device is a bridged endpoint (an On/Off light
//! or plug) behind an Aggregator, served by rs-matter on its own executor.

use core::pin::pin;
use std::net::UdpSocket;
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, AtomicU8, Ordering};
use std::sync::Arc;

use embassy_futures::select::{select, select4};
use rs_matter::crypto::{default_crypto, Crypto};
use rs_matter::dm::clusters::app::color_control::{self, ColorCapabilitiesBitmap, ColorControlHooks, SetDeviceColor};
use rs_matter::dm::clusters::app::level_control::{self, LevelControlHooks, OptionsBitmap};
use rs_matter::dm::clusters::app::on_off::{self, EffectVariantEnum, OnOffHooks, OutOfBandMessage, StartUpOnOffEnum};
use rs_matter::dm::clusters::basic_info::BasicInfoConfig;
use rs_matter::dm::clusters::decl::on_off as on_off_cluster;
use rs_matter::dm::clusters::decl::bridged_device_basic_information::{self, ClusterHandler as _, KeepActiveRequest};
use rs_matter::dm::clusters::desc::{self, ClusterHandler as _};
use rs_matter::dm::clusters::groups::{self, ClusterHandler as _};
use rs_matter::dm::devices::test::{DAC_PRIVKEY, TEST_DEV_ATT, TEST_PID, TEST_VID};
use rs_matter::dm::devices::{DEV_TYPE_AGGREGATOR, DEV_TYPE_BRIDGED_NODE, DEV_TYPE_DIMMABLE_LIGHT, DEV_TYPE_EXTENDED_COLOR_LIGHT, DEV_TYPE_ON_OFF_LIGHT};
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
use rs_matter::utils::select::Coalesce;
use home_core::{hsv_to_hex, DeviceCommand};
use rs_matter::{clusters, devices, root_endpoint, with, BasicCommData, Matter};

/// The On/Off Plug-in Unit device type; rs-matter only names the light.
const DEV_TYPE_ON_OFF_PLUG_IN_UNIT: DeviceType = DeviceType { dtype: 0x010A, drev: 3 };

const ROOT: Endpoint<'static> = root_endpoint!(eth);
/// Lists every bridged endpoint, as Matter requires of a bridge.
const AGGREGATOR: Endpoint<'static> = Endpoint::new(1, devices!(DEV_TYPE_AGGREGATOR), clusters!(desc::DescHandler::CLUSTER));

/// What Domus keeps current about a shared device; the bridge reads it.
#[derive(Default)]
pub struct Live {
    pub on: AtomicBool,
    pub online: AtomicBool,
    /// 1-100 %, as Domus has it.
    pub brightness: AtomicU8,
}

/// What a shared device can do, which decides its Matter device type and clusters.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Kind {
    Plug,
    Light,
    Dimmable,
    Color,
}

/// One Domus device as the bridge sees it. Domus updates [Live] and sends on `on_changed` /
/// `level_changed` so the bridge reports the change to the controllers.
pub struct Bridged {
    pub endpoint: EndptId,
    pub id: String,
    pub name: String,
    pub kind: Kind,
    pub live: Arc<Live>,
    pub on_changed: async_channel::Receiver<()>,
    pub level_changed: async_channel::Receiver<()>,
}

/// Where a controller's commands go: device id and the Domus command.
pub type Send = dyn Fn(&str, DeviceCommand) + Sync;

/// Matter levels are 1-254, Domus brightness 1-100 %.
pub fn level_to_percent(level: u8) -> u8 {
    ((level as u32 * 100 + 127) / 254).clamp(1, 100) as u8
}

pub fn percent_to_level(percent: u8) -> u8 {
    ((percent.min(100) as u32 * 254 + 50) / 100).clamp(1, 254) as u8
}

/// Warmest and coolest white Domus lights take (Tapo and Tuya: 2500-6500 K), as Matter mireds.
pub const MIREDS_COOL: u16 = 154;
pub const MIREDS_WARM: u16 = 400;

/// The Domus command for a colour a controller asked for. Colours are sent at full value: brightness
/// is the Level Control cluster's job.
pub fn color_command(target: SetDeviceColor) -> DeviceCommand {
    match target {
        SetDeviceColor::ColorTemperature { mireds } => {
            let kelvin = 1_000_000.0 / mireds.clamp(MIREDS_COOL, MIREDS_WARM) as f64;
            let percent = ((kelvin - 2500.0) / 4000.0 * 100.0).round().clamp(0.0, 100.0) as u8;
            DeviceCommand { color_temp: Some(percent), color_mode: Some("white".into()), ..Default::default() }
        }
        other => {
            let (hue, saturation) = other.to_hue_saturation();
            let color = hsv_to_hex(hue as f64 / 65536.0 * 360.0, saturation as f64 / 254.0, 1.0);
            DeviceCommand { color: Some(color), color_mode: Some("color".into()), ..Default::default() }
        }
    }
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
    /// UDP port; Matter's own is 5540.
    pub port: u16,
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
    send: &'a Send,
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
        self.device.live.on.load(Ordering::Relaxed)
    }

    fn set_on_off(&self, on: bool) {
        if self.device.live.on.swap(on, Ordering::Relaxed) != on {
            (self.send)(&self.device.id, DeviceCommand { is_on: Some(on), ..Default::default() });
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
        while self.device.on_changed.recv().await.is_ok() {
            notify(OutOfBandMessage::Update);
        }
        core::future::pending::<()>().await
    }
}

struct Level<'a> {
    device: &'a Bridged,
    send: &'a Send,
}

impl LevelControlHooks for Level<'_> {
    const MIN_LEVEL: u8 = 1;
    const MAX_LEVEL: u8 = 254;
    const FASTEST_RATE: u8 = 50;
    const CLUSTER: Cluster<'static> = level_control::FULL_CLUSTER
        .with_features(level_control::Feature::LIGHTING.bits() | level_control::Feature::ON_OFF.bits())
        .with_attrs(with!(
            required;
            level_control::AttributeId::CurrentLevel
                | level_control::AttributeId::RemainingTime
                | level_control::AttributeId::MinLevel
                | level_control::AttributeId::MaxLevel
                | level_control::AttributeId::OnOffTransitionTime
                | level_control::AttributeId::OnLevel
                | level_control::AttributeId::OnTransitionTime
                | level_control::AttributeId::OffTransitionTime
                | level_control::AttributeId::DefaultMoveRate
                | level_control::AttributeId::Options
                | level_control::AttributeId::StartUpCurrentLevel
        ))
        .with_cmds(with!(
            level_control::CommandId::MoveToLevel
                | level_control::CommandId::Move
                | level_control::CommandId::Step
                | level_control::CommandId::Stop
                | level_control::CommandId::MoveToLevelWithOnOff
                | level_control::CommandId::MoveWithOnOff
                | level_control::CommandId::StepWithOnOff
                | level_control::CommandId::StopWithOnOff
        ));

    fn set_device_level(&self, level: u8) -> Result<Option<u8>, ()> {
        let percent = level_to_percent(level);
        if self.device.live.brightness.swap(percent, Ordering::Relaxed) != percent {
            (self.send)(&self.device.id, DeviceCommand { brightness: Some(percent), ..Default::default() });
        }
        Ok(Some(level))
    }

    fn current_level(&self) -> Option<u8> {
        Some(percent_to_level(self.device.live.brightness.load(Ordering::Relaxed)))
    }

    // What a light does after a power cut is up to the light: null, keep its own level.
    fn start_up_current_level(&self) -> Result<Option<u8>, Error> {
        Ok(None)
    }

    fn set_start_up_current_level(&self, _value: Option<u8>) -> Result<(), Error> {
        Ok(())
    }

    fn set_current_level(&self, level: Option<u8>) {
        if let Some(level) = level {
            self.device.live.brightness.store(level_to_percent(level), Ordering::Relaxed);
        }
    }

    async fn run<F: Fn(level_control::OutOfBandMessage)>(&self, notify: F) {
        while self.device.level_changed.recv().await.is_ok() {
            notify(level_control::OutOfBandMessage::Update(percent_to_level(self.device.live.brightness.load(Ordering::Relaxed))));
        }
        core::future::pending::<()>().await
    }
}

// shortcut: rs-matter 0.4.1 keeps the colour inside the cluster with no way to set it from outside,
// so a colour changed in Domus is not reported back; upgrade when the hooks can report one.
struct Color<'a> {
    device: &'a Bridged,
    send: &'a Send,
}

impl ColorControlHooks for Color<'_> {
    const CLUSTER: Cluster<'static> = color_control::FULL_CLUSTER
        .with_features(
            color_control::Feature::HUE_AND_SATURATION.bits()
                | color_control::Feature::ENHANCED_HUE.bits()
                | color_control::Feature::XY.bits()
                | color_control::Feature::COLOR_TEMPERATURE.bits(),
        )
        .with_attrs(with!(
            required;
            color_control::AttributeId::CurrentHue
                | color_control::AttributeId::CurrentSaturation
                | color_control::AttributeId::RemainingTime
                | color_control::AttributeId::CurrentX
                | color_control::AttributeId::CurrentY
                | color_control::AttributeId::ColorTemperatureMireds
                | color_control::AttributeId::ColorMode
                | color_control::AttributeId::Options
                | color_control::AttributeId::NumberOfPrimaries
                | color_control::AttributeId::EnhancedCurrentHue
                | color_control::AttributeId::EnhancedColorMode
                | color_control::AttributeId::ColorCapabilities
                | color_control::AttributeId::ColorTempPhysicalMinMireds
                | color_control::AttributeId::ColorTempPhysicalMaxMireds
                | color_control::AttributeId::CoupleColorTempToLevelMinMireds
                | color_control::AttributeId::StartUpColorTemperatureMireds
        ))
        .with_cmds(with!(
            color_control::CommandId::MoveToHue
                | color_control::CommandId::MoveHue
                | color_control::CommandId::StepHue
                | color_control::CommandId::MoveToSaturation
                | color_control::CommandId::MoveSaturation
                | color_control::CommandId::StepSaturation
                | color_control::CommandId::MoveToHueAndSaturation
                | color_control::CommandId::MoveToColor
                | color_control::CommandId::MoveColor
                | color_control::CommandId::StepColor
                | color_control::CommandId::MoveToColorTemperature
                | color_control::CommandId::EnhancedMoveToHue
                | color_control::CommandId::EnhancedMoveHue
                | color_control::CommandId::EnhancedStepHue
                | color_control::CommandId::EnhancedMoveToHueAndSaturation
                | color_control::CommandId::StopMoveStep
                | color_control::CommandId::MoveColorTemperature
                | color_control::CommandId::StepColorTemperature
        ));

    const COLOR_CAPABILITIES: ColorCapabilitiesBitmap = ColorCapabilitiesBitmap::from_bits_truncate(
        ColorCapabilitiesBitmap::HUE_SATURATION.bits()
            | ColorCapabilitiesBitmap::ENHANCED_HUE.bits()
            | ColorCapabilitiesBitmap::XY.bits()
            | ColorCapabilitiesBitmap::COLOR_TEMPERATURE.bits(),
    );
    const COLOR_TEMP_PHYSICAL_MIN_MIREDS: u16 = MIREDS_COOL;
    const COLOR_TEMP_PHYSICAL_MAX_MIREDS: u16 = MIREDS_WARM;

    fn set_device_color(&self, target: SetDeviceColor) -> Result<(), ()> {
        (self.send)(&self.device.id, color_command(target));
        Ok(())
    }

    fn start_up_color_temperature_mireds(&self) -> Result<Nullable<u16>, Error> {
        Ok(Nullable::none())
    }

    fn set_start_up_color_temperature_mireds(&self, _value: Nullable<u16>) -> Result<(), Error> {
        Ok(())
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
        Ok(self.device.live.online.load(Ordering::Relaxed))
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

/// The clusters of one bridged device; [Bridge] has already picked the endpoint. Every device
/// gets every handler, so all slots have one type; its endpoint only lists the clusters it has.
fn slot<'a, O: AsyncHandler + 'a, L: AsyncHandler + 'a, C: AsyncHandler + 'a>(
    rand: &mut impl rand_matter::Rng,
    device: &'a Bridged,
    on_off: O,
    level: L,
    color: C,
) -> impl AsyncHandler + 'a {
    rs_matter::dm::EmptyHandler
        .chain(|_, c| c == desc::DescHandler::CLUSTER.id, Async(desc::DescHandler::new(Dataver::new_rand(rand)).adapt()))
        .chain(|_, c| c == groups::GroupsHandler::CLUSTER.id, Async(groups::GroupsHandler::new(Dataver::new_rand(rand)).adapt()))
        .chain(|_, c| c == Hooks::CLUSTER.id, on_off)
        .chain(|_, c| c == Level::CLUSTER.id, level)
        .chain(|_, c| c == Color::CLUSTER.id, color)
        .chain(|_, c| c == Info::CLUSTER.id, Async(Info { dataver: Dataver::new_rand(rand), device }.adapt()))
}

const PLUG_CLUSTERS: &[Cluster<'static>] = clusters!(desc::DescHandler::CLUSTER, groups::GroupsHandler::CLUSTER, Info::CLUSTER, Hooks::CLUSTER);
const DIMMABLE_CLUSTERS: &[Cluster<'static>] =
    clusters!(desc::DescHandler::CLUSTER, groups::GroupsHandler::CLUSTER, Info::CLUSTER, Hooks::CLUSTER, Level::CLUSTER);
const COLOR_CLUSTERS: &[Cluster<'static>] =
    clusters!(desc::DescHandler::CLUSTER, groups::GroupsHandler::CLUSTER, Info::CLUSTER, Hooks::CLUSTER, Level::CLUSTER, Color::CLUSTER);

/// Serves the bridge until `stop` gets a message. Blocking: give it a thread of its own.
/// `paired` follows whether any controller has paired.
pub fn run(
    setup: &Setup,
    devices: &[Bridged],
    send: &Send,
    stop: async_channel::Receiver<()>,
    paired: &AtomicBool,
) -> Result<(), Error> {
    let matter = Matter::new(&DETAILS, comm(setup), &TEST_DEV_ATT, setup.port);
    let buffers: MatterBuffers = MatterBuffers::new();
    let state: EthInteractionModelState = EthInteractionModelState::new(EthNetwork::new_default());
    let kv = matter.kv(DirKvBlobStore::new(setup.dir.clone()));
    matter.startup(&kv)?;
    let crypto = default_crypto(rand_matter::rng(), DAC_PRIVKEY);
    let mut rand = crypto.rand()?;

    let on_offs: Vec<_> =
        devices.iter().map(|d| on_off::OnOffHandler::new(Dataver::new_rand(&mut rand), d.endpoint, Hooks { device: d, send })).collect();
    let levels: Vec<_> = devices
        .iter()
        .map(|d| {
            let defaults = level_control::AttributeDefaults {
                options: OptionsBitmap::from_bits(OptionsBitmap::EXECUTE_IF_OFF.bits()).unwrap_or(OptionsBitmap::empty()),
                ..Default::default()
            };
            level_control::LevelControlHandler::new(Dataver::new_rand(&mut rand), d.endpoint, Level { device: d, send }, defaults)
        })
        .collect();
    let colors: Vec<_> = devices
        .iter()
        .map(|d| color_control::ColorControlHandler::new(Dataver::new_rand(&mut rand), d.endpoint, Color { device: d, send }, Default::default()))
        .collect();
    // Couple only the clusters a device has: an uncoupled handler is never reached.
    for (i, d) in devices.iter().enumerate() {
        let dimmable = matches!(d.kind, Kind::Dimmable | Kind::Color);
        on_offs[i].init(dimmable.then(|| &levels[i]));
        if dimmable {
            levels[i].init(Some(&on_offs[i]));
        }
        if d.kind == Kind::Color {
            colors[i].init(Some(&on_offs[i]));
        }
    }
    let mut endpoints = vec![ROOT, AGGREGATOR];
    endpoints.extend(devices.iter().map(|d| {
        let (kinds, clusters) = match d.kind {
            Kind::Plug => (devices!(DEV_TYPE_ON_OFF_PLUG_IN_UNIT, DEV_TYPE_BRIDGED_NODE), PLUG_CLUSTERS),
            Kind::Light => (devices!(DEV_TYPE_ON_OFF_LIGHT, DEV_TYPE_BRIDGED_NODE), PLUG_CLUSTERS),
            Kind::Dimmable => (devices!(DEV_TYPE_DIMMABLE_LIGHT, DEV_TYPE_BRIDGED_NODE), DIMMABLE_CLUSTERS),
            Kind::Color => (devices!(DEV_TYPE_EXTENDED_COLOR_LIGHT, DEV_TYPE_BRIDGED_NODE), COLOR_CLUSTERS),
        };
        Endpoint::new(d.endpoint, kinds, clusters)
    }));
    let node = Node { endpoints: &endpoints };
    let bridge = Bridge {
        slots: devices
            .iter()
            .enumerate()
            .map(|(i, d)| {
                let handlers = (
                    on_off::HandlerAsyncAdaptor(&on_offs[i]),
                    level_control::HandlerAsyncAdaptor(&levels[i]),
                    color_control::HandlerAsyncAdaptor(&colors[i]),
                );
                (d.endpoint, slot(&mut rand, d, handlers.0, handlers.1, handlers.2))
            })
            .collect(),
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
    let socket = async_io::Async::<UdpSocket>::bind(std::net::SocketAddr::new(std::net::Ipv6Addr::UNSPECIFIED.into(), setup.port))?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn levels_round_trip() {
        assert_eq!((level_to_percent(1), level_to_percent(127), level_to_percent(254)), (1, 50, 100));
        assert_eq!((percent_to_level(1), percent_to_level(50), percent_to_level(100)), (3, 127, 254));
        for p in 1..=100 {
            assert_eq!(level_to_percent(percent_to_level(p)), p);
        }
    }

    #[test]
    fn colours_become_domus_commands() {
        let c = color_command(SetDeviceColor::HueSaturation { enhanced_hue: 0, saturation: 254 });
        assert_eq!((c.color.as_deref(), c.color_mode.as_deref()), (Some("#ff0000"), Some("color")));
        let blue = color_command(SetDeviceColor::HueSaturation { enhanced_hue: 43690, saturation: 254 });
        assert_eq!(blue.color.as_deref(), Some("#0000ff"));
        let warm = color_command(SetDeviceColor::ColorTemperature { mireds: 400 });
        assert_eq!((warm.color_temp, warm.color_mode.as_deref()), (Some(0), Some("white")));
        let cool = color_command(SetDeviceColor::ColorTemperature { mireds: 154 });
        assert_eq!(cool.color_temp, Some(100));
        // Outside the bulbs' range is clamped, not wrapped.
        assert_eq!(color_command(SetDeviceColor::ColorTemperature { mireds: 1000 }).color_temp, Some(0));
    }
}
