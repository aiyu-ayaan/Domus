//! MQTT integration. A linked account is a broker; devices are whatever announces
//! itself there through Home Assistant MQTT discovery (Zigbee2MQTT, ESPHome, ...).
//! The broker pushes state, so polling only reads the cache kept here.

pub mod discovery;

use home_core::{
    integration_err, AccountContext, CoreError, DeviceCommand, DeviceContext, DiscoveredDevice,
    IntegrationPlugin, IntegrationType, PolledState, Result,
};
use rumqttc::{AsyncClient, Event, EventLoop, MqttOptions, Packet, QoS, Transport};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::{Arc, Mutex as StdMutex};
use std::time::Duration;
use tokio::sync::Mutex;

const DISCOVERY_TOPIC: &str = "homeassistant/#";

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Broker {
    pub host: String,
    pub port: u16,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
}

#[derive(Default)]
struct Cache {
    connected: bool,
    /// Discovery topic -> expanded entity config.
    configs: HashMap<String, Value>,
    /// State topic -> last payload.
    payloads: HashMap<String, String>,
    subscribed: HashSet<String>,
}

struct Link {
    broker: Broker,
    client: AsyncClient,
    cache: Arc<StdMutex<Cache>>,
    task: tokio::task::JoinHandle<()>,
}

impl Drop for Link {
    fn drop(&mut self) {
        self.task.abort();
    }
}

fn options(broker: &Broker, client_id: &str) -> MqttOptions {
    let mut o = MqttOptions::new(client_id, &broker.host, broker.port);
    o.set_keep_alive(Duration::from_secs(30));
    // The default of 10 KB is smaller than some discovery payloads.
    o.set_max_packet_size(256 * 1024, 256 * 1024);
    if !broker.username.is_empty() {
        o.set_credentials(&broker.username, &broker.password);
    }
    if broker.port == 8883 {
        o.set_transport(Transport::tls_with_default_config());
    }
    o
}

/// Connect once to prove the address and login work, before the broker is saved.
pub async fn check(broker: &Broker) -> Result<()> {
    let id = format!("domus-check-{}", &uuid::Uuid::new_v4().simple().to_string()[..8]);
    let (_client, mut eventloop) = AsyncClient::new(options(broker, &id), 10);
    loop {
        match tokio::time::timeout(Duration::from_secs(5), eventloop.poll()).await {
            Ok(Ok(Event::Incoming(Packet::ConnAck(_)))) => return Ok(()),
            Ok(Ok(_)) => {}
            Ok(Err(e)) => return Err(integration_err(format!("Could not connect to the MQTT broker: {e}"))),
            Err(_) => return Err(integration_err("The MQTT broker did not answer")),
        }
    }
}

/// The event loop has to keep turning for a subscribe to go out, so it is sent from a task of its own.
fn subscribe(client: &AsyncClient, topic: String) {
    let client = client.clone();
    tokio::spawn(async move {
        let _ = client.subscribe(topic, QoS::AtMostOnce).await;
    });
}

async fn run(client: AsyncClient, mut eventloop: EventLoop, cache: Arc<StdMutex<Cache>>) {
    loop {
        match eventloop.poll().await {
            Ok(Event::Incoming(Packet::ConnAck(_))) => {
                let mut c = cache.lock().unwrap();
                c.connected = true;
                // A new session has no subscriptions; the retained configs come again and restore them.
                c.subscribed.clear();
                subscribe(&client, DISCOVERY_TOPIC.into());
            }
            Ok(Event::Incoming(Packet::Publish(p))) => {
                let payload = String::from_utf8_lossy(&p.payload).into_owned();
                let mut c = cache.lock().unwrap();
                if !p.topic.starts_with("homeassistant/") {
                    c.payloads.insert(p.topic, payload);
                    continue;
                }
                let Some(component) = p.topic.strip_suffix("/config").and_then(|t| t.split('/').nth(1)) else { continue };
                match serde_json::from_str::<Value>(&payload).ok().and_then(|v| discovery::expand(component, &v)) {
                    Some(cfg) => {
                        for t in discovery::topics(&cfg) {
                            if c.subscribed.insert(t.clone()) {
                                subscribe(&client, t);
                            }
                        }
                        c.configs.insert(p.topic, cfg);
                    }
                    // An empty payload takes the entity away.
                    None => drop(c.configs.remove(&p.topic)),
                }
            }
            Ok(_) => {}
            Err(e) => {
                cache.lock().unwrap().connected = false;
                tracing::debug!("MQTT connection lost: {e}; retrying in 5s");
                tokio::time::sleep(Duration::from_secs(5)).await;
            }
        }
    }
}

