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
    /// Ordered usage slabs per billing cycle; empty = flat `rate_per_kwh`.
    #[sqlx(json)]
    #[serde(default)]
    pub slabs: Vec<Slab>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct Slab {
    /// Upper bound of this slab in kWh (units); `None` = everything above.
    pub up_to_kwh: Option<f64>,
    pub rate: f64,
}

impl ElectricitySettings {
    /// Energy charge for `kwh` units used in one billing cycle.
    pub fn energy_cost(&self, kwh: f64) -> f64 {
        if self.slabs.is_empty() {
            return kwh * self.rate_per_kwh;
        }
        let (mut cost, mut floor) = (0.0, 0.0);
        for slab in &self.slabs {
            let top = slab.up_to_kwh.unwrap_or(f64::INFINITY);
            cost += (kwh.min(top) - floor).max(0.0) * slab.rate;
            if kwh <= top {
                return cost;
            }
            floor = top;
        }
        // Past the last bounded slab: bill the rest at its rate.
        cost + (kwh - floor) * self.slabs.last().map_or(0.0, |s| s.rate)
    }
}

impl Default for ElectricitySettings {
    fn default() -> Self {
        Self {
            rate_per_kwh: 0.15,
            currency: "USD".into(),
            monthly_budget: None,
            billing_cycle_day: 1,
            fixed_monthly_charge: 0.0,
            slabs: vec![],
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
        "SELECT rate_per_kwh, currency, monthly_budget, billing_cycle_day, fixed_monthly_charge, slabs FROM electricity_settings LIMIT 1",
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
    if req.currency.trim().len() != 3 || !req.currency.trim().chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(ApiError::BadRequest("Currency must be a 3-letter ISO code".into()));
    }
    let mut prev = 0.0;
    for (i, slab) in req.slabs.iter().enumerate() {
        if slab.rate < 0.0 {
            return Err(ApiError::BadRequest("Rates cannot be negative".into()));
        }
        match slab.up_to_kwh {
            Some(top) if top <= prev => {
                return Err(ApiError::BadRequest("Each slab must end above the previous one".into()))
            }
            Some(top) => prev = top,
            None if i + 1 != req.slabs.len() => {
                return Err(ApiError::BadRequest("Only the last slab can be open-ended".into()))
            }
            None => {}
        }
    }
    let mut tx = s.pool.begin().await?;
    sqlx::query("DELETE FROM electricity_settings").execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO electricity_settings (id, rate_per_kwh, currency, monthly_budget, billing_cycle_day, fixed_monthly_charge, slabs, updated_at)
         VALUES ('default', ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(req.rate_per_kwh)
    .bind(req.currency.trim().to_uppercase())
    .bind(req.monthly_budget.filter(|b| *b > 0.0))
    .bind(req.billing_cycle_day)
    .bind(req.fixed_monthly_charge)
    .bind(sqlx::types::Json(&req.slabs))
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
                cost: 0.0,
            })
        })
        .collect();
    usage.sort_by(|a, b| b.kwh.total_cmp(&a.kwh));

    let visible: Vec<&String> = devices.iter().map(|d| &d.id).collect();
    // `+ 0.0` turns the empty-sum `-0.0` into `0.0`.
    let sum = |m: &HashMap<String, f64>| m.iter().filter(|(k, _)| visible.contains(k)).map(|(_, v)| v).sum::<f64>() + 0.0;
    let cycle_kwh = sum(&cycle);
    let today_kwh = sum(&today_map);

    // Days elapsed including a fraction of today, so early-cycle projections stay sane.
    let elapsed = (now - local_midnight(cycle_start)).num_minutes() as f64 / 1440.0;
    let projected_kwh = if elapsed > 0.25 { cycle_kwh / elapsed * cycle_days as f64 } else { cycle_kwh };
    let energy_cost = settings.energy_cost(cycle_kwh);
    let cycle_cost = energy_cost + settings.fixed_monthly_charge;
    let projected_cost = settings.energy_cost(projected_kwh) + settings.fixed_monthly_charge;
    // Today's units are the latest in the cycle, so they sit in the highest slabs reached.
    let today_cost = energy_cost - settings.energy_cost((cycle_kwh - today_kwh).max(0.0));
    // Devices share the cycle's energy charge at the average rate.
    let avg_rate = if cycle_kwh > 0.0 { energy_cost / cycle_kwh } else { settings.energy_cost(1.0) };
    for u in &mut usage {
        u.cost = u.kwh * avg_rate;
    }

    Ok(Json(Overview {
        current_watts: usage.iter().map(|u| u.current_watts).sum::<f64>() + 0.0,
        today_kwh,
        today_cost,
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
    // shortcut: slabs priced at the range's average rate, exact only for a month-long range.
    let total: f64 = points.iter().map(|p| p.kwh).sum();
    let rate = if total > 0.0 { settings.energy_cost(total) / total } else { settings.energy_cost(1.0) };
    for p in &mut points {
        p.cost = p.kwh * rate;
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

    fn with(slabs: &[(Option<f64>, f64)]) -> ElectricitySettings {
        ElectricitySettings {
            slabs: slabs.iter().map(|&(up_to_kwh, rate)| Slab { up_to_kwh, rate }).collect(),
            ..Default::default()
        }
    }

    #[test]
    fn slab_costs() {
        let s = with(&[(Some(100.0), 5.0), (Some(300.0), 10.0), (None, 15.0)]);
        assert_eq!(s.energy_cost(0.0), 0.0);
        assert_eq!(s.energy_cost(50.0), 250.0);
        assert_eq!(s.energy_cost(150.0), 500.0 + 500.0);
        assert_eq!(s.energy_cost(400.0), 500.0 + 2000.0 + 1500.0);
        // No open-ended slab: the last rate continues.
        assert_eq!(with(&[(Some(100.0), 5.0)]).energy_cost(120.0), 600.0);
        // Flat rate when no slabs.
        assert!((with(&[]).energy_cost(10.0) - 1.5).abs() < 1e-9);
    }
}
