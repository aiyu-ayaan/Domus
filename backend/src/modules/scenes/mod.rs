use crate::api::error::ApiError;
use axum::{
    extract::{Path, State},
    routing::{delete, get, post},
    Json, Router,
};
use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
pub struct SceneRecord {
    pub id: String,
    pub name: String,
    pub icon: Option<String>,
    pub actions_json: String,
    pub is_active: bool,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Deserialize)]
pub struct CreateSceneRequest {
    pub name: String,
    pub icon: Option<String>,
    pub actions: Value,
}

pub fn scene_routes(pool: SqlitePool) -> Router {
    Router::new()
        .route("/", get(list_scenes).post(create_scene))
        .route("/:id/activate", post(activate_scene))
        .route("/:id", delete(delete_scene))
        .with_state(pool)
}

async fn list_scenes(State(pool): State<SqlitePool>) -> Result<Json<Vec<SceneRecord>>, ApiError> {
    let scenes = sqlx::query_as::<_, SceneRecord>("SELECT * FROM scenes ORDER BY name ASC")
        .fetch_all(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(scenes))
}

async fn create_scene(
    State(pool): State<SqlitePool>,
    Json(payload): Json<CreateSceneRequest>,
) -> Result<Json<SceneRecord>, ApiError> {
    let id = Uuid::new_v4().to_string();
    let now = Utc::now();
    let actions = serde_json::to_string(&payload.actions).unwrap_or_else(|_| "[]".into());

    sqlx::query(
        "INSERT INTO scenes (id, name, icon, actions_json, is_active, created_at) VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(&payload.name)
    .bind(&payload.icon)
    .bind(&actions)
    .bind(false)
    .bind(&now)
    .execute(&pool)
    .await
    .map_err(|e| ApiError::Internal(e.to_string()))?;

    Ok(Json(SceneRecord {
        id,
        name: payload.name,
        icon: payload.icon,
        actions_json: actions,
        is_active: false,
        created_at: now,
    }))
}

async fn activate_scene(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    sqlx::query("UPDATE scenes SET is_active = CASE WHEN id = ? THEN 1 ELSE 0 END")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;

    // In a full executor, we trigger each action in actions_json
    Ok(Json(json!({ "activated": true, "scene_id": id })))
}

async fn delete_scene(
    State(pool): State<SqlitePool>,
    Path(id): Path<String>,
) -> Result<Json<Value>, ApiError> {
    sqlx::query("DELETE FROM scenes WHERE id = ?")
        .bind(&id)
        .execute(&pool)
        .await
        .map_err(|e| ApiError::Internal(e.to_string()))?;
    Ok(Json(json!({ "success": true })))
}
