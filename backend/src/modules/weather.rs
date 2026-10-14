//! Outdoor weather and air at the home's location, from Open-Meteo (free, no key). Only the saved
//! location's coordinates leave the home, and nothing at all until an administrator saves one.

use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::{EventBus, SystemEvent};
use axum::{extract::State, routing::get, Json, Router};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::Value;
use sqlx::SqlitePool;
use std::sync::{LazyLock, RwLock};
use std::time::Duration;
use tokio::sync::Notify;

/// Open-Meteo updates the current values every 15 minutes (air quality hourly).
const EVERY: Duration = Duration::from_secs(30 * 60);
const RETRY: Duration = Duration::from_secs(5 * 60);

/// Properties a weather trigger or condition can compare.
pub const PROPERTIES: [&str; 4] = ["temperature", "humidity", "pm25", "us_aqi"];

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Weather {
    /// °C
    pub temperature: Option<f64>,
    /// %
    pub humidity: Option<f64>,
    /// WMO weather code (0 clear, 1-3 cloudy, 45/48 fog, 51-67 rain, 71-77 snow, 80-82 showers, 95-99 storm).
    pub weather_code: Option<i64>,
    pub is_day: Option<bool>,
    /// µg/m³
    pub pm25: Option<f64>,
    pub us_aqi: Option<f64>,
    pub fetched_at: DateTime<Utc>,
}

impl Weather {
    pub fn property(&self, name: &str) -> Option<Value> {
        serde_json::to_value(self).ok()?.get(name).cloned().filter(|v| !v.is_null())
    }
}

static LATEST: LazyLock<RwLock<Option<Weather>>> = LazyLock::new(|| RwLock::new(None));
static REFRESH: LazyLock<Notify> = LazyLock::new(Notify::new);

pub fn latest() -> Option<Weather> {
    LATEST.read().ok()?.clone()
}

/// Fetch again now, e.g. because the location changed.
pub fn refresh() {
    REFRESH.notify_one();
}

pub fn weather_routes() -> Router<AppState> {
    Router::new().route("/", get(current))
}

/// The latest reading, or null without a location or before the first fetch.
async fn current(State(_): State<AppState>, _user: AuthUser) -> Json<Option<Weather>> {
    Json(latest())
}

async fn fetch(latitude: f64, longitude: f64) -> reqwest::Result<Weather> {
    let client = reqwest::Client::builder().timeout(Duration::from_secs(10)).build()?;
    let (lat, lon) = (latitude.to_string(), longitude.to_string());
    let forecast: Value = client
        .get("https://api.open-meteo.com/v1/forecast")
        .query(&[("latitude", lat.as_str()), ("longitude", lon.as_str()), ("current", "temperature_2m,relative_humidity_2m,weather_code,is_day")])
        .send()
        .await?
        .error_for_status()?
        .json()
        .await?;
    // Air quality is a separate service; the weather is still worth having without it.
    let air: Value = match client
        .get("https://air-quality-api.open-meteo.com/v1/air-quality")
        .query(&[("latitude", lat.as_str()), ("longitude", lon.as_str()), ("current", "pm2_5,us_aqi")])
        .send()
        .await
        .and_then(|r| r.error_for_status())
    {
        Ok(r) => r.json().await.unwrap_or(Value::Null),
        Err(e) => {
            tracing::debug!("outdoor air quality not reachable: {e}");
            Value::Null
        }
    };
    Ok(parse(&forecast, &air))
}

fn parse(forecast: &Value, air: &Value) -> Weather {
    let now = &forecast["current"];
    Weather {
        temperature: now["temperature_2m"].as_f64(),
        humidity: now["relative_humidity_2m"].as_f64(),
        weather_code: now["weather_code"].as_i64(),
        is_day: now["is_day"].as_i64().map(|d| d == 1),
        pm25: air["current"]["pm2_5"].as_f64(),
        us_aqi: air["current"]["us_aqi"].as_f64(),
        fetched_at: Utc::now(),
    }
}

pub async fn run(pool: SqlitePool, bus: EventBus) {
    loop {
        let wait = match crate::modules::server::location(&pool).await {
            None => {
                *LATEST.write().unwrap() = None;
                EVERY
            }
            Some((lat, lon)) => match fetch(lat, lon).await {
                Ok(weather) => {
                    let previous = LATEST.write().unwrap().replace(weather.clone());
                    bus.publish(SystemEvent::WeatherChanged { weather, previous });
                    EVERY
                }
                Err(e) => {
                    tracing::warn!("weather not reachable: {e}");
                    RETRY
                }
            },
        };
        tokio::select! {
            _ = tokio::time::sleep(wait) => {}
            _ = REFRESH.notified() => {}
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;

    #[test]
    fn reads_open_meteo_answers() {
        let forecast = json!({ "current": { "temperature_2m": 25.8, "relative_humidity_2m": 50, "weather_code": 0, "is_day": 0 } });
        let air = json!({ "current": { "pm2_5": 28.8, "us_aqi": 86 } });
        let w = parse(&forecast, &air);
        assert_eq!((w.temperature, w.humidity, w.weather_code, w.is_day), (Some(25.8), Some(50.0), Some(0), Some(false)));
        assert_eq!(w.property("pm25"), Some(json!(28.8)));
        assert_eq!(parse(&forecast, &Value::Null).pm25, None);
    }
}
