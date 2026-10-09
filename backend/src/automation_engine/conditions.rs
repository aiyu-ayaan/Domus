use home_core::Condition;

pub fn evaluate_condition(condition: &Condition) -> bool {
    match condition {
        Condition::DeviceIsOn { .. } => true,
        Condition::TimeBetween { .. } => true,
        Condition::PowerExceeds { .. } => true,
    }
}
