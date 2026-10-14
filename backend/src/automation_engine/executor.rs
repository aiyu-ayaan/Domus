use super::{conditions, triggers};
use crate::infrastructure::event_bus::{Actor, EventBus, SystemEvent};
use crate::integrations::DeviceManager;
use crate::modules::notifications::Notifier;
use chrono::{DateTime, Local, Utc};
use home_core::{Action, Condition, DeviceState, Trigger};
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};
use tokio::sync::{Mutex, RwLock};

#[derive(Debug, Clone)]
pub struct Rule {
    pub id: String,
    pub name: String,
    pub triggers: Vec<Trigger>,
    pub conditions: Vec<Condition>,
    pub actions: Vec<Action>,
}

#[derive(sqlx::FromRow)]
struct RuleRow {
    id: String,
    name: String,
    triggers_json: String,
    conditions_json: String,
    actions_json: String,
}

/// Same rule cannot fire twice within this window (guards against feedback loops).
const COOLDOWN: Duration = Duration::from_secs(2);
const MAX_SCENE_DEPTH: u8 = 3;

pub struct AutomationEngine {
    pool: SqlitePool,
    manager: Arc<DeviceManager>,
    notifier: Notifier,
    bus: EventBus,
    rules: RwLock<Vec<Rule>>,
    last_fired: Mutex<HashMap<String, Instant>>,
}

impl AutomationEngine {
    pub fn new(pool: SqlitePool, manager: Arc<DeviceManager>, notifier: Notifier, bus: EventBus) -> Self {
        Self {
            pool,
            manager,
            notifier,
            bus,
            rules: RwLock::new(Vec::new()),
            last_fired: Mutex::new(HashMap::new()),
        }
    }

    /// Reload enabled rules from the database. Call after any automation change.
    pub async fn reload(&self) {
        let rows: Vec<RuleRow> = match sqlx::query_as(
            "SELECT id, name, triggers_json, conditions_json, actions_json FROM automations WHERE is_enabled = 1",
        )
        .fetch_all(&self.pool)
        .await
        {
            Ok(r) => r,
            Err(e) => {
                tracing::error!("cannot load automations: {e}");
                return;
            }
        };
        let rules = rows
            .into_iter()
            .filter_map(|r| {
                let parsed = (|| -> serde_json::Result<Rule> {
                    Ok(Rule {
                        triggers: serde_json::from_str(&r.triggers_json)?,
                        conditions: serde_json::from_str(&r.conditions_json)?,
                        actions: serde_json::from_str(&r.actions_json)?,
                        id: r.id.clone(),
                        name: r.name.clone(),
                    })
                })();
                parsed.map_err(|e| tracing::warn!("automation '{}' is invalid: {e}", r.name)).ok()
            })
            .collect::<Vec<_>>();
        tracing::info!("Loaded {} automation(s)", rules.len());
        *self.rules.write().await = rules;
    }

