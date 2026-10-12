//! Air quality history. The manager stores a PM2.5 sample (with temperature and humidity when the
//! device has them) every minute: the average and the peak of every poll in it. This serves them
//! as a time series.

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
    /// "hour" (60 one-minute points), "day" (24 hourly points), "week" (7 days), "month" (30 days)
    /// or "hours" (every hour of the last 7 days).
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
    /// The highest PM2.5 any poll read in the bucket, which the average hides.
    pm25_max: Option<f64>,
    /// Samples at each level of [LEVELS], then above the last: how the bucket's time was spent.
    levels: [i64; 4],
}

/// Upper PM2.5 limits (µg/m³) of excellent, good and moderate air; anything above is poor.
const LEVELS: [f64; 3] = [12.0, 35.0, 55.0];

/// One device's samples in one fine UTC group.
#[derive(sqlx::FromRow)]
struct Group {
    device_id: String,
    h: String,
    q: i64,
    pm25: f64,
    temperature: Option<f64>,
    humidity: Option<f64>,
    n: i64,
    pm25_max: f64,
    l0: i64,
    l1: i64,
    l2: i64,
}

/// Running (sum, count) per series of one bucket, its peak and its samples per level.
#[derive(Default, Clone)]
struct Acc([(f64, f64); 3], Option<f64>, [i64; 4]);

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
    let buckets = Buckets::new(q.range.as_deref(), q.tz.as_deref(), Utc::now());
    let visible: Vec<String> = visible_devices(&s, &user).await?.into_iter().map(|d| d.id).collect();

    // Fine UTC groups, regrouped into the viewer's buckets. Rows from before peaks were stored are their own peak.
    let rows: Vec<Group> = sqlx::query_as(
        "SELECT device_id, substr(recorded_at, 1, 13) AS h, CAST(substr(recorded_at, 15, 2) AS INTEGER) / ?2 AS q,
                AVG(pm25) AS pm25, AVG(temperature) AS temperature, AVG(humidity) AS humidity, COUNT(*) AS n,
                MAX(COALESCE(pm25_max, pm25)) AS pm25_max,
                COALESCE(SUM(pm25 <= ?3), 0) AS l0, COALESCE(SUM(pm25 <= ?4), 0) AS l1, COALESCE(SUM(pm25 <= ?5), 0) AS l2
         FROM air_metrics WHERE recorded_at >= ?1 GROUP BY device_id, h, q",
    )
    .bind(buckets.start())
    .bind(buckets.sql_minutes())
    .bind(LEVELS[0])
    .bind(LEVELS[1])
    .bind(LEVELS[2])
    .fetch_all(&s.pool)
    .await?;

    let mut acc = vec![Acc::default(); buckets.count()];
    for g in rows {
        if !visible.contains(&g.device_id) || q.device_id.as_ref().is_some_and(|d| *d != g.device_id) {
            continue;
        }
        if let Some(a) = buckets.group_time(&g.h, g.q).and_then(|t| buckets.index(t)).map(|i| &mut acc[i]) {
            let n = g.n as f64;
            a.add(0, Some(g.pm25), n);
            a.add(1, g.temperature, n);
            a.add(2, g.humidity, n);
            a.1 = Some(a.1.map_or(g.pm25_max, |m| m.max(g.pm25_max)));
            // The SQL counts are cumulative ("at or below"); store each level's own share.
            for (level, count) in [g.l0, g.l1 - g.l0, g.l2 - g.l1, g.n - g.l2].into_iter().enumerate() {
                a.2[level] += count;
            }
        }
    }
    let points = acc
        .iter()
        .enumerate()
        .map(|(i, a)| Point { t: Some(buckets.time(i)), pm25: a.mean(0), temperature: a.mean(1), humidity: a.mean(2), pm25_max: a.1, levels: a.2 })
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
