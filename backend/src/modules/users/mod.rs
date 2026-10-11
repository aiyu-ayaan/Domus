//! Household members: roles (admin / member / guest) and what each may reach:
//! the whole home, whole rooms, or single devices.

use super::auth::{grants, hash_password, routes::validate_credentials, UserDto, UserRecord};
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
    pub avatar: Option<String>,
    #[serde(default = "yes")]
    pub all_rooms: bool,
    #[serde(default)]
    pub room_ids: Vec<String>,
    #[serde(default)]
    pub device_ids: Vec<String>,
    #[serde(default)]
    pub view_only_room_ids: Vec<String>,
    #[serde(default)]
    pub view_only_device_ids: Vec<String>,
}

fn yes() -> bool {
    true
}

#[derive(Deserialize)]
pub struct UpdateUserRequest {
    pub email: Option<String>,
    pub role: Option<String>,
    pub password: Option<String>,
    pub avatar: Option<String>,
    pub all_rooms: Option<bool>,
    pub room_ids: Option<Vec<String>>,
    pub device_ids: Option<Vec<String>>,
    pub view_only_room_ids: Option<Vec<String>>,
    pub view_only_device_ids: Option<Vec<String>>,
}

pub fn user_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/:id", put(update).delete(remove))
}

fn parse_role(r: &str) -> ApiResult<Role> {
    Role::parse(r).ok_or_else(|| ApiError::BadRequest("role must be admin, member or guest".into()))
}

/// Replace the user's `room` or `device` grants; `None` keeps that part as it is.
/// Ids that no longer exist are dropped. A client that sends only the ids
/// (no see-only list) keeps the see-only marks of the grants that stay.
async fn set_grants(s: &AppState, user_id: &str, kind: &str, ids: Option<&[String]>, view_only: Option<&[String]>) -> ApiResult<()> {
    if ids.is_none() && view_only.is_none() {
        return Ok(());
    }
    let old = grants(&s.pool, kind, user_id).await?;
    let old_ids: Vec<String> = old.iter().map(|g| g.0.clone()).collect();
    let old_view: Vec<String> = old.into_iter().filter(|g| !g.1).map(|g| g.0).collect();
    let ids = ids.unwrap_or(&old_ids);
    let view_only = view_only.unwrap_or(&old_view);
    let mut tx = s.pool.begin().await?;
    sqlx::query(&format!("DELETE FROM user_{kind}_access WHERE user_id = ?"))
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    for id in ids {
        sqlx::query(&format!(
            "INSERT OR IGNORE INTO user_{kind}_access (user_id, {kind}_id, can_control) SELECT ?, id, ? FROM {kind}s WHERE id = ?"
        ))
        .bind(user_id)
        .bind(!view_only.contains(id))
        .bind(id)
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
        out.push(UserDto::load(&s.pool, u).await?);
    }
    Ok(Json(out))
}

async fn create(State(s): State<AppState>, user: AuthUser, Json(req): Json<CreateUserRequest>) -> ApiResult<Json<UserDto>> {
    user.require_admin()?;
    validate_credentials(&req.username, &req.password)?;
    let role = parse_role(&req.role)?;
    let now = Utc::now();
    let avatar = req
        .avatar
        .as_deref()
        .filter(|a| !a.trim().is_empty())
        .map(|a| a.trim().to_string())
        .unwrap_or_else(|| format!("dicebear:bottts:{}", req.username.trim()));
    let rec = UserRecord {
        id: Uuid::new_v4().to_string(),
        username: req.username.trim().into(),
        email: req.email.trim().into(),
        password_hash: hash_password(&req.password)?,
        role: role.as_str().into(),
        all_rooms: req.all_rooms,
        avatar: Some(avatar),
        created_at: now,
        updated_at: now,
    };
    rec.insert(&s.pool).await?;
    set_grants(&s, &rec.id, "room", Some(&req.room_ids), Some(&req.view_only_room_ids)).await?;
    set_grants(&s, &rec.id, "device", Some(&req.device_ids), Some(&req.view_only_device_ids)).await?;
    s.bus.publish(crate::infrastructure::event_bus::SystemEvent::UsersChanged);
    Ok(Json(UserDto::load(&s.pool, &rec).await?))
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
    if let Some(avatar) = req.avatar {
        rec.avatar = Some(avatar.trim().into());
    }
    if let Some(all) = req.all_rooms {
        rec.all_rooms = all;
    }
    if let Some(pw) = &req.password {
        validate_credentials(&rec.username, pw)?;
        rec.password_hash = hash_password(pw)?;
    }
    sqlx::query("UPDATE users SET email = ?, role = ?, all_rooms = ?, password_hash = ?, avatar = ?, updated_at = ? WHERE id = ?")
        .bind(&rec.email)
        .bind(&rec.role)
        .bind(rec.all_rooms)
        .bind(&rec.password_hash)
        .bind(&rec.avatar)
        .bind(Utc::now())
        .bind(&id)
        .execute(&s.pool)
        .await?;
    set_grants(&s, &id, "room", req.room_ids.as_deref(), req.view_only_room_ids.as_deref()).await?;
    set_grants(&s, &id, "device", req.device_ids.as_deref(), req.view_only_device_ids.as_deref()).await?;
    s.bus.publish(crate::infrastructure::event_bus::SystemEvent::UserUpdated {
        user_id: rec.id.clone(),
        username: rec.username.clone(),
        role: rec.role.clone(),
        avatar: rec.avatar.clone(),
    });
    s.bus.publish(crate::infrastructure::event_bus::SystemEvent::UsersChanged);
    Ok(Json(UserDto::load(&s.pool, &rec).await?))
}

async fn remove(State(s): State<AppState>, user: AuthUser, Path(id): Path<String>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    if id == user.id {
        return Err(ApiError::BadRequest("You cannot delete your own account".into()));
    }
    sqlx::query("DELETE FROM users WHERE id = ?").bind(&id).execute(&s.pool).await?;
    s.bus.publish(crate::infrastructure::event_bus::SystemEvent::UsersChanged);
    Ok(Json(json!({ "success": true })))
}
