//! Light moods and effects, shared by every integration and client.
//!
//! * A **mood** is a still white setting (brightness + warmth). Any light can show it.
//! * An **effect** is a loop of colours the bulb plays by itself: each integration
//!   translates it into its native form (Tuya scene data, Tapo lighting effect), so
//!   nothing is streamed from the server while it runs.

use serde_json::{json, Value};

pub struct Mood {
    pub id: &'static str,
    pub name: &'static str,
    /// 1-100 %
    pub brightness: u8,
    /// 0-100 % (warm -> cold)
    pub color_temp: u8,
    /// What it looks like, for client previews.
    pub preview: &'static str,
}

pub struct Effect {
    pub id: &'static str,
    pub name: &'static str,
    /// Colours of the loop as (hue 0-360, saturation 0-100, value 0-100).
    pub colors: &'static [(u16, u8, u8)],
    /// Fade between colours instead of jumping.
    pub fade: bool,
    /// How long each colour takes, in tenths of a second.
    pub step: u16,
}

pub const MOODS: &[Mood] = &[
    Mood { id: "good_night", name: "Good Night", brightness: 15, color_temp: 0, preview: "#FFB46B" },
    Mood { id: "reading", name: "Reading", brightness: 100, color_temp: 55, preview: "#FFE9D6" },
    Mood { id: "working", name: "Working", brightness: 100, color_temp: 100, preview: "#DCE8FF" },
    Mood { id: "leisure", name: "Leisure", brightness: 50, color_temp: 30, preview: "#FFD3AE" },
];

/// At most 8: Tuya bulbs address a scene by a slot number 1-8, and an effect's
/// position here is its slot.
pub const EFFECTS: &[Effect] = &[
    Effect { id: "ocean", name: "Ocean", colors: &[(200, 100, 100), (220, 100, 100), (185, 90, 100), (240, 100, 80)], fade: true, step: 40 },
    Effect { id: "sunset", name: "Sunset", colors: &[(15, 100, 100), (35, 100, 100), (340, 80, 100), (280, 70, 80)], fade: true, step: 50 },
    Effect { id: "forest", name: "Forest", colors: &[(120, 100, 90), (95, 100, 100), (150, 90, 80), (75, 90, 100)], fade: true, step: 40 },
    Effect { id: "aurora", name: "Aurora", colors: &[(120, 100, 100), (170, 100, 100), (240, 100, 100), (280, 100, 100)], fade: true, step: 30 },
    Effect { id: "candle", name: "Candle", colors: &[(28, 100, 100), (24, 100, 60), (32, 95, 90), (22, 100, 45)], fade: true, step: 8 },
    Effect { id: "rainbow", name: "Rainbow", colors: &[(0, 100, 100), (45, 100, 100), (120, 100, 100), (180, 100, 100), (240, 100, 100), (300, 100, 100)], fade: true, step: 25 },
    Effect { id: "romance", name: "Romance", colors: &[(330, 80, 100), (350, 90, 100), (300, 60, 90)], fade: true, step: 45 },
    Effect { id: "party", name: "Party", colors: &[(0, 100, 100), (120, 100, 100), (240, 100, 100), (60, 100, 100), (300, 100, 100)], fade: false, step: 6 },
];

pub fn mood(id: &str) -> Option<&'static Mood> {
    MOODS.iter().find(|m| m.id == id)
}

/// The effect and its 1-based slot.
pub fn effect(id: &str) -> Option<(usize, &'static Effect)> {
    EFFECTS.iter().position(|e| e.id == id).map(|i| (i + 1, &EFFECTS[i]))
}

pub fn effect_ids() -> Vec<String> {
    EFFECTS.iter().map(|e| e.id.to_string()).collect()
}

/// The catalog as clients receive it: ids, names and preview colours.
pub fn catalog() -> Value {
    let hex = |&(h, s, v): &(u16, u8, u8)| {
        let (r, g, b) = crate::hsv_to_rgb(h as f64, s as f64 / 100.0, v as f64 / 100.0);
        crate::rgb_to_hex(r, g, b)
    };
    json!({
        "moods": MOODS.iter().map(|m| json!({
            "id": m.id, "name": m.name, "brightness": m.brightness, "color_temp": m.color_temp, "colors": [m.preview],
        })).collect::<Vec<_>>(),
        "effects": EFFECTS.iter().map(|e| json!({
            "id": e.id, "name": e.name, "colors": e.colors.iter().map(hex).collect::<Vec<_>>(),
        })).collect::<Vec<_>>(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn effects_fit_the_eight_tuya_slots_and_ids_are_unique() {
        assert!(EFFECTS.len() <= 8);
        let mut ids: Vec<_> = EFFECTS.iter().map(|e| e.id).chain(MOODS.iter().map(|m| m.id)).collect();
        ids.sort();
        ids.dedup();
        assert_eq!(ids.len(), EFFECTS.len() + MOODS.len());
        assert_eq!(effect("ocean").map(|(slot, _)| slot), Some(1));
        assert!(effect("good_night").is_none());
    }

    #[test]
    fn catalog_gives_clients_preview_colours() {
        let c = catalog();
        assert_eq!(c["effects"][0]["id"], "ocean");
        assert_eq!(c["effects"][5]["colors"][0], "#ff0000");
        assert_eq!(c["moods"][0]["color_temp"], 0);
    }
}
