use home_core::Trigger;
use crate::infrastructure::event_bus::SystemEvent;

pub fn evaluate_trigger(trigger: &Trigger, event: &SystemEvent) -> bool {
    match (trigger, event) {
        (
            Trigger::DeviceStateChanged { device_id, .. },
            SystemEvent::DeviceStateChanged { device_id: event_id, .. },
        ) => device_id == event_id,
        (
            Trigger::EnergyThreshold { device_id, watts_greater_than },
            SystemEvent::EnergyThresholdExceeded { device_id: event_id, watts },
        ) => device_id == event_id && watts >= watts_greater_than,
        _ => false,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    #[test]
    fn test_energy_trigger_evaluation() {
        let id = Uuid::new_v4();
        let trigger = Trigger::EnergyThreshold {
            device_id: id,
            watts_greater_than: 100.0,
        };

        let event = SystemEvent::EnergyThresholdExceeded {
            device_id: id,
            watts: 150.0,
        };

        assert!(evaluate_trigger(&trigger, &event));
    }
}
