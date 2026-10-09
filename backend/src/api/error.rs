use axum::{
    http::StatusCode,
    response::{IntoResponse, Response},
    Json,
};
use home_core::CoreError;
use serde_json::json;

#[derive(Debug, thiserror::Error)]
pub enum ApiError {
    #[error("Bad Request: {0}")]
    BadRequest(String),
    #[error("Unauthorized: {0}")]
    Unauthorized(String),
    #[error("Forbidden: {0}")]
    Forbidden(String),
    #[error("Not Found: {0}")]
    NotFound(String),
    #[error("Conflict: {0}")]
    Conflict(String),
    /// Upstream device/cloud failure; message is safe to show.
    #[error("Bad Gateway: {0}")]
    Upstream(String),
    #[error("Internal Server Error: {0}")]
    Internal(String),
}

pub type ApiResult<T> = Result<T, ApiError>;

impl IntoResponse for ApiError {
    fn into_response(self) -> Response {
        let (status, message) = match self {
            ApiError::BadRequest(msg) => (StatusCode::BAD_REQUEST, msg),
            ApiError::Unauthorized(msg) => (StatusCode::UNAUTHORIZED, msg),
            ApiError::Forbidden(msg) => (StatusCode::FORBIDDEN, msg),
            ApiError::NotFound(msg) => (StatusCode::NOT_FOUND, msg),
            ApiError::Conflict(msg) => (StatusCode::CONFLICT, msg),
            ApiError::Upstream(msg) => (StatusCode::BAD_GATEWAY, msg),
            ApiError::Internal(msg) => {
                tracing::error!("internal error: {msg}");
                (StatusCode::INTERNAL_SERVER_ERROR, "Internal server error".to_string())
            }
        };

        let body = Json(json!({
            "error": {
                "message": message,
                "status": status.as_u16(),
            }
        }));

        (status, body).into_response()
    }
}

impl From<sqlx::Error> for ApiError {
    fn from(e: sqlx::Error) -> Self {
        if let sqlx::Error::Database(db) = &e {
            if db.is_unique_violation() {
                return ApiError::Conflict("Already exists".into());
            }
            if db.is_foreign_key_violation() {
                return ApiError::BadRequest("Referenced item does not exist".into());
            }
        }
        ApiError::Internal(e.to_string())
    }
}

impl From<anyhow::Error> for ApiError {
    fn from(e: anyhow::Error) -> Self {
        ApiError::Internal(format!("{e:#}"))
    }
}

impl From<CoreError> for ApiError {
    fn from(e: CoreError) -> Self {
        match e {
            CoreError::NotFound(m) => ApiError::NotFound(m),
            CoreError::ValidationError(m) => ApiError::BadRequest(m),
            CoreError::AuthError(m) => ApiError::Upstream(format!("Authentication failed: {m}")),
            CoreError::IntegrationError(m) => ApiError::Upstream(m),
            CoreError::Unsupported(m) => ApiError::BadRequest(format!("Not supported: {m}")),
            CoreError::Internal(m) => ApiError::Internal(m),
        }
    }
}
