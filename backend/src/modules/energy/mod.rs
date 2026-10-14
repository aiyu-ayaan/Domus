//! Energy monitoring and the electricity bill.
//!
//! The poll loop writes a sample per metered device every minute with the
//! energy used since the previous sample, so sums over `energy_kwh` are exact while the server
//! was polling. Devices with their own daily meter (Tapo) also get catch-up rows for the time it
//! was not (`catch_up_rows`), so every "today" figure matches the meter.

use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::modules::devices::service::visible_devices;
use axum::{
    extract::{Query, State},
    routing::get,
    Json, Router,
};
use chrono::{DateTime, Datelike, Duration, FixedOffset, Local, NaiveDate, NaiveDateTime, TimeZone, Timelike, Utc};
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
    /// Windows of the day whose units cost more or less than the rate above. They must not overlap.
    #[sqlx(json)]
    #[serde(default)]
    pub time_of_use: Vec<TimeOfUse>,
    /// Devices that measure solar generation: counted as production, never as consumption.
    #[sqlx(json)]
    #[serde(default)]
    pub solar_device_ids: Vec<String>,
    /// "net": exported units offset imported ones; "feed_in": they are paid at `export_rate`.
    #[serde(default = "net")]
    pub export_mode: String,
    #[serde(default)]
    pub export_rate: f64,
}

fn net() -> String {
    "net".into()
}

/// Energy through the grid connection, from metered use and solar generation per quarter hour.
/// shortcut: only metered devices count as use, so with unmetered loads the export is overstated; add a
/// whole-home meter device when that matters.
#[derive(Debug, Default, Clone, Copy, PartialEq, Serialize)]
pub struct Flows {
    pub generated_kwh: f64,
    pub self_used_kwh: f64,
    pub imported_kwh: f64,
    pub exported_kwh: f64,
}

