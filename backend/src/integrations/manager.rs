//! The device manager owns every integration plugin and is the only place that
//! talks to them: discovery, adoption, polling, commands and energy sampling.

use super::accounts::AccountStore;
use super::sampling::Window;
use crate::api::error::ApiError;
use crate::infrastructure::crypto::Vault;
use crate::infrastructure::database::{get_setting, set_setting};
use crate::infrastructure::event_bus::{Actor, EventBus, SystemEvent};
use crate::modules::devices::model::{AdoptRequest, DeviceRecord, DiscoveryRecord, ManualAddRequest};
use crate::modules::devices::repository::DeviceRepository;
use crate::modules::notifications::Notifier;
use crate::modules::energy::{catch_up_rows, local_midnight, FILL_PREFIX};
use chrono::{DateTime, Local, Utc};
use futures::future::join_all;
use home_core::{
    AccountContext, CoreError, DeviceCommand, DeviceContext, DeviceType, DiscoveredDevice,
    IntegrationPlugin, IntegrationType, PolledState,
};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::Mutex;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(default)]
pub struct DiscoverySettings {
    /// Scan the network and linked accounts in the background.
    pub enabled: bool,
    pub interval_minutes: u64,
    /// Add newly found devices without asking.
    pub auto_adopt: bool,
    /// Send a notification when a new device is found.
    pub notify: bool,
}

impl Default for DiscoverySettings {
    fn default() -> Self {
        Self {
            enabled: true,
            interval_minutes: 5,
            auto_adopt: false,
            notify: true,
        }
    }
}

const SETTINGS_KEY: &str = "discovery";
/// Consecutive poll failures before a device is marked offline.
/// Consecutive failed polls before a device is marked offline (~15 s at the local cadence).
const OFFLINE_AFTER: u32 = 5;

#[derive(Debug, Clone, Serialize, Default)]
pub struct DiscoveryReport {
    pub found: usize,
    pub new: usize,
    pub adopted: usize,
    pub errors: Vec<IntegrationIssue>,
}

#[derive(Debug, Clone, Serialize)]
pub struct IntegrationIssue {
    pub integration: String,
    pub message: String,
}

pub struct DeviceManager {
    pool: SqlitePool,
    pub repo: DeviceRepository,
    pub accounts: AccountStore,
    vault: Vault,
    bus: EventBus,
    notifier: Notifier,
    plugins: HashMap<IntegrationType, Arc<dyn IntegrationPlugin>>,
    discovery_lock: Mutex<()>,
    poll_lock: Mutex<()>,
    energy_sample: Duration,
    /// Readings of each device since its last stored sample.
    windows: Mutex<HashMap<String, Window>>,
    failures: Mutex<HashMap<String, u32>>,
}

impl DeviceManager {
    #[allow(clippy::too_many_arguments)]
    pub fn new(
        pool: SqlitePool,
        accounts: AccountStore,
        vault: Vault,
        bus: EventBus,
        notifier: Notifier,
        plugins: Vec<Arc<dyn IntegrationPlugin>>,
        energy_sample: Duration,
    ) -> Self {
        Self {
            repo: DeviceRepository::new(pool.clone()),
            pool,
            accounts,
            vault,
            bus,
            notifier,
            plugins: plugins.into_iter().map(|p| (p.integration_type(), p)).collect(),
            discovery_lock: Mutex::new(()),
            poll_lock: Mutex::new(()),
            energy_sample,
            windows: Mutex::new(HashMap::new()),
            failures: Mutex::new(HashMap::new()),
        }
    }

    pub fn enabled_integrations(&self) -> Vec<IntegrationType> {
        self.plugins.keys().copied().collect()
    }

    fn plugin(&self, integration: &str) -> Result<&Arc<dyn IntegrationPlugin>, ApiError> {
        IntegrationType::parse(integration)
            .and_then(|t| self.plugins.get(&t))
            .ok_or_else(|| ApiError::BadRequest(format!("integration '{integration}' is not enabled")))
    }

    pub async fn settings(&self) -> DiscoverySettings {
        get_setting(&self.pool, SETTINGS_KEY).await.unwrap_or_default()
    }

