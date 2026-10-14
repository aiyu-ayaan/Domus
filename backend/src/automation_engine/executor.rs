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
/// Traces kept per automation.
const KEEP_RUNS: i64 = 50;

pub struct AutomationEngine {
    pool: SqlitePool,
    manager: Arc<DeviceManager>,
    notifier: Notifier,
    bus: EventBus,
    rules: RwLock<Vec<Rule>>,
    last_fired: Mutex<HashMap<String, Instant>>,
    /// Power triggers with a duration: since when the device has been above, per (rule, trigger index),
    /// and whether the rule already fired for this stretch.
    sustained: Mutex<Stretches>,
}

type Stretches = HashMap<(String, usize), (DateTime<Local>, bool)>;

/// Each fires once per stretch above the threshold; `stretches` remembers since when each device has been above.
fn sustained_due(stretches: &mut Stretches, rules: &[Rule], states: &HashMap<String, (DeviceState, bool)>, now: DateTime<Local>) -> Vec<(Rule, usize)> {
    let mut due = Vec::new();
    let mut seen = std::collections::HashSet::new();
    for rule in rules {
        for (i, t) in rule.triggers.iter().enumerate() {
            let Trigger::PowerAbove { device_id, watts, for_minutes: Some(minutes) } = t else { continue };
            let key = (rule.id.clone(), i);
            seen.insert(key.clone());
            let above = states
                .get(device_id)
                .is_some_and(|(s, online)| *online && s.current_power_watts.unwrap_or(0.0) as f64 > *watts);
            if !above {
                stretches.remove(&key);
                continue;
            }
            let (since, fired) = stretches.entry(key).or_insert((now, false));
            if !*fired && now - *since >= chrono::Duration::minutes(*minutes as i64) {
                *fired = true;
                due.push((rule.clone(), i));
            }
        }
    }
    stretches.retain(|k, _| seen.contains(k));
    due
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
            sustained: Mutex::new(HashMap::new()),
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
            let matched: Vec<(Rule, usize)> = self
                .rules
                .read()
                .await
                .iter()
                .filter_map(|r| r.triggers.iter().position(|t| triggers::matches_event(t, &event)).map(|i| (r.clone(), i)))
                .collect();
            for (rule, index) in matched {
                self.clone().fire(rule, index).await;
            }
        }
    }

    /// Called once per minute by the scheduler.
    pub async fn tick(self: &Arc<Self>, now: DateTime<Local>) {
        let location = crate::modules::server::location(&self.pool).await;
        let rules = self.rules.read().await.clone();
        let mut matched: Vec<(Rule, usize)> = rules
            .iter()
            .filter_map(|r| r.triggers.iter().position(|t| triggers::matches_time(t, &now, location)).map(|i| (r.clone(), i)))
            .collect();
        matched.extend(self.sustained_power(&rules, now).await);
        for (rule, index) in matched {
            self.clone().fire(rule, index).await;
        }
    }

    /// Power triggers with `for_minutes` whose device has now been above the threshold that long.
    async fn sustained_power(&self, rules: &[Rule], now: DateTime<Local>) -> Vec<(Rule, usize)> {
        let mut sustained = self.sustained.lock().await;
        let watches = rules.iter().any(|r| r.triggers.iter().any(|t| matches!(t, Trigger::PowerAbove { for_minutes: Some(_), .. })));
        if !watches {
            sustained.clear();
            return Vec::new();
        }
        sustained_due(&mut sustained, rules, &self.device_states().await, now)
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

    /// `trigger` is the index of the trigger that matched.
    async fn fire(self: Arc<Self>, rule: Rule, trigger: usize) {
        {
            let mut last = self.last_fired.lock().await;
            if last.get(&rule.id).is_some_and(|t| t.elapsed() < COOLDOWN) {
                return;
            }
            last.insert(rule.id.clone(), Instant::now());
        }
        let mut checks = Vec::new();
        if !rule.conditions.is_empty() {
            let states = self.device_states().await;
            let now = Local::now();
            let lookup = |id: &str| states.get(id).cloned();
            let weather = crate::modules::weather::latest();
            // Every condition is evaluated, so the trace shows each one that held it back.
            checks = rule
                .conditions
                .iter()
                .enumerate()
                .map(|(i, c)| serde_json::json!({ "index": i, "passed": conditions::evaluate(c, &now, &lookup, weather.as_ref()) }))
                .collect();
        }
        let trigger = serde_json::json!({ "index": trigger });
        if checks.iter().any(|c| c["passed"] == false) {
            self.record_run(&rule.id, &trigger, &checks, "blocked").await;
            return;
        }
        let run = self.record_run(&rule.id, &trigger, &checks, "running").await;
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
            self.finish_run(run, &errors).await;
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

    /// Start a trace; returns its id, or None when it could not be stored.
    pub async fn record_run(&self, automation_id: &str, trigger: &serde_json::Value, conditions: &[serde_json::Value], outcome: &str) -> Option<i64> {
        let now = Utc::now();
        let finished = (outcome != "running").then_some(now);
        let id = sqlx::query(
            "INSERT INTO automation_runs (automation_id, started_at, finished_at, trigger, conditions, outcome) VALUES (?, ?, ?, ?, ?, ?)",
        )
        .bind(automation_id)
        .bind(now)
        .bind(finished)
        .bind(trigger.to_string())
        .bind(serde_json::Value::from(conditions.to_vec()).to_string())
        .bind(outcome)
        .execute(&self.pool)
        .await
        .map_err(|e| tracing::warn!("cannot store an automation run: {e}"))
        .ok()?
        .last_insert_rowid();
        let _ = sqlx::query(
            "DELETE FROM automation_runs WHERE automation_id = ?
             AND id NOT IN (SELECT id FROM automation_runs WHERE automation_id = ? ORDER BY id DESC LIMIT ?)",
        )
        .bind(automation_id)
        .bind(automation_id)
        .bind(KEEP_RUNS)
        .execute(&self.pool)
        .await;
        Some(id)
    }

    pub async fn finish_run(&self, run: Option<i64>, errors: &[String]) {
        let Some(id) = run else { return };
        let _ = sqlx::query("UPDATE automation_runs SET finished_at = ?, outcome = ?, errors = ? WHERE id = ?")
            .bind(Utc::now())
            .bind(if errors.is_empty() { "done" } else { "failed" })
            .bind(serde_json::to_string(errors).unwrap_or_else(|_| "[]".into()))
            .bind(id)
            .execute(&self.pool)
            .await;
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

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn left_on_fires_once_per_stretch() {
        let rule = Rule {
            id: "r".into(),
            name: "Heater left on".into(),
            triggers: vec![Trigger::PowerAbove { device_id: "h".into(), watts: 1000.0, for_minutes: Some(30) }],
            conditions: vec![],
            actions: vec![],
        };
        let rules = [rule];
        let states = |w: f32| HashMap::from([("h".to_string(), (DeviceState { current_power_watts: Some(w), ..Default::default() }, true))]);
        let at = |m: u32| Local.with_ymd_and_hms(2026, 10, 14, 20, m, 0).unwrap();
        let mut stretches = Stretches::new();
        assert!(sustained_due(&mut stretches, &rules, &states(1200.0), at(0)).is_empty());
        assert!(sustained_due(&mut stretches, &rules, &states(1200.0), at(29)).is_empty());
        assert_eq!(sustained_due(&mut stretches, &rules, &states(1200.0), at(30)).len(), 1);
        assert!(sustained_due(&mut stretches, &rules, &states(1200.0), at(45)).is_empty(), "fires once");
        assert!(sustained_due(&mut stretches, &rules, &states(10.0), at(46)).is_empty());
        assert!(sustained_due(&mut stretches, &rules, &states(1200.0), at(47)).is_empty(), "a new stretch starts over");
    }
}
