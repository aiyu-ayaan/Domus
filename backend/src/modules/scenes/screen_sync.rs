//! Screen Sync: a scene kind that mirrors the colour of a shared screen onto lights.
//!
//! Screen capture can only happen in the user's browser / Electron window, so the
//! client samples its shared screen, extracts a colour and streams it here over a
//! WebSocket (`GET /scenes/:id/sync`). This side fans each frame out to the target
//! lights as fast as each one can take it:
//!
//! * every light has its own worker fed through a `watch` channel, so a slow device
//!   only ever receives the *latest* colour (no queue build-up, no lag);
//! * each worker is paced by its transport (local LAN ~7 Hz, cloud ~1 Hz);
//! * frames that are visually identical to the last one sent are dropped;
//! * plugins are resolved once per session, so a frame is a single plugin call.
//!
//! When the stream ends the lights are restored to their previous state, or the
//! final colour is written back to the database so the rest of the UI catches up.

use super::ScreenSyncConfig;
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::Actor;
use crate::integrations::manager::StreamTarget;
use crate::modules::devices::service::{access, can_control, Access};
use axum::{
    extract::{ws::Message, ws::WebSocket, Path, State, WebSocketUpgrade},
    response::{IntoResponse, Response},
};
use home_core::{hex_to_rgb, rgb_to_hex, DeviceCommand, DeviceState};
use serde::Deserialize;
use serde_json::json;
use std::collections::{HashMap, HashSet};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, LazyLock, Mutex};
use std::time::{Duration, Instant};
use tokio::sync::{mpsc, watch, Notify};

/// Minimum gap between two commands to the same light.
const LOCAL_INTERVAL: Duration = Duration::from_millis(150);
const CLOUD_INTERVAL: Duration = Duration::from_millis(1200);
/// A device command that takes longer than this is abandoned (the next frame retries).
const SEND_TIMEOUT: Duration = Duration::from_secs(3);
/// The client sends a keep-alive at least every few seconds; silence means it is gone.
const IDLE_TIMEOUT: Duration = Duration::from_secs(45);

/// One live session per scene. A new session (another tab, a reconnect) replaces
/// the old one; stopping the scene from anywhere ends it.
struct Session {
    id: u64,
    stop: Arc<Notify>,
}

static SESSIONS: LazyLock<Mutex<HashMap<String, Session>>> = LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_SESSION: AtomicU64 = AtomicU64::new(1);

/// Ask the live session of a scene (if any) to stop. Returns whether one was running.
pub fn stop_session(scene_id: &str) -> bool {
    match SESSIONS.lock().unwrap().remove(scene_id) {
        Some(s) => {
            s.stop.notify_one();
            true
        }
        None => false,
    }
}

pub fn is_running(scene_id: &str) -> bool {
    SESSIONS.lock().unwrap().contains_key(scene_id)
}

fn register(scene_id: &str) -> (u64, Arc<Notify>) {
    let id = NEXT_SESSION.fetch_add(1, Ordering::Relaxed);
    let stop = Arc::new(Notify::new());
    if let Some(old) = SESSIONS.lock().unwrap().insert(scene_id.to_string(), Session { id, stop: stop.clone() }) {
        old.stop.notify_one();
    }
    (id, stop)
}

fn unregister(scene_id: &str, session: u64) {
    let mut map = SESSIONS.lock().unwrap();
    if map.get(scene_id).is_some_and(|s| s.id == session) {
        map.remove(scene_id);
    }
}

/// A colour sample from the client.
#[derive(Debug, Clone, Copy, PartialEq)]
struct Frame {
    rgb: (u8, u8, u8),
    brightness: Option<u8>,
}

impl Frame {
    /// Frames that differ by less than this are invisible on a bulb; skip them.
    fn close_to(&self, other: &Frame) -> bool {
        let d = |a: u8, b: u8| (a as i32 - b as i32).abs();
        let colour = d(self.rgb.0, other.rgb.0) + d(self.rgb.1, other.rgb.1) + d(self.rgb.2, other.rgb.2);
        let bright = match (self.brightness, other.brightness) {
            (Some(a), Some(b)) => d(a, b),
            (None, None) => 0,
            _ => 100,
        };
        colour <= 6 && bright <= 2
    }

    fn command(&self) -> DeviceCommand {
        DeviceCommand {
            color: Some(rgb_to_hex(self.rgb.0, self.rgb.1, self.rgb.2)),
            color_mode: Some("color".into()),
            brightness: self.brightness.map(|b| b.clamp(1, 100)),
            ..Default::default()
        }
    }
}

#[derive(Deserialize)]
struct FrameMessage {
    /// `#rrggbb`
    c: String,
    /// Brightness 1-100; absent when the scene keeps the light's own brightness.
    b: Option<u8>,
}

pub async fn sync_ws(
    State(s): State<AppState>,
    user: AuthUser,
    Path(scene_id): Path<String>,
    ws: WebSocketUpgrade,
) -> Response {
    if let Err(e) = user.require_control() {
        return e.into_response();
    }
    if let Err(e) = super::ensure_runnable(&s, &user, &scene_id).await {
        return e.into_response();
    }
    ws.on_upgrade(move |socket| run_session(socket, s, user, scene_id))
}