    pub async fn save_settings(&self, s: &DiscoverySettings) -> Result<(), ApiError> {
        set_setting(&self.pool, SETTINGS_KEY, s).await?;
        Ok(())
    }

    fn open_secrets(&self, sealed: Option<&str>) -> Value {
        sealed
            .and_then(|s| self.vault.open_json(s).ok())
            .unwrap_or_else(|| json!({}))
    }

    fn seal_secrets(&self, secrets: &Value) -> Result<Option<String>, ApiError> {
        match secrets {
            Value::Object(m) if !m.is_empty() => Ok(Some(self.vault.seal_json(secrets)?)),
            _ => Ok(None),
        }
    }

    fn context(&self, rec: &DeviceRecord, accounts: &HashMap<String, AccountContext>) -> DeviceContext {
        DeviceContext {
            device_id: rec.id.clone(),
            external_id: rec.external_id.clone().unwrap_or_default(),
            device_type: DeviceType::parse(&rec.device_type),
            model: rec.model.clone(),
            ip_address: rec.ip_address.clone(),
            config: rec.config(),
            secrets: self.open_secrets(rec.secrets_enc.as_deref()),
            account: rec.account_id.as_ref().and_then(|id| accounts.get(id).cloned()),
            state: rec.state(),
        }
    }

