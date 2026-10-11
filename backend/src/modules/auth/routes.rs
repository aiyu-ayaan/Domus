use super::{hash_password, verify_password, UserDto, UserRecord, LOGIN_THROTTLE};
use crate::api::error::{ApiError, ApiResult};
use crate::api::middleware::AuthUser;
use crate::api::AppState;
use crate::infrastructure::event_bus::SystemEvent;
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
    /// Not needed while the account is still on its generated password.
    pub current_password: Option<String>,
    pub new_password: String,
}

#[derive(Deserialize)]
pub struct ForgotRequest {
    pub username: String,
}

#[derive(Deserialize)]
pub struct ResetRequest {
    pub username: String,
    /// The one-time code an administrator handed over.
    pub code: String,
    pub new_password: String,
}

pub fn public_routes() -> Router<AppState> {
    Router::new()
        .route("/setup-status", get(setup_status))
        .route("/setup", post(setup))
        .route("/login", post(login))
        .route("/forgot", post(forgot))
        .route("/reset", post(reset))
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
        kid: false,
        must_change_password: false,
        reset_requested_at: None,
        reset_allowed_until: None,
        reset_code_hash: None,
        reset_attempts: 0,
        created_at: now,
        updated_at: now,
    };
    user.insert(&s.pool).await?;
    let token = s.jwt.issue(&user.id, Role::Admin)?;
    Ok(Json(json!({ "token": token, "user": UserDto::from_record(&user, vec![], vec![]) })))
}

async fn login(State(s): State<AppState>, Json(req): Json<LoginRequest>) -> ApiResult<Json<Value>> {
    // Checked before the password, so a locked name cannot be guessed at even with parallel requests.
    if let Some(minutes) = LOGIN_THROTTLE.locked(&req.username) {
        return Err(ApiError::TooManyRequests(format!(
            "Too many wrong passwords. Try again in {minutes} minute{}.",
            if minutes == 1 { "" } else { "s" }
        )));
    }
    let mut user = match UserRecord::by_username(&s.pool, &req.username).await? {
        Some(u) if verify_password(&req.password, &u.password_hash) => u,
        _ => {
            LOGIN_THROTTLE.failed(&req.username);
            // Slow down credential guessing.
            tokio::time::sleep(std::time::Duration::from_millis(600)).await;
            return Err(ApiError::Unauthorized("Invalid username or password".into()));
        }
    };
    LOGIN_THROTTLE.clear(&user.username);
    // They remembered it after all: nothing is left for an administrator to answer.
    if user.reset_requested_at.is_some() || user.reset_allowed_until.is_some() {
        sqlx::query("UPDATE users SET reset_requested_at = NULL, reset_allowed_until = NULL, reset_code_hash = NULL, reset_attempts = 0 WHERE id = ?")
            .bind(&user.id)
            .execute(&s.pool)
            .await?;
        user.close_reset();
        s.bus.publish(SystemEvent::UsersChanged);
    }
    auth_response(&s, &user).await
}

async fn auth_response(s: &AppState, user: &UserRecord) -> ApiResult<Json<Value>> {
    let role = Role::parse(&user.role).unwrap_or(Role::Guest);
    let token = s.jwt.issue(&user.id, role)?;
    Ok(Json(json!({ "token": token, "user": UserDto::load(&s.pool, user).await? })))
}

/// The sign-in screen's "Forgot password". There is no mail server, so the way back in is an
/// administrator: this tells them, and they hand over a one-time code for [reset].
/// An unknown username gets the same answer as a known one.
async fn forgot(State(s): State<AppState>, Json(req): Json<ForgotRequest>) -> ApiResult<Json<Value>> {
    // Slow down guessing, like sign-in.
    tokio::time::sleep(std::time::Duration::from_millis(600)).await;
    if let Some(user) = UserRecord::by_username(&s.pool, &req.username).await? {
        // One notification per request, however often the button is pressed.
        if user.reset_requested_at.is_none() && !user.reset_allowed() {
            sqlx::query("UPDATE users SET reset_requested_at = ? WHERE id = ?")
                .bind(Utc::now())
                .bind(&user.id)
                .execute(&s.pool)
                .await?;
            s.notifier
                .notify(
                    "warning",
                    "Password reset requested",
                    &format!("{} forgot their password. An administrator can give them a reset code in Settings, under People and access.", user.username),
                    Some("/settings"),
                )
                .await;
            s.bus.publish(SystemEvent::UsersChanged);
        }
    }
    Ok(Json(json!({ "success": true })))
}

/// Choose a new password with the one-time code. The code is spent by it.
async fn reset(State(s): State<AppState>, Json(req): Json<ResetRequest>) -> ApiResult<Json<Value>> {
    let Some(mut user) = UserRecord::redeem_reset_code(&s.pool, &req.username, &req.code).await? else {
        tokio::time::sleep(std::time::Duration::from_millis(600)).await;
        s.bus.publish(SystemEvent::UsersChanged);
        return Err(ApiError::Forbidden("That code is wrong or no longer valid. Ask an administrator for a new one.".into()));
    };
    validate_credentials(&user.username, &req.new_password)?;
    user.set_password(&s.pool, &req.new_password, false).await?;
    LOGIN_THROTTLE.clear(&user.username);
    s.bus.publish(SystemEvent::UsersChanged);
    auth_response(&s, &user).await
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
    let mut rec: UserRecord = sqlx::query_as("SELECT * FROM users WHERE id = ?")
        .bind(&user.id)
        .fetch_one(&s.pool)
        .await?;
    // The generated password was just used to sign in and may have been read by others on its way here.
    if !rec.must_change_password && !verify_password(req.current_password.as_deref().unwrap_or(""), &rec.password_hash) {
        return Err(ApiError::BadRequest("Current password is incorrect".into()));
    }
    validate_credentials(&rec.username, &req.new_password)?;
    if verify_password(&req.new_password, &rec.password_hash) {
        return Err(ApiError::BadRequest("Choose a password different from the current one".into()));
    }
    rec.set_password(&s.pool, &req.new_password, false).await?;
    s.bus.publish(SystemEvent::UsersChanged);
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
