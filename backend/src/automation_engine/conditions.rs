use chrono::{DateTime, Local, Timelike};
use home_core::{parse_hhmm, Condition, DeviceState};
use serde_json::Value;

/// `lookup` returns (state, online) for a device id.
pub fn evaluate(condition: &Condition, now: &DateTime<Local>, lookup: &dyn Fn(&str) -> Option<(DeviceState, bool)>) -> bool {
    match condition {
        Condition::DeviceState { device_id, property, compare } => {
            let Some((state, online)) = lookup(device_id) else { return false };
            let value = if property == "is_online" { Some(Value::Bool(online)) } else { state.property(property) };
            compare.matches(value.as_ref())
        }
        Condition::TimeBetween { start, end } => {
            let (Some(s), Some(e)) = (parse_hhmm(start), parse_hhmm(end)) else { return false };
            let m = now.hour() * 60 + now.minute();
            if s <= e {
                (s..e).contains(&m)
            } else {
                // wraps midnight, e.g. 22:00-06:00
                m >= s || m < e
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn time_window_wraps_midnight() {
        let c = Condition::TimeBetween { start: "22:00".into(), end: "06:00".into() };
        let none = |_: &str| None;
        assert!(evaluate(&c, &Local.with_ymd_and_hms(2026, 1, 1, 23, 0, 0).unwrap(), &none));
        assert!(evaluate(&c, &Local.with_ymd_and_hms(2026, 1, 1, 5, 59, 0).unwrap(), &none));
        assert!(!evaluate(&c, &Local.with_ymd_and_hms(2026, 1, 1, 12, 0, 0).unwrap(), &none));
    }
}