    async fn account_map(&self, integration: &str) -> HashMap<String, AccountContext> {
        self.accounts
            .contexts(integration)
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|a| (a.id.clone(), a))
            .collect()
    }

    // ------------------------------------------------------------------
    // Polling
    // ------------------------------------------------------------------

    /// Poll every adopted device; `include_cloud` also polls cloud integrations (Tuya).
    pub async fn poll_all(&self, include_cloud: bool) {
        let Ok(_guard) = self.poll_lock.try_lock() else { return };
        let devices = match self.repo.list_all().await {
            Ok(d) => d,
            Err(e) => {
                tracing::error!("poll: cannot list devices: {e}");
                return;
            }
        };
        let mut by_type: HashMap<String, Vec<DeviceRecord>> = HashMap::new();
        for d in devices {
            if !include_cloud && d.integration_type == IntegrationType::Tuya.as_str() {
                continue;
            }
            by_type.entry(d.integration_type.clone()).or_default().push(d);
        }
        join_all(by_type.into_iter().map(|(t, recs)| self.poll_group(t, recs))).await;
        self.store_samples().await;
    }

    async fn poll_group(&self, integration: String, recs: Vec<DeviceRecord>) {
        let Ok(plugin) = self.plugin(&integration) else { return };
        let accounts = self.account_map(&integration).await;
        let contexts: Vec<DeviceContext> = recs.iter().map(|r| self.context(r, &accounts)).collect();
        let mut results = plugin.fetch_states(&contexts).await;
        for rec in recs {
            let res = results
                .remove(&rec.id)
                .unwrap_or_else(|| Err(CoreError::Internal("no poll result".into())));
            self.apply_poll(&rec, res).await;
        }
    }

    async fn apply_poll(&self, rec: &DeviceRecord, res: home_core::Result<PolledState>) {
        match res {
            Ok(p) => {
                self.failures.lock().await.remove(&rec.id);
                let previous = rec.state();
                let changed = p.state != previous || p.online != rec.is_online;
                let stale_seen = rec
                    .last_seen
                    .is_none_or(|t| (Utc::now() - t).num_seconds() >= 60);
                let ip_changed = p.ip_address.is_some() && p.ip_address != rec.ip_address;
                if changed || stale_seen || ip_changed {
                    let json = serde_json::to_string(&p.state).unwrap_or_else(|_| "{}".into());
                    if let Err(e) = self
                        .repo
                        .update_runtime(&rec.id, &json, p.online, p.ip_address.as_deref(), true)
                        .await
                    {
                        tracing::warn!("poll: cannot store state for {}: {e}", rec.id);
                    }
                }
                if changed {
                    self.bus.publish(SystemEvent::DeviceStateChanged {
                        device_id: rec.id.clone(),
                        state: p.state.clone(),
                        is_online: p.online,
                        previous: Some(previous),
                        was_online: rec.is_online,
                        actor: None,
                    });
                }
                let (watts, pm) = (p.state.current_power_watts, p.state.air_quality_pm25);
                if p.online && (watts.is_some() || pm.is_some()) {
                    let now = Instant::now();
                    let mut windows = self.windows.lock().await;
                    let w = windows.entry(rec.id.clone()).or_insert_with(|| Window::new(now));
                    if let Some(watts) = watts {
                        w.power(now, watts as f64, p.state.today_energy_kwh.map(f64::from), self.energy_sample);
                    }
                    if let Some(pm) = pm {
                        w.air(pm, p.state.temperature, p.state.humidity);
                    }
                }
            }
            Err(e) => {
                let count = {
                    let mut f = self.failures.lock().await;
                    let c = f.entry(rec.id.clone()).or_insert(0);
                    *c += 1;
                    *c
                };
                if count == OFFLINE_AFTER && rec.is_online {
                    tracing::warn!("device '{}' is offline: {e}", rec.name);
                    let _ = self
                        .repo
                        .update_runtime(&rec.id, &rec.state_json, false, None, false)
                        .await;
                    self.bus.publish(SystemEvent::DeviceStateChanged {
                        device_id: rec.id.clone(),
                        state: rec.state(),
                        is_online: false,
                        previous: Some(rec.state()),
                        was_online: true,
                        actor: None,
                    });
                } else {
                    tracing::debug!("poll of '{}' failed ({count}): {e}", rec.name);
                }
            }
        }
    }

    /// Write one row per device whose window is a sample interval old: the average and the peak of
    /// every poll in it, and the energy those polls add up to.
    async fn store_samples(&self) {
        let now = Instant::now();
        let done: Vec<(String, Window)> = {
            let mut windows = self.windows.lock().await;
            let due: Vec<String> = windows
                .iter()
                .filter(|(_, w)| now.duration_since(w.started) >= self.energy_sample)
                .map(|(id, _)| id.clone())
                .collect();
            let mut done = Vec::new();
            for id in due {
                // A window nothing was read into belongs to a silent or removed device.
                match windows.get_mut(&id).and_then(|w| w.take(now)) {
                    Some(w) => done.push((id, w)),
                    None => drop(windows.remove(&id)),
                }
            }
            done
        };
        for (device_id, w) in done {
            if let Some(watts) = w.watts.mean() {
                if let Some(meter) = w.meter_today {
                    self.catch_up(&device_id, meter - w.kwh).await;
                }
                let res = sqlx::query(
                    "INSERT INTO energy_metrics (id, device_id, power_watts, peak_watts, energy_kwh, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                )
                .bind(Uuid::new_v4().to_string())
                .bind(&device_id)
                .bind(watts)
                .bind(w.watts.max())
                .bind(w.kwh)
                .bind(Utc::now())
                .execute(&self.pool)
                .await;
                if let Err(e) = res {
                    tracing::warn!("energy sample failed: {e}");
                }
            }
            if let Some(pm25) = w.pm25.mean() {
                let res = sqlx::query(
                    "INSERT INTO air_metrics (device_id, pm25, pm25_max, temperature, humidity, recorded_at) VALUES (?, ?, ?, ?, ?, ?)",
                )
                .bind(&device_id)
                .bind(pm25)
                .bind(w.pm25.max())
                .bind(w.temperature.mean())
                .bind(w.humidity.mean())
                .bind(Utc::now())
                .execute(&self.pool)
                .await;
                if let Err(e) = res {
                    tracing::warn!("air sample failed: {e}");
                }
            }
        }
    }

    /// Samples only cover the time the server was polling. When the device's own meter says more was
    /// used today than the samples add up to, store the difference over the unwatched time.
    async fn catch_up(&self, device_id: &str, meter_today: f64) {
        let now = Local::now();
        let midnight = local_midnight(now.date_naive());
        let sampled: Result<Vec<(DateTime<Utc>, f64)>, _> =
            sqlx::query_as("SELECT recorded_at, energy_kwh FROM energy_metrics WHERE device_id = ? AND recorded_at >= ?")
                .bind(device_id)
                .bind(midnight.with_timezone(&Utc))
                .fetch_all(&self.pool)
                .await;
        let Ok(sampled) = sampled else { return };
        let recorded: f64 = sampled.iter().map(|r| r.1).sum();
        let times: Vec<DateTime<Local>> = sampled.iter().map(|r| r.0.with_timezone(&Local)).collect();
        for (at, kwh) in catch_up_rows(meter_today - recorded, &times, now, midnight) {
            let res = sqlx::query("INSERT INTO energy_metrics (id, device_id, power_watts, energy_kwh, recorded_at) VALUES (?, ?, 0, ?, ?)")
                .bind(format!("{FILL_PREFIX}{}", Uuid::new_v4()))
                .bind(device_id)
                .bind(kwh)
                .bind(at.with_timezone(&Utc))
                .execute(&self.pool)
                .await;
            if let Err(e) = res {
                tracing::warn!("energy catch-up failed: {e}");
            }
        }
    }

    pub async fn refresh(&self, device_id: &str) -> Result<(), ApiError> {
        let rec = self.get(device_id).await?;
        let plugin = self.plugin(&rec.integration_type)?;
        let accounts = self.account_map(&rec.integration_type).await;
        let res = plugin.fetch_state(&self.context(&rec, &accounts)).await;
        self.apply_poll(&rec, res).await;
        Ok(())
    }

    // ------------------------------------------------------------------
    // Commands
    // ------------------------------------------------------------------

    pub async fn get(&self, device_id: &str) -> Result<DeviceRecord, ApiError> {
        self.repo
            .find_by_id(device_id)
            .await?
            .ok_or_else(|| ApiError::NotFound("Device not found".into()))
    }

    pub async fn command(self: &Arc<Self>, device_id: &str, cmd: &DeviceCommand, actor: Option<Actor>) -> Result<(), ApiError> {
        if cmd.is_empty() {
            return Err(ApiError::BadRequest("empty command".into()));
        }
        let rec = self.get(device_id).await?;
        let mut cmd = cmd.resolved();
        // Brightness on its own while an effect plays means "this effect, brighter or dimmer".
        // Sent bare, a bulb drops the effect and falls back to white light.
        if cmd.brightness.is_some() && cmd.effect.is_none() && cmd.color.is_none() && cmd.color_temp.is_none() && cmd.color_mode.is_none() && cmd.is_on != Some(false) {
            cmd.effect = rec.state().effect;
        }
        let cmd = &cmd;
        let plugin = self.plugin(&rec.integration_type)?;
        let accounts = self.account_map(&rec.integration_type).await;
        plugin.send_command(&self.context(&rec, &accounts), cmd).await?;

        // Optimistic update so the UI reacts instantly; a refresh follows.
        self.record_command(&rec, cmd, actor).await?;

        let this = self.clone();
        let id = rec.id.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(1500)).await;
            let _ = this.refresh(&id).await;
        });
        Ok(())
    }

    /// Apply an already-sent command to the cached state, store it and tell the UI.
    pub async fn record_command(&self, rec: &DeviceRecord, cmd: &DeviceCommand, actor: Option<Actor>) -> Result<(), ApiError> {
        let previous = rec.state();
        let mut state = previous.clone();
        cmd.apply_to(&mut state);
        let json = serde_json::to_string(&state).unwrap_or_else(|_| "{}".into());
        self.repo.update_runtime(&rec.id, &json, true, None, true).await?;
        self.bus.publish(SystemEvent::DeviceStateChanged {
            device_id: rec.id.clone(),
            state,
            is_online: true,
            previous: Some(previous),
            was_online: rec.is_online,
            actor,
        });
        Ok(())
    }

    /// Resolve a device once for high-rate streaming (Screen Sync). The returned
    /// target talks to the plugin directly: no database round-trip per frame.
    pub async fn stream_target(&self, device_id: &str) -> Result<StreamTarget, ApiError> {
        let record = self.get(device_id).await?;
        let plugin = self.plugin(&record.integration_type)?.clone();
        let accounts = self.account_map(&record.integration_type).await;
        let context = self.context(&record, &accounts);
        Ok(StreamTarget { record, plugin, context })
    }
}

