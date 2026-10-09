use super::model::{AuthResponse, LoginRequest, RegisterRequest, UserDto, UserRecord};
use super::repository::AuthRepository;
use crate::api::error::ApiError;
use crate::api::middleware::Claims;
use argon2::{
    password_hash::{PasswordHash, PasswordHasher, PasswordVerifier, SaltString},
    Argon2,
};
use rand::rngs::OsRng;
use chrono::{Duration, Utc};
use jsonwebtoken::{encode, EncodingKey, Header};
use uuid::Uuid;

pub struct AuthService {
    repo: AuthRepository,
    jwt_secret: String,
}

impl AuthService {
    pub fn new(repo: AuthRepository, jwt_secret: String) -> Self {
        Self { repo, jwt_secret }
    }

    pub async fn is_first_time_setup(&self) -> Result<bool, ApiError> {
        let count = self.repo.count_users().await.map_err(|e| ApiError::Internal(e.to_string()))?;
        Ok(count == 0)
    }

    pub async fn register(&self, req: RegisterRequest) -> Result<AuthResponse, ApiError> {
        if self.repo.find_by_username(&req.username).await.map_err(|e| ApiError::Internal(e.to_string()))?.is_some() {
            return Err(ApiError::Conflict("Username already taken".into()));
        }

        let total_users = self.repo.count_users().await.map_err(|e| ApiError::Internal(e.to_string()))?;
        // First user registered is automatically Admin
        let role = if total_users == 0 {
            "admin".to_string()
        } else {
            req.role.unwrap_or_else(|| "member".into())
        };

        let salt = SaltString::generate(&mut OsRng);
        let argon2 = Argon2::default();
        let password_hash = argon2
            .hash_password(req.password.as_bytes(), &salt)
            .map_err(|e| ApiError::Internal(format!("Failed to hash password: {}", e)))?
            .to_string();

        let id = Uuid::new_v4();
        let now = Utc::now();
        let record = UserRecord {
            id: id.to_string(),
            username: req.username.clone(),
            email: req.email.clone(),
            password_hash,
            role: role.clone(),
            created_at: now,
            updated_at: now,
        };

        self.repo.create_user(&record).await.map_err(|e| ApiError::Internal(e.to_string()))?;

        let token = self.generate_token(id, &role)?;
        Ok(AuthResponse {
            token,
            user: UserDto {
                id,
                username: req.username,
                email: req.email,
                role,
            },
        })
    }

    pub async fn login(&self, req: LoginRequest) -> Result<AuthResponse, ApiError> {
        let user = self
            .repo
            .find_by_username(&req.username)
            .await
            .map_err(|e| ApiError::Internal(e.to_string()))?
            .ok_or_else(|| ApiError::Unauthorized("Invalid credentials".into()))?;

        let parsed_hash = PasswordHash::new(&user.password_hash)
            .map_err(|e| ApiError::Internal(format!("Hash parsing error: {}", e)))?;

        Argon2::default()
            .verify_password(req.password.as_bytes(), &parsed_hash)
            .map_err(|_| ApiError::Unauthorized("Invalid credentials".into()))?;

        let user_id = Uuid::parse_str(&user.id).map_err(|e| ApiError::Internal(e.to_string()))?;
        let token = self.generate_token(user_id, &user.role)?;

        Ok(AuthResponse {
            token,
            user: UserDto {
                id: user_id,
                username: user.username,
                email: user.email,
                role: user.role,
            },
        })
    }

    fn generate_token(&self, user_id: Uuid, role: &str) -> Result<String, ApiError> {
        let exp = (Utc::now() + Duration::hours(24)).timestamp() as usize;
        let claims = Claims {
            sub: user_id,
            role: role.to_string(),
            exp,
        };

        encode(
            &Header::default(),
            &claims,
            &EncodingKey::from_secret(self.jwt_secret.as_bytes()),
        )
        .map_err(|e| ApiError::Internal(format!("Failed to create token: {}", e)))
    }
}
