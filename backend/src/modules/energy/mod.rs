use crate::api::error::ApiError;
use axum::{
    extract::{Path, State},
    routing::{get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct EnergyMetricRecord {
    pub id: String,
    pub device_id: String,
    pub power_watts: f64,
    pub energy_kwh: f64,
    pub voltage: Option<f64>,
    pub current_amps: Option<f64>,
    pub recorded_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct ElectricitySettingsRecord {
    pub id: String,
    pub rate_per_kwh: f64,
    pub currency: String,
    pub monthly_budget: Option<f64>,
    pub billing_cycle_day: i64,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateSettingsRequest {
    pub rate_per_kwh: f64,
    pub currency: String,
    pub monthly_budget: Option<f64>,
    pub billing_cycle_day: i64,
}

#[derive(Debug, Deserialize)]
pub struct RecordMetricRequest {
    pub device_id: String,
    pub power_watts: f64,
    pub energy_kwh: f64,
    pub voltage: Option<f64>,
    pub current_amps: Option<f64>,
}

#[derive(Debug, Serialize)]
pub struct EnergyOverviewResponse {
    pub current_total_watts: f64,
    pub total_kwh_month: f64,
    pub estimated_cost_month: f64,
    pub rate_per_kwh: f64,
    pub currency: String,
    pub monthly_budget: Option<f64>,
    pub budget_used_percent: Option<f64>,
}

pub fn energy_routes(pool: SqlitePool) -> Router {
    Router::new()
        .route("/overview", get(get_overview))
        .route("/settings", get(get_settings).put(update_settings))
        .route("/metrics", post(record_metric))
        .route("/metrics/device/:device_id", get(get_device_metrics))
        .with_state(pool)
}

async fn get_settings(State(pool): State<SqlitePool>) -> Result<Json<ElectricitySettingsRecord>, ApiError> {
    let settings = sqlx::query_as::<_, ElectricitySettingsRecord>(
        "SELECT id, rate_per_kwh, currency, monthly_budget, billing_cycle_day, updated_at FROM electricity_settings LIMIT 1",
    )
    .fetch_optional(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    match settings {
        Some(s) => Ok(Json(s)),
        None => {
            let id = Uuid::new_v4().to_string();
            let now = Utc::now();
            let default_settings = ElectricitySettingsRecord {
                id: id.clone(),
                rate_per_kwh: 0.15,
                currency: "USD".into(),
                monthly_budget: Some(100.0),
                billing_cycle_day: 1,
                updated_at: now,
            };
            sqlx::query(
                "INSERT INTO electricity_settings (id, rate_per_kwh, currency, monthly_budget, billing_cycle_day, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&default_settings.id)
            .bind(default_settings.rate_per_kwh)
            .bind(&default_settings.currency)
            .bind(default_settings.monthly_budget)
            .bind(default_settings.billing_cycle_day)
            .bind(&default_settings.updated_at)
            .execute(&pool)
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;

            Ok(Json(default_settings))
        }
    }
}

async fn update_settings(
    State(pool): State<SqlitePool>,
    Json(payload): Json<UpdateSettingsRequest>,
) -> Result<Json<ElectricitySettingsRecord>, ApiError> {
    let now = Utc::now();
    let row: Option<(String,)> = sqlx::query_as("SELECT id FROM electricity_settings LIMIT 1")
        .fetch_optional(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    let id = match row {
        Some((id,)) => {
            sqlx::query(
                "UPDATE electricity_settings SET rate_per_kwh = ?, currency = ?, monthly_budget = ?, billing_cycle_day = ?, updated_at = ? WHERE id = ?",
            )
            .bind(payload.rate_per_kwh)
            .bind(&payload.currency)
            .bind(payload.monthly_budget)
            .bind(payload.billing_cycle_day)
            .bind(&now)
            .bind(&id)
            .execute(&pool)
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;
            id
        }
        None => {
            let new_id = Uuid::new_v4().to_string();
            sqlx::query(
                "INSERT INTO electricity_settings (id, rate_per_kwh, currency, monthly_budget, billing_cycle_day, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
            )
            .bind(&new_id)
            .bind(payload.rate_per_kwh)
            .bind(&payload.currency)
            .bind(payload.monthly_budget)
            .bind(payload.billing_cycle_day)
            .bind(&now)
            .execute(&pool)
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?;
            new_id
        }
    };

    Ok(Json(ElectricitySettingsRecord {
        id,
        rate_per_kwh: payload.rate_per_kwh,
        currency: payload.currency,
        monthly_budget: payload.monthly_budget,
        billing_cycle_day: payload.billing_cycle_day,
        updated_at: now,
    }))
}

async fn get_overview(State(pool): State<SqlitePool>) -> Result<Json<EnergyOverviewResponse>, ApiError> {
    let settings = get_settings(State(pool.clone())).await?.0;

    let total_power: (f64,) = sqlx::query_as(
        r#"
        SELECT COALESCE(SUM(m.power_watts), 0.0) 
        FROM energy_metrics m
        INNER JOIN (
            SELECT device_id, MAX(recorded_at) as max_time
            FROM energy_metrics
            GROUP BY device_id
        ) latest ON m.device_id = latest.device_id AND m.recorded_at = latest.max_time
        "#,
    )
    .fetch_one(&pool)
    .await
    .unwrap_or((0.0,));

    let total_kwh: (f64,) = sqlx::query_as(
        "SELECT COALESCE(SUM(energy_kwh), 0.0) FROM energy_metrics WHERE recorded_at >= datetime('now', 'start of month')",
    )
    .fetch_one(&pool)
    .await
    .unwrap_or((0.0,));

    let estimated_cost = total_kwh.0 * settings.rate_per_kwh;
    let budget_used_percent = settings
        .monthly_budget
        .map(|budget| if budget > 0.0 { (estimated_cost / budget) * 100.0 } else { 0.0 });

    Ok(Json(EnergyOverviewResponse {
        current_total_watts: total_power.0,
        total_kwh_month: total_kwh.0,
        estimated_cost_month: estimated_cost,
        rate_per_kwh: settings.rate_per_kwh,
        currency: settings.currency,
        monthly_budget: settings.monthly_budget,
        budget_used_percent,
    }))
}

async fn record_metric(
    State(pool): State<SqlitePool>,
    Json(payload): Json<RecordMetricRequest>,
) -> Result<Json<Value>, ApiError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();

    sqlx::query(
        r#"
        INSERT INTO energy_metrics (id, device_id, power_watts, energy_kwh, voltage, current_amps, recorded_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&payload.device_id)
    .bind(payload.power_watts)
    .bind(payload.energy_kwh)
    .bind(payload.voltage)
    .bind(payload.current_amps)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(json!({ "id": id, "recorded_at": now })))
}

async fn get_device_metrics(
    State(pool): State<SqlitePool>,
    Path(device_id): Path<String>,
) -> Result<Json<Vec<EnergyMetricRecord>>, ApiError> {
    let metrics = sqlx::query_as::<_, EnergyMetricRecord>(
        "SELECT * FROM energy_metrics WHERE device_id = ? ORDER BY recorded_at DESC LIMIT 50",
    )
    .bind(&device_id)
    .fetch_all(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(metrics))
}