/// A device resolved for streaming commands; see [`DeviceManager::stream_target`].
pub struct StreamTarget {
    pub record: DeviceRecord,
    pub plugin: Arc<dyn IntegrationPlugin>,
    pub context: DeviceContext,
}

impl StreamTarget {
    /// Cloud integrations are rate-limited and slow; local ones can take several updates a second.
    pub fn is_cloud(&self) -> bool {
        self.record.integration_type == IntegrationType::Tuya.as_str()
    }

    pub async fn send(&self, cmd: &DeviceCommand) -> Result<(), CoreError> {
        self.plugin.send_command(&self.context, cmd).await
    }
}

impl DeviceManager {
    pub async fn group_device_ids(&self, group_id: &str) -> Result<Vec<String>, ApiError> {
        let rows: Vec<(String,)> = sqlx::query_as("SELECT device_id FROM device_group_members WHERE group_id = ?")
            .bind(group_id)
            .fetch_all(&self.pool)
            .await?;
        Ok(rows.into_iter().map(|r| r.0).collect())
    }

    /// Run a command on several devices concurrently; returns per-device errors.
    pub async fn command_many(self: &Arc<Self>, ids: &[String], cmd: &DeviceCommand, actor: Option<Actor>) -> Vec<(String, String)> {
        let results = join_all(ids.iter().map(|id| {
            let actor = actor.clone();
            async move { (id.clone(), self.command(id, cmd, actor).await) }
        }))
        .await;
        results
            .into_iter()
            .filter_map(|(id, r)| r.err().map(|e| (id, e.to_string())))
            .collect()
    }

