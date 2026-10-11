use super::{hash_password, verify_password, UserDto, UserRecord};
use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use axum::{extract::State, routing::{get, post, put}, Json, Router};
use chrono::Utc;
use home_core::Role;
use serde::Deserialize;
use serde_json::{json, Value};
use uuid::Uuid;

#[derive(Deserialize)]
pub struct SetupRequest {
    pub username: String,
    pub email: String,
    pub password: String,
    pub avatar: Option<String>,
}

#[derive(Deserialize)]
pub struct UpdateAvatarRequest {
    pub avatar: String,
}

#[derive(Deserialize)]
pub struct LoginRequest {
    pub username: String,
    pub password: String,
}

#[derive(Deserialize)]
pub struct ChangePasswordRequest {
    pub current_password: String,
    pub new_password: String,
}

pub fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/setup-status", get(setup_status))
        .route("/setup", post(setup))
        .route("/login", post(login))
}

pub fn protected_routes() -> Router<AppState> {
    Router::new()
        .route("/me", get(me))
        .route("/me/avatar", put(update_avatar))
        .route("/password", post(change_password))
}

async fn user_count(s: &AppState) -> ApiResult<i64> {
    let (n,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users").fetch_one(&s.pool).await?;
    Ok(n)
}

async fn setup_status(State(s): State<AppState>) -> ApiResult<Json<Value>> {
    Ok(Json(json!({ "needs_admin_setup": user_count(&s).await? == 0 })))
}

pub fn validate_credentials(username: &str, password: &str) -> ApiResult<()> {
    if username.trim().len() < 3 {
        return Err(ApiError::BadRequest("Username must be at least 3 characters".into()));
    }
    if password.len() < 8 {
        return Err(ApiError::BadRequest("Password must be at least 8 characters".into()));
    }
    Ok(())
}

/// Create the first administrator. Only allowed while there are no users.
async fn setup(State(s): State<AppState>, Json(req): Json<SetupRequest>) -> ApiResult<Json<Value>> {
    validate_credentials(&req.username, &req.password)?;
    if user_count(&s).await? > 0 {
        return Err(ApiError::Forbidden("Setup has already been completed".into()));
    }
    let now = Utc::now();
    let avatar = req
        .avatar
        .as_deref()
        .filter(|a| !a.trim().is_empty())
        .map(|a| a.trim().to_string())
        .unwrap_or_else(|| format!("dicebear:bottts:{}", req.username.trim()));
    let user = UserRecord {
        id: Uuid::new_v4().to_string(),
        username: req.username.trim().to_string(),
        email: req.email.trim().to_string(),
        password_hash: hash_password(&req.password)?,
        role: Role::Admin.as_str().into(),
        all_rooms: true,
        avatar: Some(avatar),
        created_at: now,
        updated_at: now,
    };
    user.insert(&s.pool).await?;
    let token = s.jwt.issue(&user.id, Role::Admin)?;
    Ok(Json(json!({ "token": token, "user": UserDto::from_record(&user, vec![], vec![]) })))
}

async fn login(State(s): State<AppState>, Json(req): Json<LoginRequest>) -> ApiResult<Json<Value>> {
    let user: Option<UserRecord> = sqlx::query_as("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
        .bind(req.username.trim())
        .fetch_optional(&s.pool)
        .await?;
    let user = match user {
        Some(u) if verify_password(&req.password, &u.password_hash) => u,
        _ => {
            // Slow down credential guessing.
            tokio::time::sleep(std::time::Duration::from_millis(600)).await;
            return Err(ApiError::Unauthorized("Invalid username or password".into()));
        }
    };
    let role = Role::parse(&user.role).unwrap_or(Role::Guest);
    let token = s.jwt.issue(&user.id, role)?;
    Ok(Json(json!({ "token": token, "user": UserDto::load(&s.pool, &user).await? })))
}

async fn me(State(s): State<AppState>, user: AuthUser) -> ApiResult<Json<UserDto>> {
    let rec: UserRecord = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_one(&s.pool)
        .await?;
    Ok(Json(UserDto::load(&s.pool, &rec).await?))
}

async fn change_password(
    State(s): State<AppState>,
    user: AuthUser,
    Json(req): Json<ChangePasswordRequest>,
) -> ApiResult<Json<Value>> {
    let rec: UserRecord = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_one(&s.pool)
        .await?;
    if !verify_password(&req.current_password, &rec.password_hash) {
        return Err(ApiError::BadRequest("Current password is incorrect".into()));
    }
    validate_credentials(&rec.username, &req.new_password)?;
    sqlx::query("UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?")
        .bind(hash_password(&req.new_password)?)
        .bind(Utc::now())
        .bind(&user.id)
        .execute(&s.pool)
        .await?;
    Ok(Json(json!({ "success": true })))
}

async fn update_avatar(
    State(s): State<AppState>,
    user: AuthUser,
    Json(req): Json<UpdateAvatarRequest>,
) -> ApiResult<Json<UserDto>> {
    let avatar = req.avatar.trim();
    if avatar.len() > 1024 {
        return Err(ApiError::BadRequest("Avatar string too long".into()));
    }
    sqlx::query("UPDATE users SET avatar = ?, updated_at = ? WHERE id = ?")
        .bind(avatar)
        .bind(Utc::now())
        .bind(&user.id)
        .execute(&s.pool)
        .await?;
    let rec: UserRecord = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_one(&s.pool)
        .await?;
    let dto = UserDto::load(&s.pool, &rec).await?;
    s.bus.publish(crate::infrastructure::event_bus::SystemEvent::UserUpdated {
        user_id: rec.id.clone(),
        username: rec.username.clone(),
        role: rec.role.clone(),
        avatar: rec.avatar.clone(),
    });
    s.bus.publish(crate::infrastructure::event_bus::SystemEvent::UsersChanged);
    Ok(Json(dto))
}