async fn send_json(socket: &mut WebSocket, value: serde_json::Value) -> bool {
    socket.send(Message::Text(value.to_string())).await.is_ok()
}

async fn fail(mut socket: WebSocket, message: &str) {
    let _ = send_json(&mut socket, json!({ "type": "error", "message": message })).await;
    let _ = socket.close().await;
}

/// Resolve the scene's lights the user may control. Returns (targets, skipped with reasons).
async fn resolve_targets(
    s: &AppState,
    user: &AuthUser,
    cfg: &ScreenSyncConfig,
) -> (Vec<StreamTarget>, Vec<(String, String, &'static str)>) {
    let mut ids: Vec<String> = Vec::new();
    let mut seen = HashSet::new();
    for id in &cfg.device_ids {
        if seen.insert(id.clone()) {
            ids.push(id.clone());
        }
    }
    for g in &cfg.group_ids {
        for id in s.manager.group_device_ids(g).await.unwrap_or_default() {
            if seen.insert(id.clone()) {
                ids.push(id);
            }
        }
    }
    let rooms = access(s, user).await.unwrap_or(Some(Access::default()));
    let mut targets = Vec::new();
    let mut skipped = Vec::new();
    for id in ids {
        let Ok(t) = s.manager.stream_target(&id).await else { continue };
        if !can_control(&rooms, user, &t.record) {
            continue;
        }
        if t.record.device_type != "light" {
            skipped.push((t.record.id.clone(), t.record.name.clone(), "not a colour light"));
        } else if !t.record.is_online {
            skipped.push((t.record.id.clone(), t.record.name.clone(), "offline"));
        } else {
            targets.push(t);
        }
    }
    (targets, skipped)
}

async fn run_session(mut socket: WebSocket, s: AppState, user: AuthUser, scene_id: String) {
    let Some(cfg) = super::screen_sync_config(&s, &scene_id).await else {
        return fail(socket, "This scene is not a Screen Sync scene").await;
    };
    let (targets, skipped) = resolve_targets(&s, &user, &cfg).await;
    if targets.is_empty() {
        return fail(socket, "None of this scene's lights are online and available to you").await;
    }

    let (session, stop) = register(&scene_id);
    let _ = sqlx::query("UPDATE scenes SET is_active = 1 WHERE id = ?").bind(&scene_id).execute(&s.pool).await;

    // Snapshot for restoring afterwards.
    let snapshots: Vec<(String, DeviceState)> = targets.iter().map(|t| (t.record.id.clone(), t.record.state())).collect();

    let (frame_tx, frame_rx) = watch::channel::<Option<Frame>>(None);
    let (err_tx, mut err_rx) = mpsc::channel::<(String, String)>(32);
    let ready_devices: Vec<_> = targets
        .iter()
        .map(|t| {
            json!({
                "id": t.record.id,
                "name": t.record.name,
                "interval_ms": interval_for(t).as_millis() as u64,
            })
        })
        .collect();
    let workers: Vec<_> = targets
        .into_iter()
        .map(|t| tokio::spawn(device_worker(t, frame_rx.clone(), err_tx.clone())))
        .collect();
    drop(frame_rx);
    drop(err_tx);

    let ready = json!({
        "type": "ready",
        "devices": ready_devices,
        "skipped": skipped.iter().map(|(id, name, reason)| json!({ "id": id, "name": name, "reason": reason })).collect::<Vec<_>>(),
    });
    let mut open = send_json(&mut socket, ready).await;
    let mut last_msg = Instant::now();
    let mut idle = tokio::time::interval(Duration::from_secs(5));

    while open {
        tokio::select! {
            _ = stop.notified() => {
                let _ = send_json(&mut socket, json!({ "type": "stopped" })).await;
                break;
            }
            Some((device_id, message)) = err_rx.recv() => {
                open = send_json(&mut socket, json!({ "type": "device_error", "device_id": device_id, "message": message })).await;
            }
            _ = idle.tick() => {
                if last_msg.elapsed() > IDLE_TIMEOUT { break; }
            }
            msg = socket.recv() => match msg {
                Some(Ok(Message::Text(text))) => {
                    last_msg = Instant::now();
                    if let Some(frame) = parse_frame(&text) {
                        frame_tx.send_replace(Some(frame));
                    }
                }
                Some(Ok(Message::Ping(p))) => { last_msg = Instant::now(); let _ = socket.send(Message::Pong(p)).await; }
                Some(Ok(Message::Close(_))) | None | Some(Err(_)) => break,
                _ => { last_msg = Instant::now(); }
            }
        }
    }
    let _ = socket.close().await;

    // Closing the channel ends every worker; each returns the last frame it applied.
    drop(frame_tx);
    let mut finals: HashMap<String, Frame> = HashMap::new();
    for w in workers {
        if let Ok((id, Some(frame))) = w.await {
            finals.insert(id, frame);
        }
    }

    unregister(&scene_id, session);
    let still_running = is_running(&scene_id);
    if !still_running {
        let _ = sqlx::query("UPDATE scenes SET is_active = 0 WHERE id = ?").bind(&scene_id).execute(&s.pool).await;
    }

    // A replacing session takes over the lights; otherwise put them back.
    if still_running {
        return;
    }
    for (id, before) in snapshots {
        if cfg.restore_on_stop {
            restore(&s, &id, &before).await;
        } else if let Some(frame) = finals.get(&id) {
            let mut cmd = frame.command();
            cmd.is_on = Some(true);
            if let Ok(rec) = s.manager.get(&id).await {
                let _ = s.manager.record_command(&rec, &cmd, Some(Actor::ScreenSync)).await;
            }
        }
    }
}

fn parse_frame(text: &str) -> Option<Frame> {
    let m: FrameMessage = serde_json::from_str(text).ok()?;
    Some(Frame {
        rgb: hex_to_rgb(&m.c)?,
        brightness: m.b.map(|b| b.clamp(1, 100)),
    })
}

fn interval_for(t: &StreamTarget) -> Duration {
    if t.is_cloud() {
        CLOUD_INTERVAL
    } else {
        LOCAL_INTERVAL
    }
}

/// Push the newest frame to one light, never faster than its transport allows.
async fn device_worker(
    target: StreamTarget,
    mut rx: watch::Receiver<Option<Frame>>,
    errors: mpsc::Sender<(String, String)>,
) -> (String, Option<Frame>) {
    let interval = interval_for(&target);
    let id = target.record.id.clone();
    let mut last: Option<Frame> = None;
    let mut powered = target.record.state().is_on == Some(true);
    let mut failures: u32 = 0;

    while rx.changed().await.is_ok() {
        let Some(frame) = *rx.borrow_and_update() else { continue };
        if last.is_some_and(|l| l.close_to(&frame)) {
            continue;
        }
        let started = Instant::now();
        let mut cmd = frame.command();
        if !powered {
            cmd.is_on = Some(true);
        }
        let result = match tokio::time::timeout(SEND_TIMEOUT, target.send(&cmd)).await {
            Ok(r) => r.map_err(|e| e.to_string()),
            Err(_) => Err("the light did not answer in time".to_string()),
        };
        match result {
            Ok(()) => {
                last = Some(frame);
                powered = true;
                failures = 0;
            }
            Err(e) => {
                failures += 1;
                // Report the first failure and then only occasionally, not every frame.
                if failures == 1 || failures % 25 == 0 {
                    let _ = errors.try_send((id.clone(), e));
                }
            }
        }
        // Back off harder while a light keeps failing so it can recover.
        let pace = if failures >= 3 { interval * 4 } else { interval };
        if let Some(rest) = pace.checked_sub(started.elapsed()) {
            tokio::time::sleep(rest).await;
        }
    }
    (id, last)
}

/// Put a light back the way it was before syncing started.
async fn restore(s: &AppState, device_id: &str, before: &DeviceState) {
    let mut cmd = DeviceCommand {
        brightness: before.brightness,
        ..Default::default()
    };
    if before.color_mode.as_deref() == Some("color") && before.color.is_some() {
        cmd.color = before.color.clone();
        cmd.color_mode = Some("color".into());
    } else if let Some(t) = before.color_temp {
        cmd.color_temp = Some(t);
        cmd.color_mode = Some("white".into());
    }
    let was_on = before.is_on != Some(false);
    if was_on {
        cmd.is_on = Some(true);
    }
    if !cmd.is_empty() {
        if let Err(e) = s.manager.command(device_id, &cmd, Some(Actor::ScreenSync)).await {
            tracing::debug!("screen sync: restoring {device_id} failed: {e}");
        }
    }
    if !was_on {
        let off = DeviceCommand { is_on: Some(false), ..Default::default() };
        if let Err(e) = s.manager.command(device_id, &off, Some(Actor::ScreenSync)).await {
            tracing::debug!("screen sync: switching {device_id} off failed: {e}");
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_frames() {
        let f = parse_frame(r##"{"c":"#ff8800","b":120}"##).unwrap();
        assert_eq!(f.rgb, (255, 136, 0));
        assert_eq!(f.brightness, Some(100));
        assert!(parse_frame(r#"{"c":"nope"}"#).is_none());
        assert_eq!(parse_frame(r##"{"c":"#000000"}"##).unwrap().brightness, None);
    }

    #[test]
    fn drops_invisible_changes() {
        let a = Frame { rgb: (200, 100, 50), brightness: Some(50) };
        assert!(a.close_to(&Frame { rgb: (202, 101, 52), brightness: Some(51) }));
        assert!(!a.close_to(&Frame { rgb: (220, 100, 50), brightness: Some(50) }));
        assert!(!a.close_to(&Frame { rgb: (200, 100, 50), brightness: Some(60) }));
    }

    #[test]
    fn frame_command_is_colour_mode() {
        let cmd = Frame { rgb: (0, 255, 0), brightness: Some(0) }.command();
        assert_eq!(cmd.color.as_deref(), Some("#00ff00"));
        assert_eq!(cmd.color_mode.as_deref(), Some("color"));
        assert_eq!(cmd.brightness, Some(1));
    }
}