    // ------------------------------------------------------------------
    // Discovery
    // ------------------------------------------------------------------

    pub async fn discover(self: &Arc<Self>) -> Result<DiscoveryReport, ApiError> {
        let Ok(_guard) = self.discovery_lock.try_lock() else {
            return Err(ApiError::Conflict("A scan is already running".into()));
        };
        let settings = self.settings().await;
        let runs = self.plugins.iter().map(|(t, plugin)| async move {
            let accounts = self.accounts.contexts(t.as_str()).await.unwrap_or_default();
            (*t, accounts.clone(), plugin.discover(&accounts).await)
        });

        let mut report = DiscoveryReport::default();
        for (t, accounts, result) in join_all(runs).await {
            match result {
                Ok(list) => {
                    for a in &accounts {
                        self.accounts.set_status(&a.id, None).await;
                    }
                    for d in list {
                        report.found += 1;
                        match self.ingest(t, d, &settings).await {
                            Ok(Ingest::New) => report.new += 1,
                            Ok(Ingest::Adopted) => {
                                report.new += 1;
                                report.adopted += 1;
                            }
                            Ok(Ingest::Known) => {}
                            Err(e) => report.errors.push(IntegrationIssue {
                                integration: t.as_str().into(),
                                message: e.to_string(),
                            }),
                        }
                    }
                }
                Err(e) => {
                    let msg = e.to_string();
                    tracing::warn!("{} discovery failed: {msg}", t.as_str());
                    for a in &accounts {
                        self.accounts.set_status(&a.id, Some(&msg)).await;
                    }
                    report.errors.push(IntegrationIssue {
                        integration: t.as_str().into(),
                        message: msg,
                    });
                }
            }
        }
        self.bus.publish(SystemEvent::DiscoveryFinished {
            found: report.found,
            new: report.new,
        });
        Ok(report)
    }

