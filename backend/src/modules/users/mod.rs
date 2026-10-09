//! Household members: roles (admin / member / guest) and per-room access.

use super::auth::{hash_password, room_ids, routes::validate_credentials, UserDto, UserRecord};
use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use axum::{
    extract::{Path, State},
    routing::{get, put},
    Json, Router,
};
use chrono::Utc;
use home_core::Role;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct CreateUserRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub role: String,
    #[serde(default = "yes")]
    pub all_rooms: bool,
    #[serde(default)]
    pub room_ids: Vec<String>,
}

fn yes() -> bool {
    true
}

#[derive(Deserialize)]
pub struct UpdateUserRequest {
    pub email: Option<String>,
    pub role: Option<String>,
    pub password: Option<String>,
    pub all_rooms: Option<bool>,
    pub room_ids: Option<Vec<String>>,
}

pub fn user_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
}

fn parse_role(r: &str) -> ApiResult<Role> {
    Role::parse(r).ok_or_else(|| ApiError::BadRequest("role must be admin, member or guest".into()))
}

async fn set_rooms(s: &AppState, user_id: &str, rooms: &[String]) -> ApiResult<()> {
    let mut tx = s.pool.begin().await?;
    sqlx::query("DELETE FROM user_room_access WHERE user_id = ?")
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    for r in rooms {
        sqlx::query("INSERT INTO user_room_access (user_id, room_id) VALUES (?, ?)")
            .bind(user_id)
            .bind(r)
            .execute(&mut *tx)
            .await?;
    }
    tx.commit().await?;
    Ok(())
}

async fn admin_count(s: &AppState) -> ApiResult<i64> {
    let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE role = 'admin'")
        .fetch_one(&s.pool)
        .await?;
    Ok(n)
}

async fn list(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<Vec<UserDto>>> {
    user.require_admin()?;
    let users: Vec<UserRecord> = sqlx::query_as("SELECT * FROM users ORDER BY created_at")
        .fetch_all(&s.pool)
        .await?;
    let mut out = Vec::with_capacity(users.len());
    for u in &users {
        out.push(UserDto::from_record(u, room_ids(&s.pool, &u.id).await?));
    }
    Ok(Json(out))
}

async fn create(State(s): State<AppState>, user: AuthUser, Json(req): Json<CreateUserRequest>) -> ApiResult<Json<UserDto>> {
    user.require_admin()?;
    validate_credentials(&req.username, &req.password)?;
    let role = parse_role(&req.role)?;
    let now = Utc::now();
    let rec = UserRecord {
        id: Uuid::new_v4().to_string(),
        username: req.username.trim().into(),
        email: req.email.trim().into(),
        password_hash: hash_password(&req.password)?,
        role: role.as_str().into(),
        all_rooms: req.all_rooms,
        created_at: now,
        updated_at: now,
    };
    rec.insert(&s.pool).await?;
    set_rooms(&s, &rec.id, &req.room_ids).await?;
    Ok(Json(UserDto::from_record(&rec, req.room_ids)))
}

async fn update(
    State(s): State<AppState>,
    user: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateUserRequest>,
) -> ApiResult<Json<UserDto>> {
    user.require_admin()?;
    let mut rec: UserRecord = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&id)
        .fetch_optional(&s.pool)
        .await?
        .ok_or_else(|| ApiError::NotFound("User not found".into()))?;

    if let Some(role) = &req.role {
        let role = parse_role(role)?;
        if rec.role == "admin" && role != Role::Admin && admin_count(&s).await? <= 1 {
            return Err(ApiError::BadRequest("There must be at least one administrator".into()));
        }
        rec.role = role.as_str().into();
    }
    if let Some(email) = req.email {
        rec.email = email.trim().into();
    }
    if let Some(all) = req.all_rooms {
        rec.all_rooms = all;
    }
    if let Some(pw) = &req.password {
        validate_credentials(&rec.username, pw)?;
        rec.password_hash = hash_password(pw)?;
    }
    sqlx::query("UPDATE users SET email = ?, role = ?, all_rooms = ?, password_hash = ?, updated_at = ? WHERE id = ?")
        .bind(&rec.email)
        .bind(&rec.role)
        .bind(rec.all_rooms)
        .bind(&rec.password_hash)
        .bind(Utc::now())
        .bind(&id)
        .execute(&s.pool)
        .await?;
    if let Some(rooms) = &req.room_ids {
        set_rooms(&s, &id, rooms).await?;
    }
    Ok(Json(UserDto::from_record(&rec, room_ids(&s.pool, &id).await?)))
}

async fn remove(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    if id == user.id {
        return Err(ApiError::BadRequest("You cannot delete your own account".into()));
    }
    sqlx::query("DELETE FROM users WHERE id = ?").bind(&id).execute(&s.pool).await?;
    Ok(Json(json!({ "success": true })))
}
