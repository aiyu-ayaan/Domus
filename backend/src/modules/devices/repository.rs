use super::model::{DeviceRecord, DiscoveryRecord};
use chrono::Utc;
use sqlx::SqlitePool;

#[derive(Clone)]
pub struct DeviceRepository {
    pool: SqlitePool,
}

impl DeviceRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_all(&self) -> sqlx::Result<Vec<DeviceRecord>> {
        sqlx::query_as("SELECT * FROM devices ORDER BY name COLLATE NOCASE ASC")
            .fetch_all(&self.pool)
            .await
    }

    pub async fn list_by_integration(&self, integration: &str) -> sqlx::Result<Vec<DeviceRecord>> {
        sqlx::query_as("SELECT * FROM devices WHERE integration_type = ?")
            .bind(integration)
            .fetch_all(&self.pool)
            .await
    }

    pub async fn find_by_id(&self, id: &str) -> sqlx::Result<Option<DeviceRecord>> {
        sqlx::query_as("SELECT * FROM devices WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn find_by_external(&self, integration: &str, external_id: &str) -> sqlx::Result<Option<DeviceRecord>> {
        sqlx::query_as("SELECT * FROM devices WHERE integration_type = ? AND external_id = ?")
            .bind(integration)
            .bind(external_id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn insert(&self, d: &DeviceRecord) -> sqlx::Result<()> {
        sqlx::query(
            r#"INSERT INTO devices (
                id, name, room_id, integration_type, device_type, model, ip_address, mac_address,
                config_json, state_json, is_online, created_at, updated_at, external_id, account_id,
                secrets_enc, icon, last_seen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&d.id)
        .bind(&d.name)
        .bind(&d.room_id)
        .bind(&d.integration_type)
        .bind(&d.device_type)
        .bind(&d.model)
        .bind(&d.ip_address)
        .bind(&d.mac_address)
        .bind(&d.config_json)
        .bind(&d.state_json)
        .bind(d.is_online)
        .bind(d.created_at)
        .bind(d.updated_at)
        .bind(&d.external_id)
        .bind(&d.account_id)
        .bind(&d.secrets_enc)
        .bind(&d.icon)
        .bind(d.last_seen)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn update_meta(
        &self,
        id: &str,
        name: &str,
        room_id: Option<&str>,
        icon: Option<&str>,
        confirm_changes: bool,
    ) -> sqlx::Result<()> {
        sqlx::query("UPDATE devices SET name = ?, room_id = ?, icon = ?, confirm_changes = ?, updated_at = ? WHERE id = ?")
            .bind(name)
            .bind(room_id)
            .bind(icon)
            .bind(confirm_changes)
            .bind(Utc::now())
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn update_runtime(
        &self,
        id: &str,
        state_json: &str,
        is_online: bool,
        ip: Option<&str>,
        seen: bool,
    ) -> sqlx::Result<()> {
        let now = Utc::now();
        sqlx::query(
            "UPDATE devices SET state_json = ?, is_online = ?, ip_address = COALESCE(?, ip_address),
             last_seen = CASE WHEN ? THEN ? ELSE last_seen END, updated_at = ? WHERE id = ?",
        )
        .bind(state_json)
        .bind(is_online)
        .bind(ip)
        .bind(seen)
        .bind(now)
        .bind(now)
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    /// Refresh connection details learned by discovery.
    pub async fn update_connection(
        &self,
        id: &str,
        ip: Option<&str>,
        config_json: &str,
        secrets_enc: Option<&str>,
        account_id: Option<&str>,
    ) -> sqlx::Result<()> {
        sqlx::query(
            "UPDATE devices SET ip_address = COALESCE(?, ip_address), config_json = ?,
             secrets_enc = COALESCE(?, secrets_enc), account_id = COALESCE(?, account_id), updated_at = ? WHERE id = ?",
        )
        .bind(ip)
        .bind(config_json)
        .bind(secrets_enc)
        .bind(account_id)
        .bind(Utc::now())
        .bind(id)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn delete(&self, id: &str) -> sqlx::Result<()> {
        sqlx::query("DELETE FROM devices WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    // --- discovery inbox -------------------------------------------------

    pub async fn discoveries(&self, status: &str) -> sqlx::Result<Vec<DiscoveryRecord>> {
        sqlx::query_as("SELECT * FROM discovered_devices WHERE status = ? ORDER BY discovered_at DESC")
            .bind(status)
            .fetch_all(&self.pool)
            .await
    }

    pub async fn discovery(&self, id: &str) -> sqlx::Result<Option<DiscoveryRecord>> {
        sqlx::query_as("SELECT * FROM discovered_devices WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn discovery_by_external(&self, integration: &str, external_id: &str) -> sqlx::Result<Option<DiscoveryRecord>> {
        sqlx::query_as("SELECT * FROM discovered_devices WHERE integration_type = ? AND external_id = ?")
            .bind(integration)
            .bind(external_id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn upsert_discovery(&self, r: &DiscoveryRecord) -> sqlx::Result<()> {
        sqlx::query(
            r#"INSERT INTO discovered_devices (
                id, integration_type, external_id, account_id, name, device_type, model, ip_address,
                mac_address, config_json, secrets_enc, note, status, discovered_at, last_seen
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT(integration_type, external_id) DO UPDATE SET
                account_id = excluded.account_id, name = excluded.name, device_type = excluded.device_type,
                model = excluded.model, ip_address = excluded.ip_address, mac_address = excluded.mac_address,
                config_json = excluded.config_json, secrets_enc = excluded.secrets_enc,
                note = excluded.note, last_seen = excluded.last_seen"#,
        )
        .bind(&r.id)
        .bind(&r.integration_type)
        .bind(&r.external_id)
        .bind(&r.account_id)
        .bind(&r.name)
        .bind(&r.device_type)
        .bind(&r.model)
        .bind(&r.ip_address)
        .bind(&r.mac_address)
        .bind(&r.config_json)
        .bind(&r.secrets_enc)
        .bind(&r.note)
        .bind(&r.status)
        .bind(r.discovered_at)
        .bind(r.last_seen)
        .execute(&self.pool)
        .await?;
        Ok(())
    }

    pub async fn set_discovery_status(&self, id: &str, status: &str) -> sqlx::Result<()> {
        sqlx::query("UPDATE discovered_devices SET status = ? WHERE id = ?")
            .bind(status)
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }

    pub async fn delete_discovery_for(&self, integration: &str, external_id: &str) -> sqlx::Result<()> {
        sqlx::query("DELETE FROM discovered_devices WHERE integration_type = ? AND external_id = ?")
            .bind(integration)
            .bind(external_id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
