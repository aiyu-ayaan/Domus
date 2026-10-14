//! Alerts nobody has to set up as an automation: a device left on longer than its owner allows,
//! and an air purifier filter that is nearly used up.

use crate::infrastructure::event_bus::{EventBus, SystemEvent};
use crate::integrations::DeviceManager;
use crate::modules::devices::model::DeviceRecord;
use crate::modules::notifications::Notifier;
use home_core::DeviceState;
use std::collections::HashMap;
use std::sync::Arc;
use std::time::{Duration, Instant};

/// A metered device counts as on above this draw, so a TV in standby is "off".
const ON_WATTS: f32 = 10.0;
const SLACK: Duration = Duration::from_secs(5);
/// Filter life (%) at which administrators are told to replace it.
pub const FILTER_LOW: f32 = 10.0;

pub struct WatchdogWorker {
    manager: Arc<DeviceManager>,
    notifier: Notifier,
    bus: EventBus,
}

/// Whether a device is in use: drawing power when it is metered, else switched on.
fn is_on(device: &DeviceRecord) -> bool {
    let s = device.state();
    device.is_online && s.current_power_watts.map_or(s.is_on == Some(true), |w| w > ON_WATTS)
}

/// Since when each watched device has been on, and whether it was reported for this stretch.
type Stretches = HashMap<String, (Instant, bool)>;

/// Devices that have just been on longer than their alert allows; each is reported once per stretch.
fn left_on<'a>(stretches: &mut Stretches, devices: &'a [DeviceRecord], now: Instant) -> Vec<(&'a DeviceRecord, i64)> {
    let mut due = Vec::new();
    stretches.retain(|id, _| devices.iter().any(|d| &d.id == id && d.left_on_alert_minutes.is_some() && is_on(d)));
    for d in devices {
        let Some(minutes) = d.left_on_alert_minutes else { continue };
        if !is_on(d) {
            continue;
        }
        let (since, reported) = stretches.entry(d.id.clone()).or_insert((now, false));
        // Checked once a minute: a few seconds' slack keeps "60 s on" from reading 59.99 s and slipping a tick.
        if !*reported && now.duration_since(*since) + SLACK >= Duration::from_secs(minutes as u64 * 60) {
            *reported = true;
            due.push((d, minutes));
        }
    }
    due
}

/// The filter just went below [FILTER_LOW].
fn filter_crossed(previous: Option<&DeviceState>, state: &DeviceState) -> Option<f32> {
    let (before, now) = (previous?.filter_life?, state.filter_life?);
    (before > FILTER_LOW && now <= FILTER_LOW).then_some(now)
}

impl WatchdogWorker {
    pub fn new(manager: Arc<DeviceManager>, notifier: Notifier, bus: EventBus) -> Self {
        Self { manager, notifier, bus }
    }

    pub async fn run(self) {
        let mut rx = self.bus.subscribe();
        let mut tick = tokio::time::interval(Duration::from_secs(60));
        let mut stretches = Stretches::new();
        loop {
            tokio::select! {
                _ = tick.tick() => {
                    let devices = self.manager.repo.list_all().await.unwrap_or_default();
                    for (d, minutes) in left_on(&mut stretches, &devices, Instant::now()) {
                        // Parsed back into a translatable code by `classify_notification`.
                        self.notifier
                            .notify_admins("warning", &format!("{} left on", d.name), &format!("{} has been on for {minutes} minutes.", d.name), Some("/devices"))
                            .await;
                    }
                }
                event = rx.recv() => match event {
                    Ok(SystemEvent::DeviceStateChanged { device_id, state, previous, .. }) => {
                        if let Some(percent) = filter_crossed(previous.as_ref(), &state) {
                            if let Ok(d) = self.manager.get(&device_id).await {
                                self.notifier
                                    .notify_admins("warning", &format!("Replace the filter of {}", d.name), &format!("{}% of the filter life is left.", percent.round()), Some("/air-quality"))
                                    .await;
                            }
                        }
                    }
                    Err(tokio::sync::broadcast::error::RecvError::Closed) => return,
                    _ => {}
                },
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn device(watts: f32, alert: Option<i64>) -> DeviceRecord {
        let mut d = crate::modules::devices::service::tests::device("heater", None);
        d.state_json = format!(r#"{{"is_on":true,"current_power_watts":{watts}}}"#);
        d.is_online = true;
        d.left_on_alert_minutes = alert;
        d
    }

    #[test]
    fn left_on_is_reported_once_per_stretch() {
        let start = Instant::now();
        let at = |m: u64| start + Duration::from_secs(m * 60);
        let mut s = Stretches::new();
        let on = [device(1500.0, Some(60))];
        assert!(left_on(&mut s, &on, at(0)).is_empty());
        assert!(left_on(&mut s, &on, at(58)).is_empty());
        assert_eq!(left_on(&mut s, &on, at(60)).len(), 1);
        assert!(left_on(&mut s, &on, at(90)).is_empty());
        // Standby draw counts as off and starts the next stretch over.
        assert!(left_on(&mut s, &[device(3.0, Some(60))], at(91)).is_empty());
        assert!(left_on(&mut s, &on, at(92)).is_empty());
        assert!(left_on(&mut s, &[device(1500.0, None)], at(200)).is_empty());
    }

    #[test]
    fn filter_alert_fires_when_crossing() {
        let s = |f: f32| DeviceState { filter_life: Some(f), ..Default::default() };
        assert_eq!(filter_crossed(Some(&s(11.0)), &s(10.0)), Some(10.0));
        assert_eq!(filter_crossed(Some(&s(9.0)), &s(8.0)), None);
        assert_eq!(filter_crossed(None, &s(8.0)), None);
    }
}
