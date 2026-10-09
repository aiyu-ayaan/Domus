//! Simulated devices for development and demos (`integrations.virtual.enabled`).

use home_core::{
    CoreError, DeviceCommand, DeviceContext, DeviceState, DeviceType, DiscoveredDevice,
    IntegrationPlugin, IntegrationType, PolledState, Result,
};
use rand::Rng;
use serde_json::json;
use std::collections::HashMap;
use tokio::sync::Mutex;

pub struct VirtualIntegration {
    states: Mutex<HashMap<String, DeviceState>>,
}

const DEVICES: &[(&str, &str, DeviceType, &str)] = &[
    ("v-plug-1", "Desk Smart Plug", DeviceType::Plug, "Virtual Plug Pro"),
    ("v-switch-1", "Living Room Switch", DeviceType::Switch, "Virtual Switch"),
    ("v-light-1", "Bedroom Lamp", DeviceType::Light, "Virtual Bulb"),
    ("v-purifier-1", "Air Purifier", DeviceType::AirPurifier, "Virtual Purifier 4"),
    ("v-sensor-1", "Climate Sensor", DeviceType::Sensor, "Virtual TH Sensor"),
];

impl Default for VirtualIntegration {
    fn default() -> Self {
        Self::new()
    }
}

impl VirtualIntegration {
    pub fn new() -> Self {
        Self { states: Mutex::new(HashMap::new()) }
    }

    fn initial(kind: DeviceType) -> DeviceState {
        let mut s = DeviceState::default();
        match kind {
            DeviceType::Plug | DeviceType::Switch => s.is_on = Some(true),
            DeviceType::Light => {
                s.is_on = Some(false);
                s.brightness = Some(70);
                s.color_temp = Some(40);
            }
            DeviceType::AirPurifier => {
                s.is_on = Some(true);
                s.fan_speed = Some("2".into());
                s.mode = Some("auto".into());
                s.filter_life = Some(82.0);
                s.options.insert("fan_speed".into(), vec!["1".into(), "2".into(), "3".into()]);
                s.options.insert("mode".into(), vec!["auto".into(), "sleep".into(), "manual".into()]);
            }
            _ => {}
        }
        s
    }

    fn tick(kind: DeviceType, s: &mut DeviceState) {
        let mut rng = rand::thread_rng();
        let on = s.is_on.unwrap_or(false);
        match kind {
            DeviceType::Plug => {
                s.current_power_watts = Some(if on { rng.gen_range(85.0..140.0) } else { 0.0 });
                s.voltage = Some(rng.gen_range(228.0..234.0));
            }
            DeviceType::Switch => {
                s.current_power_watts = Some(if on { rng.gen_range(40.0..60.0) } else { 0.0 });
            }
            DeviceType::Light => {
                let b = s.brightness.unwrap_or(100) as f32;
                s.current_power_watts = Some(if on { 9.0 * b / 100.0 } else { 0.0 });
            }
            DeviceType::AirPurifier => {
                s.air_quality_pm25 = Some(if on { rng.gen_range(4.0..18.0) } else { rng.gen_range(25.0..60.0) });
                s.current_power_watts = Some(if on { rng.gen_range(12.0..30.0) } else { 0.5 });
            }
            DeviceType::Sensor => {
                s.temperature = Some(rng.gen_range(22.0..26.0));
                s.humidity = Some(rng.gen_range(40.0..55.0));
            }
            _ => {}
        }
    }
}

#[async_trait::async_trait]
impl IntegrationPlugin for VirtualIntegration {
    fn integration_type(&self) -> IntegrationType {
        IntegrationType::Virtual
    }

    async fn discover(&self, _: &[home_core::AccountContext]) -> Result<Vec<DiscoveredDevice>> {
        Ok(DEVICES
            .iter()
            .map(|(id, name, kind, model)| DiscoveredDevice {
                external_id: id.to_string(),
                name: name.to_string(),
                device_type: *kind,
                model: Some(model.to_string()),
                ip_address: None,
                mac_address: None,
                account_id: None,
                online: true,
                config: json!({}),
                secrets: json!({}),
                note: None,
                state: None,
            })
            .collect())
    }

    async fn fetch_state(&self, device: &DeviceContext) -> Result<PolledState> {
        let mut states = self.states.lock().await;
        let s = states
            .entry(device.external_id.clone())
            .or_insert_with(|| Self::initial(device.device_type));
        Self::tick(device.device_type, s);
        Ok(PolledState { online: true, state: s.clone(), ip_address: None })
    }

    async fn send_command(&self, device: &DeviceContext, command: &DeviceCommand) -> Result<()> {
        if device.device_type == DeviceType::Sensor {
            return Err(CoreError::Unsupported("sensors are read-only".into()));
        }
        let mut states = self.states.lock().await;
        let s = states
            .entry(device.external_id.clone())
            .or_insert_with(|| Self::initial(device.device_type));
        command.apply_to(s);
        Ok(())
    }
}
