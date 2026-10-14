//! Matter bridge: Google Home, Apple Home, Alexa and Home Assistant switch Domus devices over the
//! local network, no cloud account. See development/docs/MATTER.md.
//!
//! The Matter stack (rs-matter) runs on its own executor in a thread of its own; this module keeps
//! it fed. A device changed in Domus is pushed to the bridge, a command from a controller comes back
//! as a Domus command. Changing which devices are shared restarts the bridge; pairings survive.

pub mod bridge;
mod mdns;

use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::database::{get_setting, set_setting};
use crate::infrastructure::event_bus::{Actor, EventBus, SystemEvent};
use crate::integrations::DeviceManager;
use crate::modules::devices::model::DeviceRecord;
use axum::{extract::State, routing::{get, post}, Json, Router};
use home_core::DeviceCommand;
use rand::Rng;
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use tokio::sync::Notify;

const KEY: &str = "matter";

/// What Domus holds of a shared device: its on and online state, and the bridge's wake-up.
type Link = (Arc<AtomicBool>, Arc<AtomicBool>, async_channel::Sender<()>);

#[derive(Debug, Clone, Serialize, Deserialize, Default)]
struct Settings {
    enabled: bool,
    /// Devices shared with Matter controllers.
    devices: Vec<String>,
    /// Each device keeps its endpoint for good, so controllers keep their names and rooms for it.
    endpoints: HashMap<String, u16>,
    passcode: u32,
    discriminator: u16,
    host: String,
}

/// Passcodes the Matter spec forbids: all one digit, and the two counting sequences.
fn valid_passcode(p: u32) -> bool {
    (1..=99_999_998).contains(&p) && ![11111111, 22222222, 33333333, 44444444, 55555555, 66666666, 77777777, 88888888, 12345678, 87654321].contains(&p)
}

impl Settings {
    /// A fresh commissioning secret and host name; done once, and again on a reset.
    fn new_secret(&mut self) {
        let mut rng = rand::thread_rng();
        self.passcode = loop {
            let p = rng.gen_range(1..=99_999_998);
            if valid_passcode(p) {
                break p;
            }
        };
        self.discriminator = rng.gen_range(0..4096);
        self.host = format!("{:012X}", rng.gen::<u64>() & 0xFFFF_FFFF_FFFF);
    }

    fn endpoint(&mut self, device: &str) -> u16 {
        let next = self.endpoints.values().max().map_or(2, |m| m + 1);
        *self.endpoints.entry(device.to_string()).or_insert(next)
    }
}

async fn load(pool: &SqlitePool) -> Settings {
    let mut s: Settings = get_setting(pool, KEY).await.unwrap_or_default();
    if !valid_passcode(s.passcode) {
        s.new_secret();
        let _ = set_setting(pool, KEY, &s).await;
    }
    s
}

/// Devices a controller can switch: anything with an on/off state that is not a sensor.
fn shareable(d: &DeviceRecord) -> bool {
    d.device_type != "sensor" && d.state().is_on.is_some()
}

#[derive(Default)]
struct Status {
    running: bool,
    paired: Arc<AtomicBool>,
    error: Option<String>,
    /// The next start opens a commissioning window even when already paired.
    pairing: bool,
}

static STATUS: LazyLock<Mutex<Status>> = LazyLock::new(Default::default);
static RESTART: LazyLock<Notify> = LazyLock::new(Notify::new);

fn store(data_dir: &Path) -> PathBuf {
    data_dir.join("matter")
}

