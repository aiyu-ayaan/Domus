use super::model::DeviceRecord;
use sqlx::SqlitePool;

pub struct DeviceRepository {
    pool: SqlitePool,
}

impl DeviceRepository {
    pub fn new(pool: SqlitePool) -> Self {
        Self { pool }
    }

    pub async fn list_all(&self) -> Result<Vec<DeviceRecord>, sqlx::Error> {
        sqlx::query_as::<_, DeviceRecord>("SELECT * FROM devices ORDER BY name ASC")
            .fetch_all(&self.pool)
            .await
    }

    pub async fn find_by_id(&self, id: &str) -> Result<Option<DeviceRecord>, sqlx::Error> {
        sqlx::query_as::<_, DeviceRecord>("SELECT * FROM devices WHERE id = ?")
            .bind(id)
            .fetch_optional(&self.pool)
            .await
    }

    pub async fn create(&self, device: &DeviceRecord) -> Result<(), sqlx::Error> {
        sqlx::query(
            r#"
            INSERT INTO devices (
                id, name, room_id, integration_type, device_type, model, ip_address, 
                mac_address, config_json, state_json, is_online, created_at, updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(&device.id)
        .bind(&device.name)
        .bind(&device.room_id)
        .bind(&device.integration_type)
        .bind(&device.device_type)
        .bind(&device.model)
        .bind(&device.ip_address)
        .bind(&device.mac_address)
        .bind(&device.config_json)
        .bind(&device.state_json)
        .bind(device.is_online)
        .bind(&device.created_at)
        .bind(&device.updated_at)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn update_state(&self, id: &str, state_json: &str) -> Result<(), sqlx::Error> {
        sqlx::query(
            "UPDATE devices SET state_json = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
        )
        .bind(state_json)
        .bind(id)
        .execute(&self.pool)
        .await?;

        Ok(())
    }

    pub async fn delete(&self, id: &str) -> Result<(), sqlx::Error> {
        sqlx::query("DELETE FROM devices WHERE id = ?")
            .bind(id)
            .execute(&self.pool)
            .await?;
        Ok(())
    }
}
