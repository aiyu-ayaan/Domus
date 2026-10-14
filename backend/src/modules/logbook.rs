//! Device logbook: every meaningful change of a device and who made it, written from the event bus.

use crate::infrastructure::event_bus::{Actor, EventBus, SystemEvent};
use chrono::{DateTime, Utc};
use home_core::DeviceState;
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;
use std::collections::HashMap;
use std::time::{Duration, Instant};

/// Fields worth a line in the logbook. Readings (power, PM2.5, temperature) live in the metric tables.
const FIELDS: [&str; 8] = ["is_on", "brightness", "color_temp", "color", "effect", "fan_speed", "fan_percent", "mode"];

/// Changes to one field this close together are one entry: a dragged slider, or the poll that confirms a command.
const MERGE: Duration = Duration::from_secs(10);

#[derive(Serialize)]
pub struct LogEntry {
    pub at: DateTime<Utc>,
    pub field: String,
    pub value: Option<Value>,
    pub previous: Option<Value>,
    pub actor: Option<Actor>,
}

type Row = (DateTime<Utc>, String, Option<String>, Option<String>, Option<String>);

fn parse<T: serde::de::DeserializeOwned>(json: Option<String>) -> Option<T> {
    json.and_then(|j| serde_json::from_str(&j).ok())
}

/// (field, previous, now) for every logged field that differs. `is_online` is compared too.
pub fn changes(previous: Option<&DeviceState>, state: &DeviceState, was_online: bool, is_online: bool) -> Vec<(&'static str, Option<Value>, Option<Value>)> {
    let mut out = Vec::new();
    if was_online != is_online {
        out.push(("is_online", Some(Value::Bool(was_online)), Some(Value::Bool(is_online))));
    }
    // Going offline repeats the last state: nothing else changed.
    if let (Some(prev), true) = (previous, is_online) {
        for f in FIELDS {
            let (before, now) = (prev.property(f), state.property(f));
            // A field reported for the first time (a device just added) is not a change.
            if before != now && before.is_some() && now.is_some() {
                out.push((f, before, now));
            }
        }
    }
    out
}

struct Last {
    row: i64,
    at: Instant,
    actor: Option<Actor>,
    /// The value before the change the row records.
    before: Option<Value>,
}

pub async fn run(pool: SqlitePool, bus: EventBus) {
    let mut rx = bus.subscribe();
    let mut last: HashMap<(String, &'static str), Last> = HashMap::new();
    loop {
        let event = match rx.recv().await {
            Ok(e) => e,
            Err(tokio::sync::broadcast::error::RecvError::Lagged(n)) => {
                tracing::warn!("logbook lagged by {n} events");
                continue;
            }
            Err(_) => return,
        };
        let SystemEvent::DeviceStateChanged { device_id, state, is_online, previous, was_online, actor } = event else { continue };
        for (field, before, now) in changes(previous.as_ref(), &state, was_online, is_online) {
            let key = (device_id.clone(), field);
            // A change with no actor right after one with an actor is the device confirming it.
            let merge = last
                .get(&key)
                .filter(|l| l.at.elapsed() < MERGE && (actor.is_none() || actor == l.actor));
            // Back where the merged entry started (off and on again within seconds): nothing changed.
            if let Some(l) = merge.filter(|l| l.before == now) {
                let _ = sqlx::query("DELETE FROM device_events WHERE id = ?").bind(l.row).execute(&pool).await;
                last.remove(&key);
                continue;
            }
            let result = match merge {
                Some(l) => sqlx::query("UPDATE device_events SET value = ?, at = ? WHERE id = ?")
                    .bind(now.as_ref().map(Value::to_string))
                    .bind(Utc::now())
                    .bind(l.row)
                    .execute(&pool)
                    .await
                    .map(|_| (l.row, l.actor.clone(), l.before.clone())),
                None => sqlx::query("INSERT INTO device_events (device_id, at, field, value, previous, actor) VALUES (?, ?, ?, ?, ?, ?)")
                    .bind(&device_id)
                    .bind(Utc::now())
                    .bind(field)
                    .bind(now.as_ref().map(Value::to_string))
                    .bind(before.as_ref().map(Value::to_string))
                    .bind(actor.as_ref().and_then(|a| serde_json::to_string(a).ok()))
                    .execute(&pool)
                    .await
                    .map(|r| (r.last_insert_rowid(), actor.clone(), before.clone())),
            };
            match result {
                Ok((row, actor, before)) => {
                    last.insert(key, Last { row, at: Instant::now(), actor, before });
                }
                Err(e) => tracing::warn!("logbook: cannot store a change of {device_id}: {e}"),
            }
        }
        last.retain(|_, l| l.at.elapsed() < MERGE);
    }
}

/// Newest first, older than `before` when given.
pub async fn list(pool: &SqlitePool, device_id: &str, before: Option<DateTime<Utc>>, limit: u32) -> sqlx::Result<Vec<LogEntry>> {
    let rows: Vec<Row> = sqlx::query_as(
        "SELECT at, field, value, previous, actor FROM device_events
         WHERE device_id = ? AND (? IS NULL OR at < ?) ORDER BY at DESC, id DESC LIMIT ?",
    )
    .bind(device_id)
    .bind(before)
    .bind(before)
    .bind(limit.clamp(1, 200))
    .fetch_all(pool)
    .await?;
    Ok(rows
        .into_iter()
        .map(|(at, field, value, previous, actor)| LogEntry { at, field, value: parse(value), previous: parse(previous), actor: parse(actor) })
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn logs_switches_and_skips_readings() {
        let before = DeviceState { is_on: Some(false), current_power_watts: Some(0.0), ..Default::default() };
        let after = DeviceState { is_on: Some(true), current_power_watts: Some(40.0), ..Default::default() };
        let c = changes(Some(&before), &after, true, true);
        assert_eq!(c, vec![("is_on", Some(Value::Bool(false)), Some(Value::Bool(true)))]);
    }

    #[test]
    fn a_first_report_is_not_a_change() {
        let after = DeviceState { is_on: Some(true), brightness: Some(50), ..Default::default() };
        assert!(changes(Some(&DeviceState::default()), &after, true, true).is_empty());
    }

    #[test]
    fn going_offline_is_one_entry() {
        let s = DeviceState { is_on: Some(true), ..Default::default() };
        let c = changes(Some(&s), &DeviceState::default(), true, false);
        assert_eq!(c.len(), 1);
        assert_eq!(c[0].0, "is_online");
    }
}