    async fn ingest(
        self: &Arc<Self>,
        t: IntegrationType,
        d: DiscoveredDevice,
        settings: &DiscoverySettings,
    ) -> Result<Ingest, ApiError> {
        let integration = t.as_str();
        if d.external_id.is_empty() {
            return Ok(Ingest::Known);
        }

        // Already adopted: keep connection details (IP, keys) fresh.
        if let Some(existing) = self.repo.find_by_external(integration, &d.external_id).await? {
            let config = match &d.config {
                Value::Object(m) if !m.is_empty() => d.config.to_string(),
                _ => existing.config_json.clone(),
            };
            self.repo
                .update_connection(
                    &existing.id,
                    d.ip_address.as_deref(),
                    &config,
                    self.seal_secrets(&d.secrets)?.as_deref(),
                    d.account_id.as_deref(),
                )
                .await?;
            return Ok(Ingest::Known);
        }

        let previous = self.repo.discovery_by_external(integration, &d.external_id).await?;
        let now = Utc::now();
        let status = match previous.as_ref().map(|p| p.status.as_str()) {
            Some("ignored") => "ignored",
            _ => "pending",
        };
        let rec = DiscoveryRecord {
            id: previous.as_ref().map_or_else(|| Uuid::new_v4().to_string(), |p| p.id.clone()),
            integration_type: integration.into(),
            external_id: d.external_id.clone(),
            account_id: d.account_id.clone(),
            name: d.name.clone(),
            device_type: d.device_type.as_str().into(),
            model: d.model.clone(),
            ip_address: d.ip_address.clone(),
            mac_address: d.mac_address.clone(),
            config_json: d.config.to_string(),
            secrets_enc: self.seal_secrets(&d.secrets)?,
            note: d.note.clone(),
            status: status.into(),
            discovered_at: previous.as_ref().map_or(now, |p| p.discovered_at),
            last_seen: now,
        };
        self.repo.upsert_discovery(&rec).await?;

        let is_new = previous.is_none() || previous.as_ref().is_some_and(|p| p.status == "adopted");
        if !is_new || status != "pending" {
            return Ok(Ingest::Known);
        }

        if settings.auto_adopt && rec.note.is_none() {
            let device = self.adopt(&rec.id, AdoptRequest::default()).await?;
            if settings.notify {
                self.notifier
                    .notify_admins(
                        "success",
                        "New device added",
                        &format!("{} ({}) was found and added automatically", device.name, integration),
                        Some(&format!("/devices/{}", device.id)),
                    )
                    .await;
            }
            return Ok(Ingest::Adopted);
        }

        self.bus.publish(SystemEvent::DeviceDiscovered {
            discovery_id: rec.id.clone(),
            name: rec.name.clone(),
            integration: integration.into(),
        });
        if settings.notify {
            self.notifier
                .notify_admins(
                    "info",
                    "New device found",
                    &format!("{} ({}) is ready to add", rec.name, integration),
                    Some("/devices?tab=discovered"),
                )
                .await;
        }
        Ok(Ingest::New)
    }

    pub async fn adopt(self: &Arc<Self>, discovery_id: &str, req: AdoptRequest) -> Result<DeviceRecord, ApiError> {
        let rec = self
            .repo
            .discovery(discovery_id)
            .await?
            .ok_or_else(|| ApiError::NotFound("Discovered device not found".into()))?;
        if self.repo.find_by_external(&rec.integration_type, &rec.external_id).await?.is_some() {
            return Err(ApiError::Conflict("This device is already added".into()));
        }
        let plugin = self.plugin(&rec.integration_type)?.clone();

        let mut secrets = self.open_secrets(rec.secrets_enc.as_deref());
        let mut config: Value = serde_json::from_str(&rec.config_json).unwrap_or(Value::Null);
        let mut model = rec.model.clone();
        let mut device_type = rec.device_type.clone();
        let mut account_id = rec.account_id.clone();
        let mut mac = rec.mac_address.clone();
        let mut name = rec.name.clone();

        // Devices that could not be identified during the scan (missing token or
        // account) are probed again now, with whatever the user supplied.
        if req.token.is_some() || rec.note.is_some() {
            if let Some(token) = &req.token {
                secrets["token"] = Value::String(token.trim().to_string());
            }
            let ip = rec
                .ip_address
                .as_deref()
                .ok_or_else(|| ApiError::BadRequest(rec.note.clone().unwrap_or_default()))?;
            let accounts = self.accounts.contexts(&rec.integration_type).await?;
            let d = plugin.probe(ip, &secrets, &accounts).await.map_err(|e| match e {
                CoreError::Unsupported(_) => ApiError::BadRequest(rec.note.clone().unwrap_or_default()),
                other => other.into(),
            })?;
            config = d.config;
            secrets = d.secrets;
            model = d.model.or(model);
            device_type = d.device_type.as_str().into();
            account_id = d.account_id.or(account_id);
            mac = d.mac_address.or(mac);
            if name.starts_with("Xiaomi device") || name.starts_with("Tapo ") {
                name = d.name;
            }
        }

        let now = Utc::now();
        let device = DeviceRecord {
            id: self.device_id(&rec.integration_type, &rec.external_id).await?,
            name: req.name.filter(|n| !n.trim().is_empty()).unwrap_or(name),
            room_id: req.room_id.filter(|r| !r.is_empty()),
            integration_type: rec.integration_type.clone(),
            device_type,
            model,
            ip_address: rec.ip_address.clone(),
            mac_address: mac,
            config_json: config.to_string(),
            state_json: "{}".into(),
            is_online: true,
            created_at: now,
            updated_at: now,
            external_id: Some(rec.external_id.clone()),
            account_id,
            secrets_enc: self.seal_secrets(&secrets)?,
            icon: None,
            last_seen: Some(now),
            confirm_changes: false,
        };
        self.repo.insert(&device).await?;
        self.repo.set_discovery_status(&rec.id, "adopted").await?;
        self.after_add(&device.id);
        Ok(device)
    }

