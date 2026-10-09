//! Energy monitoring and the electricity bill.
//!
//! The poll loop writes a sample per metered device every minute with the
//! energy used since the previous sample, so sums over `energy_kwh` are exact.

use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::modules::devices::service::visible_devices;
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Datelike, Duration, Local, NaiveDate, NaiveDateTime, TimeZone, Timelike, Utc};
use serde::{Deserialize, Serialize};
use sqlx::SqlitePool;
use std::collections::HashMap;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ElectricitySettings {
    pub rate_per_kwh: f64,
    pub currency: String,
    pub monthly_budget: Option<f64>,
    pub billing_cycle_day: i64,
    pub fixed_monthly_charge: f64,
}

impl Default for ElectricitySettings {
    fn default() -> Self {
        Self {
            rate_per_kwh: 0.15,
            currency: "USD".into(),
            monthly_budget: None,
            billing_cycle_day: 1,
            fixed_monthly_charge: 0.0,
        }
    }
}

pub fn energy_routes() -> Router<AppState> {
    Router::new()
        .route("/overview", get(overview))
        .route("/history", get(history))
        .route("/settings", get(get_settings).put(put_settings))
}

pub async fn load_settings(pool: &SqlitePool) -> ElectricitySettings {
    sqlx::query_as(
        "SELECT rate_per_kwh, currency, monthly_budget, billing_cycle_day, fixed_monthly_charge FROM electricity_settings LIMIT 1",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .unwrap_or_default()
}

async fn get_settings(State(s): State<AppState>, _user: AuthUser) -> ApiResult<Json<ElectricitySettings>> {
    Ok(Json(load_settings(&s.pool).await))
}

async fn put_settings(
    State(s): State<AppState>,
    user: AuthUser,
    Json(req): Json<ElectricitySettings>,
) -> ApiResult<Json<ElectricitySettings>> {
    user.require_admin()?;
    if req.rate_per_kwh < 0.0 || req.fixed_monthly_charge < 0.0 {
        return Err(ApiError::BadRequest("Rates cannot be negative".into()));
    }
    if !(1..=28).contains(&req.billing_cycle_day) {
        return Err(ApiError::BadRequest("Billing day must be between 1 and 28".into()));
    }
    let mut tx = s.pool.begin().await?;
    sqlx::query("DELETE FROM electricity_settings").execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO electricity_settings (id, rate_per_kwh, currency, monthly_budget, billing_cycle_day, fixed_monthly_charge, updated_at)
         VALUES ('default', ?, ?, ?, ?, ?, ?)",
    )
    .bind(req.rate_per_kwh)
    .bind(req.currency.trim().to_uppercase())
    .bind(req.monthly_budget.filter(|b| *b > 0.0))
    .bind(req.billing_cycle_day)
    .bind(req.fixed_monthly_charge)
    .bind(Utc::now())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(load_settings(&s.pool).await))
}

fn local_midnight(d: NaiveDate) -> DateTime<Local> {
    Local
        .from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap())
        .earliest()
        .unwrap_or_else(Local::now)
}

/// Start of the current billing cycle and its length in days.
pub fn billing_cycle(today: NaiveDate, day: u32) -> (NaiveDate, i64) {
    let day = day.clamp(1, 28);
    let this_month = NaiveDate::from_ymd_opt(today.year(), today.month(), day).unwrap();
    let start = if today >= this_month {
        this_month
    } else {
        this_month - chrono::Months::new(1)
    };
    let end = start + chrono::Months::new(1);
    (start, (end - start).num_days())
}

/// Per-device energy (kWh) since `from`.
async fn kwh_by_device(pool: &SqlitePool, from: DateTime<Utc>) -> ApiResult<HashMap<String, f64>> {
    let rows: Vec<(String, f64)> = sqlx::query_as(
        "SELECT device_id, COALESCE(SUM(energy_kwh), 0) FROM energy_metrics WHERE recorded_at >= ? GROUP BY device_id",
    )
    .bind(from)
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().collect())
}

#[derive(Serialize)]
struct DeviceUsage {
    device_id: String,
    name: String,
    current_watts: f64,
    kwh: f64,
    cost: f64,
}

#[derive(Serialize)]
struct Overview {
    current_watts: f64,
    today_kwh: f64,
    today_cost: f64,
    cycle_start: NaiveDate,
    cycle_days: i64,
    cycle_day: i64,
    cycle_kwh: f64,
    cycle_cost: f64,
    projected_kwh: f64,
    projected_cost: f64,
    budget_used_percent: Option<f64>,
    settings: ElectricitySettings,
    devices: Vec<DeviceUsage>,
}

