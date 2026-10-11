//! Household members: roles (admin / member / guest) and what each may reach:
//! the whole home, whole rooms, or single devices.

use super::auth::{grants, hash_password, routes::validate_credentials, UserDto, UserRecord};
use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use axum::{
    extract::{Path, Query, State},
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
    #[serde(default)]
    pub edit_room_ids: Vec<String>,
    #[serde(default)]
    pub edit_device_ids: Vec<String>,
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
    pub edit_room_ids: Option<Vec<String>>,
    pub edit_device_ids: Option<Vec<String>>,
}

pub fn user_routes() -> Router<AppState> {
    Router::new()
        .route("/", get(list).post(create))
        .route("/email/check", get(check_email))
        .route("/email/suggest", get(suggest_email))
        .route("/:id", put(update).delete(remove))
}

/// Domain of the addresses Domus suggests; the server is the home's own mail namespace.
const EMAIL_DOMAIN: &str = "domus.home";

/// Addresses to try for a username, best first: the name split into words and joined with a dot
/// (`john.doe`), then run together (`johndoe`), then the dotted form with a number (`john.doe2` ...).
/// Empty when the username has nothing usable in it.
fn email_candidates(username: &str) -> Vec<String> {
    let lower = username.to_lowercase();
    let words: Vec<String> = lower
        .split(|c: char| !c.is_ascii_alphanumeric())
        .filter(|w| !w.is_empty())
        .map(String::from)
        .collect();
    if words.is_empty() {
        return vec![];
    }
    let dotted = words.join(".");
    let joined = words.join("");
    let mut local = vec![dotted.clone()];
    if joined != dotted {
        local.push(joined);
    }
    local.extend((2..100).map(|n| format!("{dotted}{n}")));
    local.into_iter().map(|l| format!("{l}@{EMAIL_DOMAIN}")).collect()
}

/// Whether another account (not `except`) already uses the address; addresses compare without case.
async fn email_taken(pool: &sqlx::SqlitePool, email: &str, except: Option<&str>) -> ApiResult<bool> {
    let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE email = ? COLLATE NOCASE AND id != ?")
        .bind(email.trim())
        .bind(except.unwrap_or(""))
        .fetch_one(pool)
        .await?;
    Ok(n > 0)
}

#[derive(Deserialize)]
struct EmailCheckQuery {
    email: String,
    /// The account being edited, so its own address does not count as taken.
    user_id: Option<String>,
}

async fn check_email(State(s): State<AppState>, user: AuthUser, Query(q): Query<EmailCheckQuery>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    Ok(Json(json!({ "available": !email_taken(&s.pool, &q.email, q.user_id.as_deref()).await? })))
}

#[derive(Deserialize)]
struct EmailSuggestQuery {
    username: String,
    user_id: Option<String>,
}

async fn suggest_email(State(s): State<AppState>, user: AuthUser, Query(q): Query<EmailSuggestQuery>) -> ApiResult<Json<Value>> {
    user.require_admin()?;
    for email in email_candidates(&q.username) {
        if !email_taken(&s.pool, &email, q.user_id.as_deref()).await? {
            return Ok(Json(json!({ "email": email })));
        }
    }
    Err(ApiError::Conflict("Every suggested address for that username is taken".into()))
}

fn parse_role(r: &str) -> ApiResult<Role> {
    Role::parse(r).ok_or_else(|| ApiError::BadRequest("role must be admin, member or guest".into()))
}

/// The levels a request sets for one kind of grant; `None` keeps that part as it is.
#[derive(Clone, Copy)]
struct Levels<'a> {
    ids: Option<&'a [String]>,
    view_only: Option<&'a [String]>,
    edit: Option<&'a [String]>,
}

/// Replace the user's `room` or `device` grants. Ids that no longer exist are dropped.
/// A client that sends only the ids keeps the see-only and edit marks of the grants that stay.
async fn set_grants(s: &AppState, user_id: &str, kind: &str, new: Levels<'_>) -> ApiResult<()> {
    if new.ids.is_none() && new.view_only.is_none() && new.edit.is_none() {
        return Ok(());
    }
    let old = grants(&s.pool, kind, user_id).await?;
    let old_ids: Vec<String> = old.iter().map(|g| g.0.clone()).collect();
    let old_view: Vec<String> = old.iter().filter(|g| !g.1).map(|g| g.0.clone()).collect();
    let old_edit: Vec<String> = old.iter().filter(|g| g.2).map(|g| g.0.clone()).collect();
    let ids = new.ids.unwrap_or(&old_ids);
    let view_only = new.view_only.unwrap_or(&old_view);
    let edit = new.edit.unwrap_or(&old_edit);
    let mut tx = s.pool.begin().await?;
    sqlx::query(&format!("DELETE FROM user_{kind}_access WHERE user_id = ?"))
        .bind(user_id)
        .execute(&mut *tx)
        .await?;
    for id in ids {
        let control = !view_only.contains(id);
        sqlx::query(&format!(
            "INSERT OR IGNORE INTO user_{kind}_access (user_id, {kind}_id, can_control, can_edit) SELECT ?, id, ?, ? FROM {kind}s WHERE id = ?"
        ))
        .bind(user_id)
        .bind(control)
        .bind(control && edit.contains(id))
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
    if email_taken(&s.pool, &req.email, None).await? {
        return Err(ApiError::Conflict("That email is already used by another account".into()));
    }
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
    let rooms = Levels { ids: Some(&req.room_ids), view_only: Some(&req.view_only_room_ids), edit: Some(&req.edit_room_ids) };
    let devices = Levels { ids: Some(&req.device_ids), view_only: Some(&req.view_only_device_ids), edit: Some(&req.edit_device_ids) };
    set_grants(&s, &rec.id, "room", rooms).await?;
    set_grants(&s, &rec.id, "device", devices).await?;
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
        if email_taken(&s.pool, &email, Some(&id)).await? {
            return Err(ApiError::Conflict("That email is already used by another account".into()));
        }
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
    let rooms = Levels { ids: req.room_ids.as_deref(), view_only: req.view_only_room_ids.as_deref(), edit: req.edit_room_ids.as_deref() };
    let devices = Levels { ids: req.device_ids.as_deref(), view_only: req.view_only_device_ids.as_deref(), edit: req.edit_device_ids.as_deref() };
    set_grants(&s, &id, "room", rooms).await?;
    set_grants(&s, &id, "device", devices).await?;
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn email_candidates_combine_the_words_of_a_username() {
        let c = email_candidates("John_Doe");
        assert_eq!(&c[..3], ["john.doe@domus.home", "johndoe@domus.home", "john.doe2@domus.home"]);
        // One word has no run-together form, so the numbers follow at once.
        assert_eq!(&email_candidates("kid")[..2], ["kid@domus.home", "kid2@domus.home"]);
        assert!(email_candidates("  _- ").is_empty());
    }
}