#[derive(Default)]
pub struct MqttIntegration {
    /// Account id -> its broker connection.
    links: Mutex<HashMap<String, Arc<Link>>>,
}

impl MqttIntegration {
    pub fn new() -> Self {
        Self::default()
    }

    /// The connection for an account, opened on first use. The flag tells a new one apart.
    async fn link(&self, account: &AccountContext) -> Result<(Arc<Link>, bool)> {
        let broker: Broker = serde_json::from_value(account.credentials.clone())
            .map_err(|e| CoreError::Internal(format!("bad MQTT broker settings: {e}")))?;
        let mut links = self.links.lock().await;
        if let Some(l) = links.get(&account.id).filter(|l| l.broker == broker) {
            return Ok((l.clone(), false));
        }
        let id = format!("domus-{}", account.id.get(..8).unwrap_or(&account.id));
        let (client, eventloop) = AsyncClient::new(options(&broker, &id), 64);
        let cache = Arc::<StdMutex<Cache>>::default();
        let task = tokio::spawn(run(client.clone(), eventloop, cache.clone()));
        let link = Arc::new(Link { broker, client, cache, task });
        links.insert(account.id.clone(), link.clone());
        Ok((link, true))
    }

    async fn link_of(&self, device: &DeviceContext) -> Result<Arc<Link>> {
        let account = device
            .account
            .as_ref()
            .ok_or_else(|| CoreError::AuthError("MQTT broker was removed".into()))?;
        Ok(self.link(account).await?.0)
    }
}

#[async_trait::async_trait]
impl IntegrationPlugin for MqttIntegration {
    fn integration_type(&self) -> IntegrationType {
        IntegrationType::Mqtt
    }

    async fn discover(&self, accounts: &[AccountContext]) -> Result<Vec<DiscoveredDevice>> {
        let mut fresh = false;
        let mut links = Vec::new();
        for a in accounts {
            let (link, new) = self.link(a).await?;
            fresh |= new;
            links.push((a, link));
        }
        self.links.lock().await.retain(|id, _| accounts.iter().any(|a| &a.id == id));
        if fresh {
            // Retained discovery configs and states arrive right after connecting.
            tokio::time::sleep(Duration::from_secs(3)).await;
        }
        let mut out = Vec::new();
        for (account, link) in links {
            let c = link.cache.lock().unwrap();
            if !c.connected {
                return Err(integration_err(format!("MQTT broker {} is unreachable", link.broker.host)));
            }
            let get = |t: &str| c.payloads.get(t).cloned();
            for f in discovery::devices(c.configs.values()) {
                let mut state = Default::default();
                discovery::apply_state(&f.config, &get, &mut state);
                out.push(DiscoveredDevice {
                    external_id: f.external_id,
                    name: f.name,
                    device_type: f.device_type,
                    model: f.model,
                    ip_address: None,
                    mac_address: None,
                    account_id: Some(account.id.clone()),
                    online: discovery::online(&f.config, &get),
                    config: f.config,
                    secrets: json!({}),
                    note: None,
                    state: Some(state),
                });
            }
        }
        Ok(out)
    }

    async fn fetch_state(&self, device: &DeviceContext) -> Result<PolledState> {
        let link = self.link_of(device).await?;
        let c = link.cache.lock().unwrap();
        let get = |t: &str| c.payloads.get(t).cloned();
        let mut state = device.state.clone();
        discovery::apply_state(&device.config, &get, &mut state);
        Ok(PolledState {
            online: c.connected && discovery::online(&device.config, &get),
            state,
            ip_address: None,
        })
    }

    async fn send_command(&self, device: &DeviceContext, command: &DeviceCommand) -> Result<()> {
        let link = self.link_of(device).await?;
        if !link.cache.lock().unwrap().connected {
            return Err(integration_err("MQTT broker is offline"));
        }
        let messages = discovery::commands(&device.config, command);
        if messages.is_empty() {
            return Err(CoreError::Unsupported("this device does not support that command".into()));
        }
        for (topic, payload) in messages {
            link.client.publish(topic, QoS::AtLeastOnce, false, payload).await.map_err(integration_err)?;
        }
        Ok(())
    }
}