    /// React to bus events (device changes, discoveries).
    pub async fn run(self: Arc<Self>) {
        let mut rx = self.bus.subscribe();
        loop {
            let event = match rx.recv().await {
                Ok(e) => e,
                Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                    tracing::warn!("automation engine lagged by {n} events");
                    continue;
                }
                Err(_) => return,
            };
            let matched: Vec<Rule> = self
                .rules
                .read()
                .await
                .iter()
                .filter(|r| r.triggers.iter().any(|t| triggers::matches_event(t, &event)))
                .cloned()
                .collect();
            for rule in matched {
                self.clone().fire(rule).await;
            }
        }
    }

    /// Called once per minute by the scheduler.
    pub async fn tick(self: &Arc<Self>, now: DateTime<Local>) {
        let location = crate::modules::server::location(&self.pool).await;
        let matched: Vec<Rule> = self
            .rules
            .read()
            .await
            .iter()
            .filter(|r| r.triggers.iter().any(|t| triggers::matches_time(t, &now, location)))
            .cloned()
            .collect();
        for rule in matched {
            self.clone().fire(rule).await;
        }
    }

    async fn device_states(&self) -> HashMap<String, (DeviceState, bool)> {
        self.manager
            .repo
            .list_all()
            .await
            .unwrap_or_default()
            .into_iter()
            .map(|d| (d.id.clone(), (d.state(), d.is_online)))
            .collect()
    }

    async fn fire(self: Arc<Self>, rule: Rule) {
        {
            let mut last = self.last_fired.lock().await;
            if last.get(&rule.id).is_some_and(|t| t.elapsed() < COOLDOWN) {
                return;
            }
            last.insert(rule.id.clone(), Instant::now());
        }
        if !rule.conditions.is_empty() {
            let states = self.device_states().await;
            let now = Local::now();
            let lookup = |id: &str| states.get(id).cloned();
            if !rule.conditions.iter().all(|c| conditions::evaluate(c, &now, &lookup)) {
                return;
            }
        }
        tracing::info!("Automation '{}' triggered", rule.name);
        let _ = sqlx::query("UPDATE automations SET last_triggered_at = ? WHERE id = ?")
            .bind(Utc::now())
            .bind(&rule.id)
            .execute(&self.pool)
            .await;
        self.bus.publish(SystemEvent::AutomationTriggered {
            automation_id: rule.id.clone(),
            name: rule.name.clone(),
        });
        // Actions may contain delays; never block the event loop.
        tokio::spawn(async move {
            let actor = Actor::Automation { id: rule.id.clone(), name: rule.name.clone() };
            let errors = self.execute(&rule.actions, 0, &actor).await;
            if !errors.is_empty() {
                self.notifier
                    .notify_admins("warning", &format!("Automation \"{}\" had problems", rule.name), &errors.join("; "), Some("/automations"))
                    .await;
            }
        });
    }

    /// Run actions in order; returns error messages.
    pub fn execute<'a>(
        self: &'a Arc<Self>,
        actions: &'a [Action],
        depth: u8,
        actor: &'a Actor,
    ) -> futures::future::BoxFuture<'a, Vec<String>> {
        Box::pin(async move {
            let mut errors = Vec::new();
            for action in actions {
                match action {
                    Action::DeviceCommand { device_id, command } => {
                        if let Err(e) = self.manager.command(device_id, command, Some(actor.clone())).await {
                            errors.push(format!("{device_id}: {e}"));
                        }
                    }
                    Action::GroupCommand { group_id, command } => match self.manager.group_device_ids(group_id).await {
                        Ok(ids) => {
                            for (id, e) in self.manager.command_many(&ids, command, Some(actor.clone())).await {
                                errors.push(format!("{id}: {e}"));
                            }
                        }
                        Err(e) => errors.push(e.to_string()),
                    },
                    Action::Notify { title, message } => {
                        self.notifier.notify("info", title, message, None).await;
                    }
                    Action::Scene { scene_id } => {
                        if depth >= MAX_SCENE_DEPTH {
                            errors.push("scenes nested too deeply".into());
                            continue;
                        }
                        match self.scene_actions(scene_id).await {
                            Some(list) => errors.extend(self.execute(&list, depth + 1, actor).await),
                            None => errors.push(format!("scene {scene_id} not found")),
                        }
                    }
                    Action::Delay { seconds } => {
                        tokio::time::sleep(Duration::from_secs((*seconds).min(24 * 3600))).await;
                    }
                }
            }
            errors
        })
    }

    /// Names of the devices these actions would switch on or off that ask before switching, nested scenes
    /// and groups included. Empty when nothing needs a warning.
    pub fn guarded<'a>(&'a self, actions: &'a [Action], depth: u8) -> futures::future::BoxFuture<'a, Vec<String>> {
        Box::pin(async move {
            let mut ids: Vec<String> = Vec::new();
            let mut names: Vec<String> = Vec::new();
            for action in actions {
                match action {
                    Action::DeviceCommand { device_id, command } if command.is_on.is_some() => ids.push(device_id.clone()),
                    Action::GroupCommand { group_id, command } if command.is_on.is_some() => {
                        ids.extend(self.manager.group_device_ids(group_id).await.unwrap_or_default())
                    }
                    Action::Scene { scene_id } if depth < MAX_SCENE_DEPTH => {
                        if let Some(list) = self.scene_actions(scene_id).await {
                            names.extend(self.guarded(&list, depth + 1).await);
                        }
                    }
                    _ => {}
                }
            }
            for id in ids {
                if let Ok(device) = self.manager.get(&id).await {
                    if device.confirm_changes {
                        names.push(device.name);
                    }
                }
            }
            names.sort();
            names.dedup();
            names
        })
    }

    /// Refuses with [ApiError::Confirm] while a device that asks before switching is in `actions`
    /// and the person has not confirmed. Only for what a person starts: automations that fire
    /// on their own have nobody to ask.
    pub async fn require_confirmed(&self, actions: &[Action], confirmed: bool) -> Result<(), crate::api::error::ApiError> {
        if confirmed {
            return Ok(());
        }
        match self.guarded(actions, 0).await {
            names if names.is_empty() => Ok(()),
            names => Err(crate::api::error::ApiError::Confirm(names)),
        }
    }

    pub async fn scene_actions(&self, scene_id: &str) -> Option<Vec<Action>> {
        let row: Option<(String,)> = sqlx::query_as("SELECT actions_json FROM scenes WHERE id = ?")
            .bind(scene_id)
            .fetch_optional(&self.pool)
            .await
            .ok()?;
        row.and_then(|(json,)| serde_json::from_str(&json).ok())
    }
}
