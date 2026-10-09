use super::model::UserRecord;
use sqlx::SqlitePool;

pub struct AuthRepository {
    pool: SqlitePool,
}

impl AuthRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn count_users(&self) -> Result<i64, sqlx::Error> {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users")
            .fetch_one(&self.pool)
            .await?;
        Ok(count.0)
    }

    pub async fn create_user(&self, user: &UserRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO users (id, username, email, password_hash, role, created_at, updated_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&user.id)
        .bind(&user.username)
        .bind(&user.email)
        .bind(&user.password_hash)
        .bind(&user.role)
        .bind(&user.created_at)
        .bind(&user.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn find_by_username(&self, username: &str) -> Result<Option<UserRecord>, sqlx::Error> {
        sqlx::query_as::<_, UserRecord>(
            "SELECT id, username, email, password_hash, role, created_at, updated_at FROM users WHERE username = ?",
        )
        .bind(username)
        .fetch_optional(&self.pool)
        .await
    }
}