impl Flows {
    /// `quarters` holds (use, generation) in kWh per quarter hour.
    pub fn from_quarters(quarters: impl IntoIterator<Item = (f64, f64)>) -> Self {
        quarters.into_iter().fold(Self::default(), |mut f, (used, made)| {
            f.generated_kwh += made;
            f.self_used_kwh += used.min(made);
            f.imported_kwh += (used - made).max(0.0);
            f.exported_kwh += (made - used).max(0.0);
            f
        })
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub struct TimeOfUse {
    /// "HH:MM" on the home's clock. A window that ends before it starts runs past midnight.
    pub start: String,
    pub end: String,
    /// Added to the price of each kWh used in the window; negative for a cheaper one.
    pub adjust: f64,
}

impl TimeOfUse {
    fn contains(&self, minute: u32) -> bool {
        let (Some(start), Some(end)) = (home_core::parse_hhmm(&self.start), home_core::parse_hhmm(&self.end)) else { return false };
        if start < end { (start..end).contains(&minute) } else { minute >= start || minute < end }
    }
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

    /// What a kWh used at `t` costs on top of [energy_cost], from the time-of-use windows.
    pub fn time_adjust(&self, t: DateTime<Local>) -> f64 {
        let minute = t.hour() * 60 + t.minute();
        self.time_of_use.iter().find(|w| w.contains(minute)).map_or(0.0, |w| w.adjust)
    }

    /// The time-of-use charge (it can be negative) of each `(device, quarter hour)` since `from`.
    /// Empty without windows, so a plain tariff costs no query.
    async fn time_charges(&self, pool: &SqlitePool, from: DateTime<Utc>) -> ApiResult<Vec<(String, DateTime<Utc>, f64)>> {
        if self.time_of_use.is_empty() {
            return Ok(vec![]);
        }
        let rows: Vec<(String, String, i64, f64)> = sqlx::query_as(
            "SELECT device_id, substr(recorded_at, 1, 13) AS h, CAST(substr(recorded_at, 15, 2) AS INTEGER) / 15 AS q, SUM(energy_kwh)
             FROM energy_metrics WHERE recorded_at >= ? GROUP BY device_id, h, q",
        )
        .bind(from)
        .fetch_all(pool)
        .await?;
        Ok(rows
            .into_iter()
            .filter_map(|(device, hour, part, kwh)| {
                let t = utc_group(&hour, part * 15)?;
                Some((device, t, kwh * self.time_adjust(t.with_timezone(&Local))))
            })
            .collect())
    }
}

/// When a SQL group `(hour "YYYY-MM-DDTHH", minutes into it)` began.
fn utc_group(hour: &str, minutes: i64) -> Option<DateTime<Utc>> {
    let naive = NaiveDateTime::parse_from_str(&format!("{}:00:00", hour.replace(' ', "T")), "%Y-%m-%dT%H:%M:%S").ok()?;
    Some(Utc.from_utc_datetime(&naive) + Duration::minutes(minutes))
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
            time_of_use: vec![],
            solar_device_ids: vec![],
            export_mode: net(),
            export_rate: 0.0,
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
        "SELECT rate_per_kwh, currency, monthly_budget, billing_cycle_day, fixed_monthly_charge, slabs, time_of_use, solar_device_ids, export_mode, export_rate
         FROM electricity_settings LIMIT 1",
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
    if req.rate_per_kwh < 0.0 || req.fixed_monthly_charge < 0.0 || req.export_rate < 0.0 {
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
    let mut taken = [false; 24 * 60];
    for window in &req.time_of_use {
        let (Some(start), Some(end)) = (home_core::parse_hhmm(&window.start), home_core::parse_hhmm(&window.end)) else {
            return Err(ApiError::BadRequest("Time-of-use windows need a start and an end as HH:MM".into()));
        };
        if start == end {
            return Err(ApiError::BadRequest("A time-of-use window cannot start and end at the same time".into()));
        }
        for minute in (0..24 * 60).filter(|m| window.contains(*m)) {
            if std::mem::replace(&mut taken[minute as usize], true) {
                return Err(ApiError::BadRequest("Time-of-use windows cannot overlap".into()));
            }
        }
    }
    if !matches!(req.export_mode.as_str(), "net" | "feed_in") {
        return Err(ApiError::BadRequest("Exported units are either netted or paid at a rate".into()));
    }
    let mut tx = s.pool.begin().await?;
    sqlx::query("DELETE FROM electricity_settings").execute(&mut *tx).await?;
    sqlx::query(
        "INSERT INTO electricity_settings (id, rate_per_kwh, currency, monthly_budget, billing_cycle_day, fixed_monthly_charge, slabs, time_of_use,
             solar_device_ids, export_mode, export_rate, updated_at)
         VALUES ('default', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(req.rate_per_kwh)
    .bind(req.currency.trim().to_uppercase())
    .bind(req.monthly_budget.filter(|b| *b > 0.0))
    .bind(req.billing_cycle_day)
    .bind(req.fixed_monthly_charge)
    .bind(sqlx::types::Json(&req.slabs))
    .bind(sqlx::types::Json(&req.time_of_use))
    .bind(sqlx::types::Json(&req.solar_device_ids))
    .bind(&req.export_mode)
    .bind(req.export_rate)
    .bind(Utc::now())
    .execute(&mut *tx)
    .await?;
    tx.commit().await?;
    Ok(Json(load_settings(&s.pool).await))
}

pub fn local_midnight(d: NaiveDate) -> DateTime<Local> {
    Local
        .from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap())
        .earliest()
        .unwrap_or_else(Local::now)
}

/// The buckets of a history range, laid out on the viewer's clock.
pub struct Buckets {
    /// Where each bucket begins, with the viewer's UTC offset at that moment.
    starts: Vec<DateTime<FixedOffset>>,
    sql_minutes: i64,
}

impl Buckets {
    /// `range` is "hour" (60 one-minute buckets), "day" (24 hours), "week" (7 days), "month" (30 days) or
    /// "hours" (every hour of the last 7 days, for a day-by-hour grid), ending at `now`. `tz` is the viewer's IANA zone ("Asia/Kolkata"), so days start at their midnight
    /// across DST changes too; without a known one the server's zone is used.
    pub fn new(range: Option<&str>, tz: Option<&str>, now: DateTime<Utc>) -> Self {
        match tz.and_then(|z| z.parse::<chrono_tz::Tz>().ok()) {
            Some(zone) => Self::in_zone(range, &zone, now),
            None => Self::in_zone(range, &Local, now),
        }
    }

    fn in_zone<Z: TimeZone>(range: Option<&str>, zone: &Z, now: DateTime<Utc>) -> Self {
        let now = now.with_timezone(zone);
        let minute = now.with_second(0).and_then(|t| t.with_nanosecond(0)).unwrap_or_else(|| now.clone());
        let hour = minute.with_minute(0).unwrap_or_else(|| minute.clone());
        // Midnight `days` ago. Where a DST jump skips midnight the day starts at the same wall time read as UTC.
        let midnight = |days: i64| {
            let naive = (now.date_naive() - Duration::days(days)).and_hms_opt(0, 0, 0).unwrap();
            zone.from_local_datetime(&naive).earliest().unwrap_or_else(|| zone.from_utc_datetime(&naive))
        };
        let starts: Vec<DateTime<Z>> = match range {
            Some("hour") => (0..60).rev().map(|i| minute.clone() - Duration::minutes(i)).collect(),
            Some("week") => (0..7).rev().map(midnight).collect(),
            Some("month") => (0..30).rev().map(midnight).collect(),
            Some("hours") => (0..).map(|i| midnight(6) + Duration::hours(i)).take_while(|t| *t <= hour).collect(),
            _ => (0..24).rev().map(|i| hour.clone() - Duration::hours(i)).collect(),
        };
        Self { starts: starts.iter().map(DateTime::fixed_offset).collect(), sql_minutes: if range == Some("hour") { 1 } else { 15 } }
    }

    pub fn count(&self) -> usize {
        self.starts.len()
    }

    pub fn start(&self) -> DateTime<Utc> {
        self.starts[0].with_timezone(&Utc)
    }

    /// Minutes per SQL group. Samples are grouped this fine in UTC and regrouped with `index`;
    /// quarters keep half-hour and 45-minute time zones (India, Nepal) exact.
    pub fn sql_minutes(&self) -> i64 {
        self.sql_minutes
    }

    /// When a SQL group `(hour "YYYY-MM-DDTHH", part)` began.
    pub fn group_time(&self, hour: &str, part: i64) -> Option<DateTime<Utc>> {
        utc_group(hour, part * self.sql_minutes())
    }

    pub fn time(&self, i: usize) -> DateTime<FixedOffset> {
        self.starts[i]
    }

    /// The bucket holding `t`: the last one that began at or before it.
    pub fn index(&self, t: DateTime<Utc>) -> Option<usize> {
        self.starts.partition_point(|s| *s <= t).checked_sub(1)
    }
}

/// Id prefix of catch-up rows: they carry energy but no measured power.
pub const FILL_PREFIX: &str = "fill-";

/// Rows `(time, kWh)` that store `gap` kWh, which the device's meter counted today but no sample
/// recorded. It is spread over today's hours without any row in `sampled`: that is when the
/// server was not watching. With every hour covered it is small drift and goes to `now`.
pub fn catch_up_rows(gap: f64, sampled: &[DateTime<Local>], now: DateTime<Local>, midnight: DateTime<Local>) -> Vec<(DateTime<Local>, f64)> {
    // Under 10 Wh is rounding. Right after midnight the meter may still hold yesterday's total.
    if gap < 0.01 || now - midnight < Duration::minutes(15) {
        return vec![];
    }
    let hour = |t: DateTime<Local>| (t - midnight).num_hours();
    let empty: Vec<i64> = (0..=hour(now)).filter(|h| !sampled.iter().any(|t| hour(*t) == *h)).collect();
    if empty.is_empty() {
        return vec![(now, gap)];
    }
    let share = gap / empty.len() as f64;
    empty.iter().map(|h| ((midnight + Duration::hours(*h) + Duration::minutes(30)).min(now), share)).collect()
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
    /// The least it drew in any hour of the last week: what it costs even when nobody uses it.
    standby_watts: Option<f64>,
    /// That draw over 30 days, at the cycle's average rate.
    standby_monthly_cost: Option<f64>,
}

/// Below this a device counts as really off (plugs report a watt or so of noise).
const STANDBY_MIN_WATTS: f64 = 0.5;

/// Each device's lowest hourly average power over the last 7 days. Needs a day of well-sampled
/// hours, so a device added this morning has none yet.
async fn standby_by_device(pool: &SqlitePool) -> ApiResult<HashMap<String, f64>> {
    let rows: Vec<(String, f64)> = sqlx::query_as(
        "SELECT device_id, MIN(avg) FROM (
             SELECT device_id, AVG(power_watts) AS avg FROM energy_metrics WHERE recorded_at >= ?
             GROUP BY device_id, substr(recorded_at, 1, 13) HAVING COUNT(*) >= 10
         ) GROUP BY device_id HAVING COUNT(*) >= 24",
    )
    .bind(Utc::now() - Duration::days(7))
    .fetch_all(pool)
    .await?;
    Ok(rows.into_iter().filter(|(_, w)| *w >= STANDBY_MIN_WATTS).collect())
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
    /// Present when solar devices are set: generation and the grid flows it implies.
    solar: Option<Solar>,
}

#[derive(Serialize)]
struct Solar {
    current_watts: f64,
    today: Flows,
    cycle: Flows,
    /// What exported units earned this cycle (feed-in only; netted units lower the bill instead).
    cycle_credit: f64,
}

/// (use, generation) in kWh per quarter hour since `from`, keyed by when the quarter began.
async fn quarters(pool: &SqlitePool, from: DateTime<Utc>, users: &[&str], makers: &[&str]) -> ApiResult<Vec<(DateTime<Utc>, f64, f64)>> {
    let rows: Vec<(String, String, i64, f64)> = sqlx::query_as(
        "SELECT device_id, substr(recorded_at, 1, 13) AS h, CAST(substr(recorded_at, 15, 2) AS INTEGER) / 15 AS q, SUM(energy_kwh)
         FROM energy_metrics WHERE recorded_at >= ? GROUP BY device_id, h, q",
    )
    .bind(from)
    .fetch_all(pool)
    .await?;
    let mut by_time: HashMap<DateTime<Utc>, (f64, f64)> = HashMap::new();
    for (device, hour, part, kwh) in rows {
        let Some(t) = utc_group(&hour, part * 15) else { continue };
        if users.contains(&device.as_str()) {
            by_time.entry(t).or_default().0 += kwh;
        } else if makers.contains(&device.as_str()) {
            by_time.entry(t).or_default().1 += kwh;
        }
    }
    Ok(by_time.into_iter().map(|(t, (used, made))| (t, used, made)).collect())
}

async fn overview(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Overview>> {
    let settings = load_settings(&s.pool).await;
    let (solar_devices, devices): (Vec<_>, Vec<_>) =
        visible_devices(&s, &user).await?.into_iter().partition(|d| settings.solar_device_ids.contains(&d.id));
    let now = Local::now();
    let today = now.date_naive();
    let (cycle_start, cycle_days) = billing_cycle(today, settings.billing_cycle_day as u32);

    let cycle = kwh_by_device(&s.pool, local_midnight(cycle_start).with_timezone(&Utc)).await?;
    let today_map = kwh_by_device(&s.pool, local_midnight(today).with_timezone(&Utc)).await?;
    // Time-of-use charges of the cycle, of today, and per device.
    let (mut cycle_timed, mut today_timed, mut timed) = (0.0, 0.0, HashMap::<String, f64>::new());
    for (device, t, charge) in settings.time_charges(&s.pool, local_midnight(cycle_start).with_timezone(&Utc)).await? {
        if devices.iter().any(|d| d.id == device) {
            cycle_timed += charge;
            if t >= local_midnight(today) {
                today_timed += charge;
            }
            *timed.entry(device).or_default() += charge;
        }
    }

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
                standby_watts: None,
                standby_monthly_cost: None,
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
    // With solar, the bill is for the units bought from the grid (less the exported ones when netted).
    let mut solar = None;
    let (mut billed, mut billed_today, mut timed_share, mut credit, mut credit_today) = (cycle_kwh, today_kwh, 1.0, 0.0, 0.0);
    if !solar_devices.is_empty() {
        let users: Vec<&str> = devices.iter().map(|d| d.id.as_str()).collect();
        let makers: Vec<&str> = solar_devices.iter().map(|d| d.id.as_str()).collect();
        let rows = quarters(&s.pool, local_midnight(cycle_start).with_timezone(&Utc), &users, &makers).await?;
        let midnight = local_midnight(today).with_timezone(&Utc);
        let cycle = Flows::from_quarters(rows.iter().map(|r| (r.1, r.2)));
        let day = Flows::from_quarters(rows.iter().filter(|r| r.0 >= midnight).map(|r| (r.1, r.2)));
        let feed_in = settings.export_mode == "feed_in";
        let bill = |f: &Flows| if feed_in { f.imported_kwh } else { (f.imported_kwh - f.exported_kwh).max(0.0) };
        let paid = |f: &Flows| if feed_in { f.exported_kwh * settings.export_rate } else { 0.0 };
        (billed, billed_today, credit, credit_today) = (bill(&cycle), bill(&day), paid(&cycle), paid(&day));
        // shortcut: time-of-use charges follow the share of use that came from the grid, not each quarter's import.
        timed_share = if cycle_kwh > 0.0 { (cycle.imported_kwh / cycle_kwh).min(1.0) } else { 0.0 };
        let current_watts = solar_devices
            .iter()
            .filter(|d| d.is_online)
            .filter_map(|d| d.state().current_power_watts)
            .map(f64::from)
            .sum::<f64>()
            + 0.0;
        solar = Some(Solar { current_watts, today: day, cycle, cycle_credit: credit });
    }
    let energy_cost = settings.energy_cost(billed);
    let cycle_cost = energy_cost + cycle_timed * timed_share + settings.fixed_monthly_charge - credit;
    // The rest of the cycle is assumed to go like it has so far, at the same times of day.
    let scale = if cycle_kwh > 0.0 { projected_kwh / cycle_kwh } else { 1.0 };
    let projected_cost =
        settings.energy_cost(billed * scale) + cycle_timed * timed_share * scale + settings.fixed_monthly_charge - credit * scale;
    // Today's units are the latest in the cycle, so they sit in the highest slabs reached.
    let today_cost = energy_cost - settings.energy_cost((billed - billed_today).max(0.0)) + today_timed * timed_share - credit_today;
    // Devices share the cycle's energy charge at the average rate.
    let avg_rate = if cycle_kwh > 0.0 { energy_cost / cycle_kwh } else { settings.energy_cost(1.0) };
    let standby = standby_by_device(&s.pool).await?;
    for u in &mut usage {
        u.cost = u.kwh * avg_rate + timed.get(&u.device_id).copied().unwrap_or(0.0);
        if let Some(&w) = standby.get(&u.device_id) {
            u.standby_watts = Some(w);
            u.standby_monthly_cost = Some(w * 24.0 * 30.0 / 1000.0 * avg_rate);
        }
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
        solar,
    }))
}

#[derive(Deserialize)]
struct HistoryQuery {
    /// "hour" (60 one-minute points), "day" (24 hourly points), "week" (7 days), "month" (30 days)
    /// or "hours" (every hour of the last 7 days).
    range: Option<String>,
    /// The viewer's IANA time zone, so buckets follow their clock rather than the server's.
    tz: Option<String>,
    device_id: Option<String>,
}

#[derive(Serialize)]
struct Point {
    t: DateTime<FixedOffset>,
    kwh: f64,
    cost: f64,
    /// Average measured power in the bucket; `None` where nothing was measured.
    watts: Option<f64>,
    /// The highest power any poll read in the bucket, which the average hides.
    peak_watts: Option<f64>,
}

async fn history(State(s): State<AppState>, user: AuthUser, Query(q): Query<HistoryQuery>) -> ApiResult<Json<Vec<Point>>> {
    let settings = load_settings(&s.pool).await;
    let buckets = Buckets::new(q.range.as_deref(), q.tz.as_deref(), Utc::now());

    let visible: Vec<String> = visible_devices(&s, &user).await?.into_iter().map(|d| d.id).collect();
    if let Some(id) = &q.device_id {
        if !visible.contains(id) {
            return Err(ApiError::NotFound("Device not found".into()));
        }
    }

    // Fine UTC groups ("YYYY-MM-DDTHH", part of the hour), regrouped into the viewer's buckets below.
    let rows: Vec<(String, String, i64, f64, f64, i64, Option<f64>)> = sqlx::query_as(
        "SELECT device_id, substr(recorded_at, 1, 13) AS h, CAST(substr(recorded_at, 15, 2) AS INTEGER) / ?3 AS q,
                SUM(energy_kwh),
                COALESCE(SUM(CASE WHEN id NOT LIKE ?2 THEN power_watts END), 0.0),
                COUNT(CASE WHEN id NOT LIKE ?2 THEN 1 END),
                MAX(CASE WHEN id NOT LIKE ?2 THEN COALESCE(peak_watts, power_watts) END)
         FROM energy_metrics WHERE recorded_at >= ?1 GROUP BY device_id, h, q",
    )
    .bind(buckets.start())
    .bind(format!("{FILL_PREFIX}%"))
    .bind(buckets.sql_minutes())
    .fetch_all(&s.pool)
    .await?;

    let mut points: Vec<Point> = (0..buckets.count()).map(|i| Point { t: buckets.time(i), kwh: 0.0, cost: 0.0, watts: None, peak_watts: None }).collect();
    // (bucket, device) -> sum and count of its measured power samples.
    let mut power: HashMap<(usize, String), (f64, i64)> = HashMap::new();
    // (bucket, SQL group) -> the devices' peaks in it, added up.
    // shortcut: devices are assumed to peak together within a group (1 or 15 minutes), so the home's peak
    // can read high; store a per-minute home total if it has to be exact.
    let mut peaks: HashMap<(usize, DateTime<Utc>), f64> = HashMap::new();

    for (device_id, hour, part, kwh, watts, samples, peak) in rows {
        // The home's use leaves out solar generation; one device asked for by id is shown as it is.
        if q.device_id.as_ref().map_or(!visible.contains(&device_id) || settings.solar_device_ids.contains(&device_id), |d| *d != device_id) {
            continue;
        }
        let Some((t, i)) = buckets.group_time(&hour, part).and_then(|t| Some((t, buckets.index(t)?))) else { continue };
        points[i].kwh += kwh;
        // Held in `cost` until the base rate is known below.
        points[i].cost += kwh * settings.time_adjust(t.with_timezone(&Local));
        if samples > 0 {
            let e = power.entry((i, device_id)).or_default();
            e.0 += watts;
            e.1 += samples;
        }
        if let Some(peak) = peak {
            *peaks.entry((i, t)).or_default() += peak;
        }
    }
    for ((i, _), peak) in peaks {
        points[i].peak_watts = Some(points[i].peak_watts.map_or(peak, |p| p.max(peak)));
    }
    // The home's power in a bucket is the sum of each device's average.
    for ((i, _), (watts, samples)) in power {
        *points[i].watts.get_or_insert(0.0) += watts / samples as f64;
    }
    // shortcut: slabs priced at the range's average rate, exact only for a month-long range.
    let total: f64 = points.iter().map(|p| p.kwh).sum();
    let rate = if total > 0.0 { settings.energy_cost(total) / total } else { settings.energy_cost(1.0) };
    for p in &mut points {
        p.cost += p.kwh * rate;
    }
    Ok(Json(points))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn history_buckets_follow_the_viewers_clock() {
        // 17:22 UTC is 22:52 in India (+05:30), whatever zone the server runs in.
        let now = Utc.with_ymd_and_hms(2026, 10, 11, 17, 22, 40).unwrap();
        let india = Some("Asia/Kolkata");
        let day = Buckets::new(Some("day"), india, now);
        assert_eq!(day.count(), 24);
        assert_eq!(day.time(23).to_rfc3339(), "2026-10-11T22:00:00+05:30");
        assert_eq!(day.index(now), Some(23));
        assert_eq!(day.index(day.group_time("2026-10-11T15", 2).unwrap()), Some(22)); // 15:30 UTC = 21:00 IST
        assert_eq!(day.index(now - Duration::hours(24)), None);
        let hour = Buckets::new(Some("hour"), india, now);
        assert_eq!((hour.count(), hour.sql_minutes()), (60, 1));
        assert_eq!(hour.time(59).to_rfc3339(), "2026-10-11T22:52:00+05:30");
        assert_eq!(hour.index(hour.group_time("2026-10-11 17", 22).unwrap()), Some(59));
        // Every hour from midnight six days ago up to the current one.
        let hours = Buckets::new(Some("hours"), india, now);
        assert_eq!((hours.count(), hours.sql_minutes()), (6 * 24 + 23, 15));
        assert_eq!(hours.time(0).to_rfc3339(), "2026-10-05T00:00:00+05:30");
        assert_eq!(hours.index(now), Some(hours.count() - 1));
        let week = Buckets::new(Some("week"), india, now);
        assert_eq!(week.time(0).to_rfc3339(), "2026-10-05T00:00:00+05:30");
        assert_eq!(week.index(now), Some(6));
        // Days stay midnight to midnight across the end of summer time (Berlin, 25 October 2026).
        let berlin = Buckets::new(Some("week"), Some("Europe/Berlin"), Utc.with_ymd_and_hms(2026, 10, 27, 12, 0, 0).unwrap());
        assert_eq!(berlin.time(0).to_rfc3339(), "2026-10-21T00:00:00+02:00");
        assert_eq!(berlin.time(6).to_rfc3339(), "2026-10-27T00:00:00+01:00");
        assert_eq!(berlin.index(Utc.with_ymd_and_hms(2026, 10, 25, 22, 30, 0).unwrap()), Some(4)); // 23:30 on the 25-hour day
        // An unknown zone falls back to the server's instead of failing.
        assert_eq!(Buckets::new(None, Some("Mars/Olympus"), now).count(), 24);
    }

    #[test]
    fn solar_splits_into_grid_flows() {
        // Morning: 0.3 used, 0.1 made. Noon: 0.2 used, 0.5 made. Night: 0.4 used.
        let f = Flows::from_quarters([(0.3, 0.1), (0.2, 0.5), (0.4, 0.0)]);
        let close = |a: f64, b: f64| (a - b).abs() < 1e-9;
        assert!(close(f.generated_kwh, 0.6));
        assert!(close(f.self_used_kwh, 0.3));
        assert!(close(f.imported_kwh, 0.6));
        assert!(close(f.exported_kwh, 0.3));
    }

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
    fn catch_up_fills_unwatched_hours() {
        let midnight = local_midnight(NaiveDate::from_ymd_opt(2026, 10, 10).unwrap());
        let at = |h: i64, m: i64| midnight + Duration::hours(h) + Duration::minutes(m);
        // Sampled during 00:00-00:59 and 03:00-03:59, now 03:20: hours 1 and 2 were missed.
        let rows = catch_up_rows(3.0, &[at(0, 5), at(3, 10)], at(3, 20), midnight);
        assert_eq!(rows, vec![(at(1, 30), 1.5), (at(2, 30), 1.5)]);
        // The current hour is never dated in the future.
        assert_eq!(catch_up_rows(1.0, &[], at(0, 20), midnight), vec![(at(0, 20), 1.0)]);
        // Every hour covered: drift lands now.
        assert_eq!(catch_up_rows(0.02, &[at(0, 5), at(1, 5)], at(1, 40), midnight), vec![(at(1, 40), 0.02)]);
        // Rounding noise, a meter that is behind, and the minutes after midnight add nothing.
        assert!(catch_up_rows(0.005, &[], at(9, 0), midnight).is_empty());
        assert!(catch_up_rows(-1.0, &[], at(9, 0), midnight).is_empty());
        assert!(catch_up_rows(5.0, &[], at(0, 10), midnight).is_empty());
    }

    #[test]
    fn time_of_use_windows_adjust_the_price_of_their_hours() {
        let window = |start: &str, end: &str, adjust| TimeOfUse { start: start.into(), end: end.into(), adjust };
        let s = ElectricitySettings { time_of_use: vec![window("22:00", "06:00", -1.5), window("18:00", "22:00", 1.1)], ..Default::default() };
        let at = |h, m| Local.with_ymd_and_hms(2026, 10, 11, h, m, 0).unwrap();
        assert_eq!(s.time_adjust(at(23, 30)), -1.5);
        assert_eq!(s.time_adjust(at(5, 59)), -1.5); // past midnight
        assert_eq!(s.time_adjust(at(6, 0)), 0.0); // the end is not part of the window
        assert_eq!(s.time_adjust(at(18, 0)), 1.1);
        assert_eq!(s.time_adjust(at(12, 0)), 0.0);
        assert_eq!(with(&[]).time_adjust(at(23, 30)), 0.0);
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
