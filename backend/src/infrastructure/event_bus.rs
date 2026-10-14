use home_core::DeviceState;
use serde::{Deserialize, Serialize};
use tokio::sync::broadcast;

/// Who changed a device: kept in the device logbook. A change nobody sent (a button on the device,
/// its own app, a schedule inside it) has no actor.
#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum Actor {
    /// `client` is the app it came from: `web`, `desktop` or `android`.
    User { id: String, name: String, client: Option<String> },
    Automation { id: String, name: String },
    ScreenSync,
}

impl Actor {
    /// A person, with the app named by the `X-Domus-Client` header.
    pub fn user(user: &crate::api::middleware::AuthUser, headers: &axum::http::HeaderMap) -> Self {
        let client = headers
            .get("x-domus-client")
            .and_then(|v| v.to_str().ok())
            .filter(|c| matches!(*c, "web" | "desktop" | "android"))
            .map(str::to_string);
        Self::User { id: user.id.clone(), name: user.username.clone(), client }
    }
}

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
        #[serde(skip)]
        actor: Option<Actor>,
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
        #[serde(skip_serializing_if = "Option::is_none")]
        code: Option<String>,
        #[serde(skip_serializing_if = "Option::is_none")]
        params: Option<serde_json::Value>,
        /// Not sent to the live stream of anyone but administrators.
        #[serde(skip)]
        admin_only: bool,
    },
    /// A notification was read or deleted: clients reload their inbox.
    NotificationsChanged,
    AutomationTriggered {
        automation_id: String,
        name: String,
    },
    /// New outdoor weather at the home's location.
    WeatherChanged {
        weather: crate::modules::weather::Weather,
        /// Used for edge-triggered weather automations.
        #[serde(skip)]
        previous: Option<crate::modules::weather::Weather>,
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
