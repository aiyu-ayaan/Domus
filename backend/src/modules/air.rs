//! Air quality history. The manager samples PM2.5 (with temperature and humidity
//! when the device has them) every few minutes; this serves it as a time series.

use crate::api::error::ApiResult;
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::modules::devices::service::visible_devices;
use axum::{extract::{Query, State}, routing::get, Json, Router};
use chrono::{DateTime, Duration, Local, NaiveDateTime, TimeZone, Timelike, Utc};
use serde::{Deserialize, Serialize};

pub fn air_routes() -> Router<AppState> {
    Router::new().route("/history", get(history))
}

#[derive(Deserialize)]
struct HistoryQuery {
    /// "day" (24 hourly points), "week" (7 days) or "month" (30 days).
    range: Option<String>,
    device_id: Option<String>,
}

/// Averages over one bucket; `None` where nothing was measured.
#[derive(Serialize, Default, Clone, PartialEq, Debug)]
struct Point {
    t: Option<DateTime<Local>>,
    pm25: Option<f64>,
    temperature: Option<f64>,
    humidity: Option<f64>,
}

/// Running (sum, count) per series of one bucket.
#[derive(Default, Clone)]
struct Acc([(f64, f64); 3]);

impl Acc {
    fn add(&mut self, i: usize, avg: Option<f64>, n: f64) {
        if let Some(v) = avg {
            self.0[i].0 += v * n;
            self.0[i].1 += n;
        }
    }
    fn mean(&self, i: usize) -> Option<f64> {
        (self.0[i].1 > 0.0).then(|| self.0[i].0 / self.0[i].1)
    }
}

async fn history(State(s): State<AppState>, user: AuthUser, Query(q): Query<HistoryQuery>) -> ApiResult<Json<Vec<Point>>> {
    let now = Local::now();
    let hourly = !matches!(q.range.as_deref(), Some("week") | Some("month"));
    let midnight = |days: i64| {
        let d = now.date_naive() - Duration::days(days);
        Local.from_local_datetime(&d.and_hms_opt(0, 0, 0).unwrap()).earliest().unwrap_or(now)
    };
    let (start, buckets) = match q.range.as_deref() {
        Some("week") => (midnight(6), 7),
        Some("month") => (midnight(29), 30),
        _ => {
            let h = now.with_minute(0).and_then(|t| t.with_second(0)).and_then(|t| t.with_nanosecond(0)).unwrap_or(now);
            (h - Duration::hours(23), 24)
        }
    };
    let visible: Vec<String> = visible_devices(&s, &user).await?.into_iter().map(|d| d.id).collect();

    // 15-minute UTC buckets, regrouped into local ones (keeps half-hour time zones exact).
    let rows: Vec<(String, String, i64, f64, Option<f64>, Option<f64>, i64)> = sqlx::query_as(
        "SELECT device_id, substr(recorded_at, 1, 13) AS h, CAST(substr(recorded_at, 15, 2) AS INTEGER) / 15 AS q,
                AVG(pm25), AVG(temperature), AVG(humidity), COUNT(*)
         FROM air_metrics WHERE recorded_at >= ? GROUP BY device_id, h, q",
    )
    .bind(start.with_timezone(&Utc))
    .fetch_all(&s.pool)
    .await?;

    let mut acc = vec![Acc::default(); buckets];
    for (device_id, hour, quarter, pm, temp, hum, n) in rows {
        if !visible.contains(&device_id) || q.device_id.as_ref().is_some_and(|d| *d != device_id) {
            continue;
        }
        let Ok(naive) = NaiveDateTime::parse_from_str(&format!("{}:00:00", hour.replace(' ', "T")), "%Y-%m-%dT%H:%M:%S") else {
            continue;
        };
        let local = (Utc.from_utc_datetime(&naive) + Duration::minutes(quarter * 15)).with_timezone(&Local);
        let idx = if hourly { (local - start).num_hours() } else { (local.date_naive() - start.date_naive()).num_days() };
        if let Some(a) = usize::try_from(idx).ok().and_then(|i| acc.get_mut(i)) {
            let n = n as f64;
            a.add(0, Some(pm), n);
            a.add(1, temp, n);
            a.add(2, hum, n);
        }
    }
    let points = acc
        .iter()
        .enumerate()
        .map(|(i, a)| Point {
            t: Some(if hourly { start + Duration::hours(i as i64) } else { midnight(buckets as i64 - 1 - i as i64) }),
            pm25: a.mean(0),
            temperature: a.mean(1),
            humidity: a.mean(2),
        })
        .collect();
    Ok(Json(points))
}

#[cfg(test)]
mod tests {
    use super::Acc;

    #[test]
    fn buckets_average_by_sample_count_and_skip_missing() {
        let mut a = Acc::default();
        a.add(0, Some(10.0), 1.0);
        a.add(0, Some(40.0), 3.0);
        a.add(1, None, 3.0);
        assert_eq!(a.mean(0), Some(32.5));
        assert_eq!(a.mean(1), None);
    }
}