async fn overview(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Overview>> {
    let settings = load_settings(&s.pool).await;
    let devices = visible_devices(&s, &user).await?;
    let now = Local::now();
    let today = now.date_naive();
    let (cycle_start, cycle_days) = billing_cycle(today, settings.billing_cycle_day as u32);

    let cycle = kwh_by_device(&s.pool, local_midnight(cycle_start).with_timezone(&Utc)).await?;
    let today_map = kwh_by_device(&s.pool, local_midnight(today).with_timezone(&Utc)).await?;

    let mut usage: Vec<DeviceUsage> = devices
        .iter()
        .filter_map(|d| {
            let state = d.state();
            let kwh = cycle.get(&d.id).copied().unwrap_or(0.0);
            let watts = if d.is_online { state.current_power_watts.unwrap_or(0.0) as f64 } else { 0.0 };
            (state.current_power_watts.is_some() || kwh > 0.0).then(|| DeviceUsage {
                device_id: d.id.clone(),
                name: d.name.clone(),
                current_watts: watts,
                kwh,
                cost: kwh * settings.rate_per_kwh,
            })
        })
        .collect();
    usage.sort_by(|a, b| b.kwh.total_cmp(&a.kwh));

    let visible: Vec<&String> = devices.iter().map(|d| &d.id).collect();
    let sum = |m: &HashMap<String, f64>| m.iter().filter(|(k, _)| visible.contains(k)).map(|(_, v)| v).sum::<f64>();
    let cycle_kwh = sum(&cycle);
    let today_kwh = sum(&today_map);

    // Days elapsed including a fraction of today, so early-cycle projections stay sane.
    let elapsed = (now - local_midnight(cycle_start)).num_minutes() as f64 / 1440.0;
    let projected_kwh = if elapsed > 0.25 { cycle_kwh / elapsed * cycle_days as f64 } else { cycle_kwh };
    let cycle_cost = cycle_kwh * settings.rate_per_kwh + settings.fixed_monthly_charge;
    let projected_cost = projected_kwh * settings.rate_per_kwh + settings.fixed_monthly_charge;

    Ok(Json(Overview {
        current_watts: usage.iter().map(|u| u.current_watts).sum(),
        today_kwh,
        today_cost: today_kwh * settings.rate_per_kwh,
        cycle_start,
        cycle_days,
        cycle_day: (today - cycle_start).num_days() + 1,
        cycle_kwh,
        cycle_cost,
        projected_kwh,
        projected_cost,
        budget_used_percent: settings
            .monthly_budget
            .filter(|b| *b > 0.0)
            .map(|b| cycle_cost / b * 100.0),
        settings,
        devices: usage,
    }))
}

#[derive(Deserialize)]
struct HistoryQuery {
    /// "day" (24 hourly points), "week" (7 days) or "month" (30 days).
    range: Option<String>,
    device_id: Option<String>,
}

#[derive(Serialize)]
struct Point {
    t: DateTime<Local>,
    kwh: f64,
    cost: f64,
}

async fn history(State(s): State<AppState>, user: AuthUser, Query(q): Query<HistoryQuery>) -> ApiResult<Json<Vec<Point>>> {
    let settings = load_settings(&s.pool).await;
    let range = q.range.as_deref().unwrap_or("day");
    let now = Local::now();
    let hourly = range == "day";
    let (start, buckets) = match range {
        "week" => (local_midnight(now.date_naive() - Duration::days(6)), 7),
        "month" => (local_midnight(now.date_naive() - Duration::days(29)), 30),
        _ => {
            let h = now.with_minute(0).and_then(|t| t.with_second(0)).and_then(|t| t.with_nanosecond(0)).unwrap_or(now);
            (h - Duration::hours(23), 24)
        }
    };

    let visible: Vec<String> = visible_devices(&s, &user).await?.into_iter().map(|d| d.id).collect();
    if let Some(id) = &q.device_id {
        if !visible.contains(id) {
            return Err(ApiError::NotFound("Device not found".into()));
        }
    }

    // 15-minute UTC buckets ("YYYY-MM-DDTHH", quarter), regrouped into local
    // buckets below. Quarters keep half-hour time zones (e.g. IST) exact.
    let rows: Vec<(String, String, i64, f64)> = sqlx::query_as(
        "SELECT device_id, substr(recorded_at, 1, 13) AS h, CAST(substr(recorded_at, 15, 2) AS INTEGER) / 15 AS q,
                SUM(energy_kwh)
         FROM energy_metrics WHERE recorded_at >= ? GROUP BY device_id, h, q",
    )
    .bind(start.with_timezone(&Utc))
    .fetch_all(&s.pool)
    .await?;

    let mut points: Vec<Point> = (0..buckets)
        .map(|i| Point {
            t: if hourly { start + Duration::hours(i) } else { local_midnight(start.date_naive() + Duration::days(i)) },
            kwh: 0.0,
            cost: 0.0,
        })
        .collect();

    for (device_id, hour, quarter, kwh) in rows {
        if q.device_id.as_ref().map_or(!visible.contains(&device_id), |d| *d != device_id) {
            continue;
        }
        let Ok(naive) = NaiveDateTime::parse_from_str(&format!("{}:00:00", hour.replace(' ', "T")), "%Y-%m-%dT%H:%M:%S") else {
            continue;
        };
        let local = (Utc.from_utc_datetime(&naive) + Duration::minutes(quarter * 15)).with_timezone(&Local);
        let idx = if hourly {
            (local - start).num_hours()
        } else {
            (local.date_naive() - start.date_naive()).num_days()
        };
        if let Some(p) = usize::try_from(idx).ok().and_then(|i| points.get_mut(i)) {
            p.kwh += kwh;
        }
    }
    for p in &mut points {
        p.cost = p.kwh * settings.rate_per_kwh;
    }
    Ok(Json(points))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn billing_cycle_wraps_month() {
        let d = |y, m, day| NaiveDate::from_ymd_opt(y, m, day).unwrap();
        assert_eq!(billing_cycle(d(2026, 10, 9), 15), (d(2026, 9, 15), 30));
        assert_eq!(billing_cycle(d(2026, 10, 20), 15), (d(2026, 10, 15), 31));
        assert_eq!(billing_cycle(d(2026, 1, 3), 5), (d(2025, 12, 5), 31));
    }
}
