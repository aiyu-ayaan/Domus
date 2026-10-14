use crate::infrastructure::event_bus::SystemEvent;
use chrono::{DateTime, Datelike, Local, Timelike};
use home_core::{parse_hhmm, sun_times, DeviceState, SunEvent, Trigger};
use serde_json::Value;

fn property(state: Option<&DeviceState>, online: bool, name: &str) -> Option<Value> {
    if name == "is_online" {
        return Some(Value::Bool(online));
    }
    state?.property(name)
}

/// Edge-triggered: a trigger fires when its condition becomes true, not while it stays true.
pub fn matches_event(trigger: &Trigger, event: &SystemEvent) -> bool {
    match (trigger, event) {
        (
            Trigger::DeviceState { device_id, property: prop, compare },
            SystemEvent::DeviceStateChanged { device_id: id, state, is_online, previous, was_online, .. },
        ) if device_id == id => {
            let now = compare.matches(property(Some(state), *is_online, prop).as_ref());
            let before = compare.matches(property(previous.as_ref(), *was_online, prop).as_ref());
            now && !before
        }
        (
            Trigger::PowerAbove { device_id, watts, for_minutes: None },
            SystemEvent::DeviceStateChanged { device_id: id, state, previous, .. },
        ) if device_id == id => {
            let now = state.current_power_watts.unwrap_or(0.0) as f64;
            let before = previous.as_ref().and_then(|p| p.current_power_watts).unwrap_or(0.0) as f64;
            now > *watts && before <= *watts
        }
        (
            Trigger::DeviceOffline { device_id },
            SystemEvent::DeviceStateChanged { device_id: id, is_online, was_online, .. },
        ) => device_id == id && *was_online && !*is_online,
        (Trigger::DeviceDiscovered, SystemEvent::DeviceDiscovered { .. }) => true,
        _ => false,
    }
}

/// `location` is the home's (latitude, longitude); sun triggers never fire without it.
pub fn matches_time(trigger: &Trigger, now: &DateTime<Local>, location: Option<(f64, f64)>) -> bool {
    let (minutes, days) = match trigger {
        Trigger::Time { at, days } => (parse_hhmm(at), days),
        Trigger::Sun { event, offset_minutes, days } => (sun_minutes(*event, *offset_minutes, now, location), days),
        _ => return false,
    };
    let today = now.weekday().num_days_from_monday() as u8;
    minutes == Some(now.hour() * 60 + now.minute()) && (days.is_empty() || days.contains(&today))
}

/// Minutes since local midnight of today's sunrise or sunset plus the offset, when it still falls on today.
fn sun_minutes(event: SunEvent, offset_minutes: i32, now: &DateTime<Local>, location: Option<(f64, f64)>) -> Option<u32> {
    let (latitude, longitude) = location?;
    let (rise, set) = sun_times(now.date_naive(), latitude, longitude)?;
    let at = if event == SunEvent::Sunrise { rise } else { set }.with_timezone(&now.timezone()) + chrono::Duration::minutes(offset_minutes as i64);
    (at.date_naive() == now.date_naive()).then(|| at.hour() * 60 + at.minute())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;
    use home_core::Comparison;

    fn changed(prev_on: bool, now_on: bool) -> SystemEvent {
        SystemEvent::DeviceStateChanged {
            device_id: "d".into(),
            state: DeviceState { is_on: Some(now_on), ..Default::default() },
            is_online: true,
            previous: Some(DeviceState { is_on: Some(prev_on), ..Default::default() }),
            was_online: true,
            actor: None,
        }
    }

    #[test]
    fn state_trigger_is_edge_triggered() {
        let t = Trigger::DeviceState {
            device_id: "d".into(),
            property: "is_on".into(),
            compare: Comparison { equals: Some(Value::Bool(true)), ..Default::default() },
        };
        assert!(matches_event(&t, &changed(false, true)));
        assert!(!matches_event(&t, &changed(true, true)));
    }

    #[test]
    fn time_trigger_respects_days() {
        // 2026-10-05 is a Monday.
        let t = Local.with_ymd_and_hms(2026, 10, 5, 7, 30, 0).unwrap();
        assert!(matches_time(&Trigger::Time { at: "07:30".into(), days: vec![0] }, &t, None));
        assert!(!matches_time(&Trigger::Time { at: "07:30".into(), days: vec![1] }, &t, None));
        assert!(!matches_time(&Trigger::Time { at: "07:31".into(), days: vec![] }, &t, None));
    }

    #[test]
    fn sun_trigger_fires_in_one_minute_of_the_day_and_needs_a_location() {
        let pune = Some((18.52, 73.86));
        let sunset = |offset_minutes| Trigger::Sun { event: SunEvent::Sunset, offset_minutes, days: vec![] };
        let minutes_matching = |t: &Trigger, location| {
            (0..24 * 60)
                .filter(|m| matches_time(t, &Local.with_ymd_and_hms(2026, 10, 5, m / 60, m % 60, 0).unwrap(), location))
                .collect::<Vec<u32>>()
        };
        let at_sunset = minutes_matching(&sunset(0), pune);
        assert_eq!(at_sunset.len(), 1);
        assert_eq!(minutes_matching(&sunset(-30), pune), vec![at_sunset[0] - 30]);
        assert!(minutes_matching(&sunset(0), None).is_empty());
    }
}
