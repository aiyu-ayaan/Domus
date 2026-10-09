use crate::api::error::ApiError;
use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct AutomationRecord {
    pub id: String,
    pub name: String,
    pub description: Option<String>,
    pub triggers_json: String,
    pub conditions_json: String,
    pub actions_json: String,
    pub is_enabled: bool,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateAutomationRequest {
    pub name: String,
    pub description: Option<String>,
    pub triggers: Value,
    pub conditions: Value,
    pub actions: Value,
    pub is_enabled: Option<bool>,
}

pub fn automation_routes(pool: SqlitePool) -> Router {
    Router::new()
        .route("/", get(list_automations).post(create_automation))
        .route("/:id", get(get_automation).delete(delete_automation))
        .route("/:id/toggle", put(toggle_automation))
        .with_state(pool)
}

async fn list_automations(State(pool): State<SqlitePool>) -> Result<Json<Vec<AutomationRecord>>, ApiError> {
    let automations = sqlx::query_as::<_, AutomationRecord>("SELECT * FROM automations ORDER BY created_at DESC")
        .fetch_all(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(automations))
}

async fn get_automation(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<AutomationRecord>, ApiError> {
    let item = sqlx::query_as::<_, AutomationRecord>("SELECT * FROM automations WHERE id = ?")
        .bind(&id)
        .fetch_optional(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?
        .ok_or_else(|| ApiError::NotFound("Automation not found".into()))?;
    Ok(Json(item))
}

async fn create_automation(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateAutomationRequest>,
) -> Result<Json<AutomationRecord>, ApiError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let triggers = serde_json::to_string(&payload.triggers).unwrap_or_else(|_| "[]".into());
    let conditions = serde_json::to_string(&payload.conditions).unwrap_or_else(|_| "[]".into());
    let actions = serde_json::to_string(&payload.actions).unwrap_or_else(|_| "[]".into());
    let is_enabled = payload.is_enabled.unwrap_or(true);

    sqlx::query(
        r#"
        INSERT INTO automations (id, name, description, triggers_json, conditions_json, actions_json, is_enabled, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&id)
    .bind(&payload.name)
    .bind(&payload.description)
    .bind(&triggers)
    .bind(&conditions)
    .bind(&actions)
    .bind(is_enabled)
    .bind(&now)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(AutomationRecord {
        id,
        name: payload.name,
        description: payload.description,
        triggers_json: triggers,
        conditions_json: conditions,
        actions_json: actions,
        is_enabled,
        created_at: now,
        updated_at: now,
    }))
}

async fn toggle_automation(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    sqlx::query("UPDATE automations SET is_enabled = NOT is_enabled, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(json!({ "success": true })))
}

async fn delete_automation(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    sqlx::query("DELETE FROM automations WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(json!({ "success": true })))
}
