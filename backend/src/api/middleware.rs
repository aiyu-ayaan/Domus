use crate::api::error::ApiError;
use axum::{
    extract::Request,
    http::header::AUTHORIZATION,
    middleware::Next,
    response::Response,
};
use jsonwebtoken::{decode, DecodingKey, Validation};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Claims {
    pub sub: Uuid,
    pub role: String,
    pub exp: usize,
}

pub async fn auth_middleware(
    mut req: Request,
    next: Next,
) -> Result<Response, ApiError> {
    // If request is to auth endpoint or health check, skip
    let path = req.uri().path();
    if path.starts_with("/api/v1/auth") || path == "/api/v1/health" {
        return Ok(next.run(req).await);
    }

    let auth_header = req
        .headers()
        .get(AUTHORIZATION)
        .and_then(|val| val.to_str().ok());

    match auth_header {
        Some(auth) if auth.starts_with("Bearer ") => {
            let token = &auth[7..];
            // Decode token using default secret for now
            let key = DecodingKey::from_secret("docus-default-secret-key-change-in-prod".as_bytes());
            let token_data = decode::<Claims>(token, &key, &Validation::default())
                .map_err(|e| ApiError::Unauthorized(format!("Invalid token: {}", e)))?;

            req.extensions_mut().insert(token_data.claims);
            Ok(next.run(req).await)
        }
        _ => Err(ApiError::Unauthorized("Missing or invalid Authorization header".into())),
    }
}
