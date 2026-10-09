use home_core::DeviceState;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SystemEvent {
    DeviceStateChanged {
        device_id: Uuid,
        new_state: DeviceState,
    },
    DeviceDiscovered {
        device_id: Uuid,
        name: String,
        integration: String,
    },
    AutomationTriggered {
        automation_id: Uuid,
    },
    EnergyThresholdExceeded {
        device_id: Uuid,
        watts: f32,
    },
    NotificationBroadcast {
        title: String,
        message: String,
    },
}

#[derive(Clone)]
pub struct EventBus {
    sender: broadcast::Sender<SystemEvent>,
}

impl EventBus {
    pub fn new(capacity: usize) -> Self {
        let (sender, _) = broadcast::channel(capacity);
        Self { sender }
    }

    pub fn publish(&self, event: SystemEvent) {
        let _ = self.sender.send(event);
    }

    pub fn subscribe(&self) -> broadcast::Receiver<SystemEvent> {
        self.sender.subscribe()
    }
}

impl Default for EventBus {
    fn default() -> Self {
        Self::new(1024)
    }
}