/// Keeps the bridge running while it is enabled, restarting it when its devices change.
pub async fn run(pool: SqlitePool, manager: Arc<DeviceManager>, bus: EventBus, data_dir: PathBuf) {
    loop {
        let mut settings = load(&pool).await;
        if !settings.enabled {
            STATUS.lock().unwrap().running = false;
            RESTART.notified().await;
            continue;
        }
        let records: Vec<DeviceRecord> = manager
            .repo
            .list_all()
            .await
            .unwrap_or_default()
            .into_iter()
            .filter(|d| settings.devices.contains(&d.id) && shareable(d))
            .collect();
        let before = settings.endpoints.len();
        let endpoints: Vec<u16> = records.iter().map(|d| settings.endpoint(&d.id)).collect();
        if settings.endpoints.len() != before {
            let _ = set_setting(&pool, KEY, &settings).await;
        }

        // What each side holds of a device: its live state, and the wake-up for the bridge.
        let mut links: HashMap<String, Link> = HashMap::new();
        let devices: Vec<bridge::Bridged> = records
            .iter()
            .zip(endpoints)
            .map(|(d, endpoint)| {
                let on = Arc::new(AtomicBool::new(d.state().is_on == Some(true)));
                let online = Arc::new(AtomicBool::new(d.is_online));
                let (tx, rx) = async_channel::bounded(1);
                links.insert(d.id.clone(), (on.clone(), online.clone(), tx));
                bridge::Bridged { endpoint, id: d.id.clone(), name: d.name.clone(), light: d.device_type == "light", on, online, changed: rx }
            })
            .collect();
        let ids: Vec<String> = records.iter().map(|d| d.id.clone()).collect();

        let pairing = std::mem::take(&mut STATUS.lock().unwrap().pairing);
        let setup = bridge::Setup { dir: store(&data_dir), passcode: settings.passcode, discriminator: settings.discriminator, host: settings.host.clone(), pairing };
        let _ = std::fs::create_dir_all(&setup.dir);
        let (stop_tx, stop_rx) = async_channel::bounded(1);
        let paired = Arc::new(AtomicBool::new(false));
        {
            let mut status = STATUS.lock().unwrap();
            status.running = true;
            status.error = None;
            status.paired = paired.clone();
        }
        let tokio = tokio::runtime::Handle::current();
        let commands = manager.clone();
        let thread = std::thread::Builder::new().name("matter".into()).spawn(move || {
            // A controller's command goes back to Domus like any other, named Matter in the logbook.
            let send = move |id: &str, on: bool| {
                let (manager, id) = (commands.clone(), id.to_string());
                tokio.spawn(async move {
                    let command = DeviceCommand { is_on: Some(on), ..Default::default() };
                    if let Err(e) = manager.command(&id, &command, Some(Actor::Matter)).await {
                        tracing::warn!("Matter: switching {id} failed: {e}");
                    }
                });
            };
            bridge::run(&setup, &devices, &send, stop_rx, &paired).map_err(|e| format!("{e:?}"))
        });
        let thread = match thread {
            Ok(t) => t,
            Err(e) => {
                STATUS.lock().unwrap().error = Some(e.to_string());
                RESTART.notified().await;
                continue;
            }
        };
        tracing::info!("Matter bridge started with {} device(s)", ids.len());

        let mut rx = bus.subscribe();
        loop {
            tokio::select! {
                _ = RESTART.notified() => break,
                event = rx.recv() => match event {
                    Ok(SystemEvent::DeviceStateChanged { device_id, state, is_online, .. }) => {
                        if let Some((on, online, tx)) = links.get(&device_id) {
                            on.store(state.is_on == Some(true), Ordering::Relaxed);
                            online.store(is_online, Ordering::Relaxed);
                            let _ = tx.try_send(());
                        }
                    }
                    // A shared device renamed or removed: the controllers get the new list.
                    Ok(SystemEvent::DeviceUpdated { device_id } | SystemEvent::DeviceRemoved { device_id }) if ids.contains(&device_id) => break,
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => return,
                    _ => {}
                },
                _ = tokio::time::sleep(std::time::Duration::from_secs(5)), if thread.is_finished() => break,
            }
        }
        let _ = stop_tx.try_send(());
        let result = tokio::task::spawn_blocking(move || thread.join()).await;
        if let Ok(Ok(Err(e))) = result {
            tracing::warn!("Matter bridge stopped: {e}");
            STATUS.lock().unwrap().error = Some(e);
            // Not straight back into the same failure (a port taken, say).
            tokio::select! {
                _ = RESTART.notified() => {}
                _ = tokio::time::sleep(std::time::Duration::from_secs(60)) => {}
            }
        }
    }
}

