pub mod routes;

use crate::api::error::ApiError;
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use chrono::{DateTime, Utc};
use rand::rngs::OsRng;
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
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

impl UserRecord {
    pub async fn insert(&self, pool: &SqlitePool) -> Result<(), ApiError> {
        sqlx::query(
            "INSERT INTO users (id, username, email, password_hash, role, all_rooms, avatar, created_at, updated_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&self.id)
        .bind(&self.username)
        .bind(&self.email)
        .bind(&self.password_hash)
        .bind(&self.role)
        .bind(self.all_rooms)
        .bind(&self.avatar)
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
    pub created_at: DateTime<Utc>,
}

impl UserDto {
    pub async fn load(pool: &SqlitePool, u: &UserRecord) -> Result<Self, ApiError> {
        Ok(Self::from_record(u, grants(pool, "room", &u.id).await?, grants(pool, "device", &u.id).await?))
    }

    pub fn from_record(u: &UserRecord, rooms: Vec<(String, bool)>, devices: Vec<(String, bool)>) -> Self {
        let view_only = |g: &[(String, bool)]| g.iter().filter(|g| !g.1).map(|g| g.0.clone()).collect();
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
            room_ids: rooms.into_iter().map(|g| g.0).collect(),
            device_ids: devices.into_iter().map(|g| g.0).collect(),
            created_at: u.created_at,
        }
    }
}

/// The user's `room` or `device` grants as (id, can control).
pub async fn grants(pool: &SqlitePool, kind: &str, user_id: &str) -> Result<Vec<(String, bool)>, ApiError> {
    Ok(sqlx::query_as(&format!("SELECT {kind}_id, can_control FROM user_{kind}_access WHERE user_id = ?"))
        .bind(user_id)
        .fetch_all(pool)
        .await?)
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
