pub mod routes;

use crate::api::error::ApiError;
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{DateTime, Utc};
use rand::{rngs::OsRng, Rng};
use serde::Serialize;
use sqlx::SqlitePool;

#[derive(Debug, Clone, sqlx::FromRow)]
pub struct UserRecord {
    pub id: String,
    pub username: String,
    pub email: String,
    pub password_hash: String,
    pub role: String,
    pub all_rooms: bool,
    pub avatar: Option<String>,
    /// An administrator sets a kid's password; nobody else's is ever typed by one.
    pub kid: bool,
    /// Set while the account still has a generated password.
    pub must_change_password: bool,
    /// When the user asked for a reset on the sign-in screen.
    pub reset_requested_at: Option<DateTime<Utc>>,
    /// Until when the one-time reset code is good.
    pub reset_allowed_until: Option<DateTime<Utc>>,
    pub reset_code_hash: Option<String>,
    /// Wrong codes tried since the code was issued.
    pub reset_attempts: i64,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl UserRecord {
    pub fn reset_allowed(&self) -> bool {
        self.reset_code_hash.is_some() && self.reset_allowed_until.is_some_and(|t| t > Utc::now())
    }

    /// The account `code` opens for a new password. A wrong code counts against the account's
    /// code, which is thrown away after [RESET_TRIES] of them, so it cannot be guessed.
    pub async fn redeem_reset_code(pool: &SqlitePool, username: &str, code: &str) -> Result<Option<Self>, ApiError> {
        let Some(user) = Self::by_username(pool, username).await?.filter(Self::reset_allowed) else { return Ok(None) };
        let digits: String = code.chars().filter(char::is_ascii_digit).collect();
        if verify_password(&digits, user.reset_code_hash.as_deref().unwrap_or("")) {
            return Ok(Some(user));
        }
        sqlx::query(
            "UPDATE users SET reset_attempts = reset_attempts + 1,
             reset_code_hash = CASE WHEN reset_attempts + 1 >= ? THEN NULL ELSE reset_code_hash END WHERE id = ?",
        )
        .bind(RESET_TRIES)
        .bind(&user.id)
        .execute(pool)
        .await?;
        Ok(None)
    }

    pub async fn by_username(pool: &SqlitePool, username: &str) -> Result<Option<Self>, ApiError> {
        Ok(sqlx::query_as("SELECT * FROM users WHERE username = ? COLLATE NOCASE")
            .bind(username.trim())
            .fetch_optional(pool)
            .await?)
    }

    /// Forget a reset that was asked for or answered. Only changes the record.
    pub fn close_reset(&mut self) {
        (self.reset_requested_at, self.reset_allowed_until, self.reset_code_hash, self.reset_attempts) = (None, None, None, 0);
    }

    /// Store a new password and close any reset that was asked for or allowed.
    pub async fn set_password(&mut self, pool: &SqlitePool, password: &str, must_change: bool) -> Result<(), ApiError> {
        self.password_hash = hash_password(password)?;
        self.must_change_password = must_change;
        self.close_reset();
        sqlx::query(
            "UPDATE users SET password_hash = ?, must_change_password = ?, reset_requested_at = NULL, reset_allowed_until = NULL,
             reset_code_hash = NULL, reset_attempts = 0, updated_at = ? WHERE id = ?",
        )
        .bind(&self.password_hash)
        .bind(must_change)
        .bind(Utc::now())
        .bind(&self.id)
        .execute(pool)
        .await?;
        Ok(())
    }

    pub async fn insert(&self, pool: &SqlitePool) -> Result<(), ApiError> {
        sqlx::query(
            "INSERT INTO users (id, username, email, password_hash, role, all_rooms, avatar, kid, must_change_password, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&self.id)
        .bind(&self.username)
        .bind(&self.email)
        .bind(&self.password_hash)
        .bind(&self.role)
        .bind(self.all_rooms)
        .bind(&self.avatar)
        .bind(self.kid)
        .bind(self.must_change_password)
        .bind(self.created_at)
        .bind(self.updated_at)
        .execute(pool)
        .await?;
        Ok(())
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UserDto {
    pub id: String,
    pub username: String,
    pub email: String,
    pub role: String,
    pub avatar: String,
    pub all_rooms: bool,
    /// Rooms granted as a whole.
    pub room_ids: Vec<String>,
    /// Devices granted one by one. A device grant overrides the grant of its room.
    pub device_ids: Vec<String>,
    /// The granted rooms and devices the user may see but not control.
    pub view_only_room_ids: Vec<String>,
    pub view_only_device_ids: Vec<String>,
    /// The granted rooms and devices the user may also rename (edit implies control).
    pub edit_room_ids: Vec<String>,
    pub edit_device_ids: Vec<String>,
    pub kid: bool,
    pub must_change_password: bool,
    /// The user asked for a password reset and no administrator has answered yet.
    pub reset_requested: bool,
    /// A one-time reset code is waiting to be used, until `reset_allowed_until`.
    pub reset_allowed: bool,
    pub reset_allowed_until: Option<DateTime<Utc>>,
    /// The one-time code, sent once to the administrator who issued it.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub reset_code: Option<String>,
    /// The password Domus made up, sent once to the administrator who created or reset the account.
    #[serde(skip_serializing_if = "Option::is_none")]
    pub generated_password: Option<String>,
    pub created_at: DateTime<Utc>,
}

impl UserDto {
    pub async fn load(pool: &SqlitePool, u: &UserRecord) -> Result<Self, ApiError> {
        Ok(Self::from_record(u, grants(pool, "room", &u.id).await?, grants(pool, "device", &u.id).await?))
    }

    pub fn from_record(u: &UserRecord, rooms: Vec<Grant>, devices: Vec<Grant>) -> Self {
        let view_only = |g: &[Grant]| g.iter().filter(|g| !g.1).map(|g| g.0.clone()).collect();
        let edit = |g: &[Grant]| g.iter().filter(|g| g.1 && g.2).map(|g| g.0.clone()).collect();
        let avatar = u
            .avatar
            .as_deref()
            .filter(|a| !a.trim().is_empty())
            .map(|a| a.to_string())
            .unwrap_or_else(|| format!("dicebear:bottts:{}", u.username.trim()));
        Self {
            id: u.id.clone(),
            username: u.username.clone(),
            email: u.email.clone(),
            role: u.role.clone(),
            avatar,
            all_rooms: u.all_rooms,
            view_only_room_ids: view_only(&rooms),
            view_only_device_ids: view_only(&devices),
            edit_room_ids: edit(&rooms),
            edit_device_ids: edit(&devices),
            room_ids: rooms.into_iter().map(|g| g.0).collect(),
            device_ids: devices.into_iter().map(|g| g.0).collect(),
            kid: u.kid,
            must_change_password: u.must_change_password,
            reset_requested: u.reset_requested_at.is_some(),
            reset_allowed: u.reset_allowed(),
            reset_allowed_until: u.reset_allowed_until.filter(|_| u.reset_allowed()),
            reset_code: None,
            generated_password: None,
            created_at: u.created_at,
        }
    }
}

/// One grant: the room or device id, may control, may edit.
pub type Grant = (String, bool, bool);

/// The user's `room` or `device` grants.
pub async fn grants(pool: &SqlitePool, kind: &str, user_id: &str) -> Result<Vec<Grant>, ApiError> {
    Ok(sqlx::query_as(&format!("SELECT {kind}_id, can_control, can_edit FROM user_{kind}_access WHERE user_id = ?"))
        .bind(user_id)
        .fetch_all(pool)
        .await?)
}

/// A password to hand over: 12 characters without the look-alikes (0/O, 1/l/I).
pub fn generate_password() -> String {
    const CHARS: &[u8] = b"abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    (0..12).map(|_| CHARS[OsRng.gen_range(0..CHARS.len())] as char).collect()
}

/// Wrong codes a reset code survives.
pub const RESET_TRIES: i64 = 5;
/// How long a reset code is good for.
pub const RESET_MINUTES: i64 = 30;

/// A one-time reset code: 8 digits, easy to read out and type on a phone.
pub fn generate_reset_code() -> String {
    format!("{:08}", OsRng.gen_range(0..100_000_000u32))
}

pub fn hash_password(password: &str) -> Result<String, ApiError> {
    let salt = SaltString::generate(&mut OsRng);
    Argon2::default()
        .hash_password(password.as_bytes(), &salt)
        .map(|h| h.to_string())
        .map_err(|e| ApiError::Internal(format!("Failed to hash password: {e}")))
}

pub fn verify_password(password: &str, hash: &str) -> bool {
    PasswordHash::new(hash)
        .map(|h| Argon2::default().verify_password(password.as_bytes(), &h).is_ok())
        .unwrap_or(false)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn a_reset_window_closes_with_the_new_password() {
        let pool = crate::infrastructure::database::init_pool("sqlite::memory:", 1).await.unwrap();
        let now = Utc::now();
        let user = UserRecord {
            id: "u".into(),
            username: "Bea".into(),
            email: "bea@domus.home".into(),
            password_hash: hash_password(&generate_password()).unwrap(),
            role: "member".into(),
            all_rooms: true,
            avatar: None,
            kid: false,
            must_change_password: true,
            reset_requested_at: None,
            reset_allowed_until: None,
            reset_code_hash: None,
            reset_attempts: 0,
            created_at: now,
            updated_at: now,
        };
        user.insert(&pool).await.unwrap();
        assert!(!user.reset_allowed());
        let issue = |until: DateTime<Utc>| {
            let pool = pool.clone();
            async move {
                sqlx::query("UPDATE users SET reset_requested_at = ?, reset_allowed_until = ?, reset_code_hash = ?, reset_attempts = 0")
                    .bind(now)
                    .bind(until)
                    .bind(hash_password("12345678").unwrap())
                    .execute(&pool)
                    .await
                    .unwrap();
            }
        };
        let redeem = |code: &'static str| {
            let pool = pool.clone();
            async move { UserRecord::redeem_reset_code(&pool, " bea ", code).await.unwrap() }
        };

        // The right code opens the account, however it was typed; the new password spends it.
        issue(now + chrono::Duration::minutes(RESET_MINUTES)).await;
        assert!(redeem("00000000").await.is_none());
        let mut user = redeem("1234 5678").await.unwrap();
        user.set_password(&pool, "a-new-password", false).await.unwrap();
        let user = UserRecord::by_username(&pool, "bea").await.unwrap().unwrap();
        assert!(verify_password("a-new-password", &user.password_hash));
        assert!(!user.reset_allowed() && !user.must_change_password && user.reset_requested_at.is_none());
        assert!(redeem("12345678").await.is_none());

        // An expired code is no good, and neither is one that was guessed at too often.
        issue(now - chrono::Duration::minutes(1)).await;
        assert!(redeem("12345678").await.is_none());
        issue(now + chrono::Duration::minutes(RESET_MINUTES)).await;
        for _ in 0..RESET_TRIES {
            assert!(redeem("00000000").await.is_none());
        }
        assert!(redeem("12345678").await.is_none());

        let generated = generate_password();
        assert!(generated.len() == 12 && !generated.contains(['0', 'O', '1', 'l', 'I']));
    }
}
