//! Linked integration accounts. Credentials are always sealed with the vault.

use crate::infrastructure::crypto::Vault;
use chrono::{DateTime, Utc};
use home_core::{AccountContext, CoreError, CredentialStore};
use serde::Serialize;
use serde_json::Value;
use sqlx::SqlitePool;
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, sqlx::FromRow)]
pub struct AccountRecord {
    pub id: String,
    pub integration_type: String,
    pub name: String,
    #[serde(skip)]
    pub credentials_enc: String,
    pub status: String,
    pub last_error: Option<String>,
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct AccountStore {
    pool: SqlitePool,
    vault: Vault,
}

impl AccountStore {
    pub fn new(pool: SqlitePool, vault: Vault) -> Self {
        Self { pool, vault }
    }

    pub async fn list(&self, integration: Option<&str>) -> sqlx::Result<Vec<AccountRecord>> {
        match integration {
            Some(t) => {
                sqlx::query_as("SELECT * FROM integration_accounts WHERE integration_type = ? ORDER BY created_at")
                    .bind(t)
                    .fetch_all(&self.pool)
                    .await
            }
            None => {
                sqlx::query_as("SELECT * FROM integration_accounts ORDER BY created_at")
                    .fetch_all(&self.pool)
                    .await
            }
        }
    }

    pub async fn contexts(&self, integration: &str) -> anyhow::Result<Vec<AccountContext>> {
        let mut out = Vec::new();
        for a in self.list(Some(integration)).await? {
            match self.vault.open_json::<Value>(&a.credentials_enc) {
                Ok(credentials) => out.push(AccountContext { id: a.id, credentials }),
                Err(e) => tracing::error!("cannot decrypt credentials for account {}: {e}", a.id),
            }
        }
        Ok(out)
    }

    pub async fn create(&self, integration: &str, name: &str, credentials: &Value) -> anyhow::Result<String> {
        let id = Uuid::new_v4().to_string();
        let now = Utc::now();
        sqlx::query(
            "INSERT INTO integration_accounts (id, integration_type, name, credentials_enc, status, created_at, updated_at)
             VALUES (?, ?, ?, ?, 'ok', ?, ?)",
        )
        .bind(&id)
        .bind(integration)
        .bind(name)
        .bind(self.vault.seal_json(credentials)?)
        .bind(now)
        .bind(now)
        .execute(&self.pool)
        .await?;
        Ok(id)
    }

    /// Find an account of this integration with the same login, to update instead of duplicating.
    pub async fn find_by_name(&self, integration: &str, name: &str) -> sqlx::Result<Option<AccountRecord>> {
        sqlx::query_as("SELECT * FROM integration_accounts WHERE integration_type = ? AND name = ?")
            .bind(integration)
            .bind(name)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn update_credentials(&self, id: &str, credentials: &Value) -> anyhow::Result<()> {
        sqlx::query("UPDATE integration_accounts SET credentials_enc = ?, status = 'ok', last_error = NULL, updated_at = ? WHERE id = ?")
            .bind(self.vault.seal_json(credentials)?)
            .bind(Utc::now())
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn set_status(&self, id: &str, error: Option<&str>) {
        let _ = sqlx::query("UPDATE integration_accounts SET status = ?, last_error = ?, updated_at = ? WHERE id = ?")
            .bind(if error.is_some() { "error" } else { "ok" })
            .bind(error)
            .bind(Utc::now())
            .bind(id)
            .execute(&self.pool)
            .await;
    }

    pub async fn delete(&self, id: &str) -> sqlx::Result<Option<AccountRecord>> {
        let rec: Option<AccountRecord> = sqlx::query_as("SELECT * FROM integration_accounts WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await?;
        sqlx::query("DELETE FROM integration_accounts WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(rec)
    }
}

#[async_trait::async_trait]
impl CredentialStore for AccountStore {
    async fn save_credentials(&self, account_id: &str, credentials: &Value) -> home_core::Result<()> {
        self.update_credentials(account_id, credentials)
            .await
            .map_err(|e| CoreError::Internal(e.to_string()))
    }
}
