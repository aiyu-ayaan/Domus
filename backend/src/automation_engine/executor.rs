use super::actions::execute_action;
use super::conditions::evaluate_condition;
use super::triggers::evaluate_trigger;
use crate::infrastructure::event_bus::EventBus;
use home_core::Automation;
use std::sync::Arc;
use tokio::sync::RwLock;
use tracing::info;

pub struct AutomationExecutor {
    event_bus: EventBus,
    automations: Arc<RwLock<Vec<Automation>>>,
}

impl AutomationExecutor {
    pub fn new(event_bus: EventBus) -> Self {
        Self {
            event_bus,
            automations: Arc::new(RwLock::new(Vec::new())),
        }
    }

    pub async fn set_automations(&self, list: Vec<Automation>) {
        let mut w = self.automations.write().await;
        *w = list;
    }

    pub async fn run_loop(self: Arc<Self>) {
        let mut rx = self.event_bus.subscribe();
        while let Ok(event) = rx.recv().await {
            let automations = self.automations.read().await.clone();
            for auto in automations {
                if !auto.is_enabled {
                    continue;
                }

                let triggered = auto.triggers.iter().any(|t| evaluate_trigger(t, &event));
                if triggered {
                    let conditions_met = auto.conditions.iter().all(evaluate_condition);
                    if conditions_met {
                        info!("Automation '{}' triggered! Executing actions...", auto.name);
                        for action in &auto.actions {
                            if let Err(e) = execute_action(action).await {
                                tracing::error!("Failed to execute action: {}", e);
                            }
                        }
                    }
                }
            }
        }
    }
}