pub fn matter_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(get_bridge).put(put_bridge))
        .route("/pairing", post(open_pairing))
        .route("/reset", post(reset))
}

#[derive(Serialize)]
struct BridgeDto {
    enabled: bool,
    running: bool,
    /// At least one controller has paired with the bridge.
    paired: bool,
    error: Option<String>,
    devices: Vec<String>,
    /// Typed into a controller instead of scanning.
    pairing_code: String,
    /// The QR's "MT:" payload, and its modules row by row ('1' = dark).
    qr_payload: String,
    qr: Vec<String>,
}

async fn dto(pool: &SqlitePool, data_dir: &Path) -> ApiResult<BridgeDto> {
    let s = load(pool).await;
    let setup = bridge::Setup { dir: store(data_dir), passcode: s.passcode, discriminator: s.discriminator, host: s.host.clone(), pairing: false };
    let (qr_payload, qr) = bridge::pairing_qr(&setup).map_err(|e| ApiError::Internal(format!("{e:?}")))?;
    let status = STATUS.lock().unwrap();
    Ok(BridgeDto {
        enabled: s.enabled,
        running: status.running,
        paired: status.paired.load(Ordering::Relaxed),
        error: status.error.clone(),
        devices: s.devices,
        pairing_code: bridge::pairing_code(&setup),
        qr_payload,
        qr,
    })
}

async fn get_bridge(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<BridgeDto>> {
    user.require_admin()?;
    Ok(Json(dto(&s.pool, &s.server.data_dir).await?))
}

#[derive(Deserialize)]
struct BridgeRequest {
    enabled: bool,
    devices: Vec<String>,
}

async fn put_bridge(State(s): State<AppState>, user: AuthUser, Json(req): Json<BridgeRequest>) -> ApiResult<Json<BridgeDto>> {
    user.require_admin()?;
    let mut settings = load(&s.pool).await;
    settings.enabled = req.enabled;
    settings.devices = req.devices;
    set_setting(&s.pool, KEY, &settings).await?;
    RESTART.notify_one();
    Ok(Json(dto(&s.pool, &s.server.data_dir).await?))
}

/// Open pairing again for 15 minutes, to add the bridge to another ecosystem.
async fn open_pairing(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<BridgeDto>> {
    user.require_admin()?;
    STATUS.lock().unwrap().pairing = true;
    RESTART.notify_one();
    Ok(Json(dto(&s.pool, &s.server.data_dir).await?))
}

/// Forget every pairing and take a new pairing code.
async fn reset(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<BridgeDto>> {
    user.require_admin()?;
    let mut settings = load(&s.pool).await;
    settings.new_secret();
    set_setting(&s.pool, KEY, &settings).await?;
    STATUS.lock().unwrap().pairing = true;
    // The thread lets go of the store when it stops; give it a moment before deleting.
    RESTART.notify_one();
    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    let _ = tokio::fs::remove_dir_all(store(&s.server.data_dir)).await;
    RESTART.notify_one();
    Ok(Json(dto(&s.pool, &s.server.data_dir).await?))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn secrets_follow_the_spec() {
        assert!(!valid_passcode(0) && !valid_passcode(12345678) && !valid_passcode(99_999_999));
        let mut s = Settings::default();
        s.new_secret();
        assert!(valid_passcode(s.passcode) && s.discriminator < 4096 && s.host.len() == 12);
        assert_eq!((s.endpoint("a"), s.endpoint("b"), s.endpoint("a")), (2, 3, 2));
    }
}
