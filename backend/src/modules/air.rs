//! Air quality history. The manager samples PM2.5 (with temperature and humidity
//! when the device has them) every few minutes; this serves it as a time series.

use crate::api::error::ApiResult;
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::modules::devices::service::visible_devices;
use crate::modules::energy::Buckets;
use axum::{extract::{Query, State}, routing::get, Json, Router};
use chrono::{DateTime, FixedOffset, Utc};
use serde::{Deserialize, Serialize};

pub fn air_routes() -> Router<AppState> {
    Router::new().route("/history", get(history))
}

#[derive(Deserialize)]
struct HistoryQuery {
    /// "day" (24 hourly points), "week" (7 days) or "month" (30 days).
    range: Option<String>,
    /// The viewer's IANA time zone, so buckets follow their clock rather than the server's.
    tz: Option<String>,
    device_id: Option<String>,
}

/// Averages over one bucket; `None` where nothing was measured.
#[derive(Serialize, Default, Clone, PartialEq, Debug)]
struct Point {
    t: Option<DateTime<FixedOffset>>,
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
    // Air is sampled every few minutes, too coarse for the per-minute "hour" range: it reads as "day".
    let buckets = Buckets::new(q.range.as_deref().filter(|r| *r != "hour"), q.tz.as_deref(), Utc::now());
    let visible: Vec<String> = visible_devices(&s, &user).await?.into_iter().map(|d| d.id).collect();

    // Fine UTC groups, regrouped into the viewer's buckets.
    let rows: Vec<(String, String, i64, f64, Option<f64>, Option<f64>, i64)> = sqlx::query_as(
        "SELECT device_id, substr(recorded_at, 1, 13) AS h, CAST(substr(recorded_at, 15, 2) AS INTEGER) / ?2 AS q,
                AVG(pm25), AVG(temperature), AVG(humidity), COUNT(*)
         FROM air_metrics WHERE recorded_at >= ?1 GROUP BY device_id, h, q",
    )
    .bind(buckets.start())
    .bind(buckets.sql_minutes())
    .fetch_all(&s.pool)
    .await?;

    let mut acc = vec![Acc::default(); buckets.count()];
    for (device_id, hour, part, pm, temp, hum, n) in rows {
        if !visible.contains(&device_id) || q.device_id.as_ref().is_some_and(|d| *d != device_id) {
            continue;
        }
        if let Some(a) = buckets.group_time(&hour, part).and_then(|t| buckets.index(t)).map(|i| &mut acc[i]) {
            let n = n as f64;
            a.add(0, Some(pm), n);
            a.add(1, temp, n);
            a.add(2, hum, n);
        }
    }
    let points = acc
        .iter()
        .enumerate()
        .map(|(i, a)| Point { t: Some(buckets.time(i)), pm25: a.mean(0), temperature: a.mean(1), humidity: a.mean(2) })
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
