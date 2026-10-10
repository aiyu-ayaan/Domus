use home_core::DeviceState;
use serde::Serialize;
use tokio::sync::broadcast;

/// Events fanned out to the automation engine, workers and WebSocket clients.
#[derive(Debug, Clone, Serialize)]
#[serde(tag = "type", rename_all = "snake_case")]
#[allow(clippy::large_enum_variant)]
pub enum SystemEvent {
    DeviceStateChanged {
        device_id: String,
        state: DeviceState,
        is_online: bool,
        /// Previous values, used for edge-triggered automations.
        #[serde(skip)]
        previous: Option<DeviceState>,
        #[serde(skip)]
        was_online: bool,
    },
    DeviceAdded {
        device_id: String,
    },
    DeviceUpdated {
        device_id: String,
    },
    DeviceRemoved {
        device_id: String,
    },
    DeviceDiscovered {
        discovery_id: String,
        name: String,
        integration: String,
    },
    DiscoveryFinished {
        found: usize,
        new: usize,
    },
    IntegrationsChanged,
    RoomsChanged,
    UserUpdated {
        user_id: String,
        username: String,
        role: String,
        avatar: Option<String>,
    },
    UsersChanged,
    Notification {
        id: String,
        level: String,
        title: String,
        message: String,
    },
    AutomationTriggered {
        automation_id: String,
        name: String,
    },
}

impl SystemEvent {
    /// Device this event is about, for per-user filtering.
    pub fn device_id(&self) -> Option<&str> {
        match self {
            Self::DeviceStateChanged { device_id, .. }
            | Self::DeviceAdded { device_id }
            | Self::DeviceUpdated { device_id }
            | Self::DeviceRemoved { device_id } => Some(device_id),
            _ => None,
        }
    }
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
