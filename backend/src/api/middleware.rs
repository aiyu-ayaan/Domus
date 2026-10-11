use crate::api::error::ApiError;
use crate::api::AppState;
use axum::{
    async_trait,
    extract::{FromRequestParts, Request, State},
    http::{header::AUTHORIZATION, request::Parts},
    middleware::Next,
    response::Response,
};
use home_core::Role;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: String,
    pub role: String,
    pub iat: usize,
    pub exp: usize,
}

pub struct JwtKeys {
    encoding: EncodingKey,
    decoding: DecodingKey,
    expiry_hours: i64,
}

impl JwtKeys {
    pub fn new(secret: &[u8], expiry_hours: i64) -> Self {
        Self {
            encoding: EncodingKey::from_secret(secret),
            decoding: DecodingKey::from_secret(secret),
            expiry_hours,
        }
    }

    pub fn issue(&self, user_id: &str, role: Role) -> Result<String, ApiError> {
        let now = chrono::Utc::now();
        let claims = Claims {
            sub: user_id.to_string(),
            role: role.as_str().to_string(),
            iat: now.timestamp() as usize,
            exp: (now + chrono::Duration::hours(self.expiry_hours)).timestamp() as usize,
        };
        encode(&Header::default(), &claims, &self.encoding)
            .map_err(|e| ApiError::Internal(format!("Failed to create token: {e}")))
    }

    pub fn verify(&self, token: &str) -> Result<Claims, ApiError> {
        decode::<Claims>(token, &self.decoding, &Validation::default())
            .map(|d| d.claims)
            .map_err(|_| ApiError::Unauthorized("Invalid or expired session".into()))
    }
}

/// The authenticated caller, resolved against the database on every request
/// so role changes and deletions apply immediately.
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub id: String,
    pub username: String,
    pub role: Role,
    /// `true` when the user may see every room.
    pub all_rooms: bool,
}

impl AuthUser {
    pub fn is_admin(&self) -> bool {
        self.role == Role::Admin
    }

    pub fn require_admin(&self) -> Result<(), ApiError> {
        if self.is_admin() {
            Ok(())
        } else {
            Err(ApiError::Forbidden("Administrator access required".into()))
        }
    }

    pub fn require_control(&self) -> Result<(), ApiError> {
        if self.role.can_control() {
            Ok(())
        } else {
            Err(ApiError::Forbidden("Guests cannot control devices".into()))
        }
    }

    pub fn sees_everything(&self) -> bool {
        self.is_admin() || self.all_rooms
    }

    /// The account as it is stored now; `None` once it was deleted.
    pub async fn load(pool: &sqlx::SqlitePool, id: &str) -> Result<Option<Self>, ApiError> {
        let row: Option<(String, String, bool)> = sqlx::query_as("SELECT username, role, all_rooms FROM users WHERE id = ?")
            .bind(id)
            .fetch_optional(pool)
            .await?;
        Ok(row.map(|(username, role, all_rooms)| Self {
            id: id.to_string(),
            username,
            role: Role::parse(&role).unwrap_or(Role::Guest),
            all_rooms,
        }))
    }
}

#[async_trait]
impl<S: Send + Sync> FromRequestParts<S> for AuthUser {
    type Rejection = ApiError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        parts
            .extensions
            .get::<AuthUser>()
            .cloned()
            .ok_or_else(|| ApiError::Unauthorized("Not signed in".into()))
    }
}

fn token_from_request(req: &Request) -> Option<String> {
    if let Some(auth) = req.headers().get(AUTHORIZATION).and_then(|v| v.to_str().ok()) {
        if let Some(t) = auth.strip_prefix("Bearer ") {
            return Some(t.to_string());
        }
    }
    // Browsers cannot set headers on WebSocket upgrades.
    req.uri().query().and_then(|q| {
        q.split('&')
            .find_map(|kv| kv.strip_prefix("token=").map(|t| t.to_string()))
    })
}

pub async fn auth_middleware(
    State(state): State<AppState>,
    mut req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    let token = token_from_request(&req)
        .ok_or_else(|| ApiError::Unauthorized("Missing Authorization header".into()))?;
    let claims = state.jwt.verify(&token)?;

    let user = AuthUser::load(&state.pool, &claims.sub)
        .await?
        .ok_or_else(|| ApiError::Unauthorized("Account no longer exists".into()))?;
    req.extensions_mut().insert(user);
    Ok(next.run(req).await)
}