    pub async fn ignore(&self, discovery_id: &str) -> Result<(), ApiError> {
        self.repo.set_discovery_status(discovery_id, "ignored").await?;
        Ok(())
    }

    pub async fn add_manual(self: &Arc<Self>, req: ManualAddRequest) -> Result<DeviceRecord, ApiError> {
        let plugin = self.plugin(&req.integration_type)?.clone();
        let accounts = self.accounts.contexts(&req.integration_type).await?;
        let secrets = match &req.token {
            Some(t) => json!({ "token": t.trim() }),
            None => json!({}),
        };
        let d = plugin.probe(req.host.trim(), &secrets, &accounts).await?;
        if self.repo.find_by_external(&req.integration_type, &d.external_id).await?.is_some() {
            return Err(ApiError::Conflict("This device is already added".into()));
        }
        let now = Utc::now();
        let device = DeviceRecord {
            id: self.device_id(&req.integration_type, &d.external_id).await?,
            name: req.name.filter(|n| !n.trim().is_empty()).unwrap_or(d.name),
            room_id: req.room_id.filter(|r| !r.is_empty()),
            integration_type: req.integration_type.clone(),
            device_type: d.device_type.as_str().into(),
            model: d.model,
            ip_address: d.ip_address.or(Some(req.host.trim().to_string())),
            mac_address: d.mac_address,
            config_json: d.config.to_string(),
            state_json: d.state.map(|s| serde_json::to_string(&s).unwrap_or_default()).unwrap_or_else(|| "{}".into()),
            is_online: true,
            created_at: now,
            updated_at: now,
            external_id: Some(d.external_id.clone()),
            account_id: d.account_id,
            secrets_enc: self.seal_secrets(&d.secrets)?,
            icon: None,
            last_seen: Some(now),
            confirm_changes: false,
        };
        self.repo.insert(&device).await?;
        self.repo.delete_discovery_for(&req.integration_type, &d.external_id).await?;
        self.after_add(&device.id);
        Ok(device)
    }

    /// A device added again gets the id it had, so the history kept from before continues.
    async fn device_id(&self, integration: &str, external_id: &str) -> sqlx::Result<String> {
        Ok(self.repo.previous_id(integration, external_id).await?.unwrap_or_else(|| Uuid::new_v4().to_string()))
    }

    fn after_add(self: &Arc<Self>, device_id: &str) {
        self.bus.publish(SystemEvent::DeviceAdded { device_id: device_id.into() });
        let this = self.clone();
        let id = device_id.to_string();
        tokio::spawn(async move {
            if let Err(e) = this.refresh(&id).await {
                tracing::debug!("initial refresh failed: {e}");
            }
        });
    }

    pub async fn remove(&self, device_id: &str) -> Result<(), ApiError> {
        let rec = self.get(device_id).await?;
        self.repo.delete(&rec.id).await?;
        if let Some(ext) = &rec.external_id {
            // Forget the discovery entry so the device can be found again.
            self.repo.delete_discovery_for(&rec.integration_type, ext).await?;
        }
        self.bus.publish(SystemEvent::DeviceRemoved { device_id: rec.id });
        Ok(())
    }
}

enum Ingest {
    Known,
    New,
    Adopted,
}
