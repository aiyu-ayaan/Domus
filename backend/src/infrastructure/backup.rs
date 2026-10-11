//! One-file backup: a copy of the database that also carries the master key, so the sealed
//! integration credentials in it can still be opened after a restore.

use crate::infrastructure::crypto::write_private;
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use sqlx::{Connection, SqliteConnection, SqlitePool};
use std::path::Path;

/// Setting that holds the master key inside a backup file. The live database never has it.
const KEY_SETTING: &str = "backup_master_key";
const MASTER_KEY: &str = "master.key";

/// Write a consistent copy of the live database to `file`. The key is left out when it comes
/// from `DOMUS_MASTER_KEY` rather than `data_dir/master.key`; whoever set it already keeps it.
pub async fn write(pool: &SqlitePool, data_dir: &Path, file: &Path) -> anyhow::Result<()> {
    let file = file.to_string_lossy();
    let mut conn = pool.acquire().await?;
    sqlx::query("VACUUM INTO ?").bind(file.as_ref()).execute(&mut *conn).await?;
    let Ok(key) = std::fs::read(data_dir.join(MASTER_KEY)) else { return Ok(()) };
    sqlx::query("ATTACH DATABASE ? AS bak").bind(file.as_ref()).execute(&mut *conn).await?;
    let stored = sqlx::query("INSERT INTO bak.app_settings (key, value_json) VALUES (?, ?)")
        .bind(KEY_SETTING)
        .bind(serde_json::to_string(&B64.encode(key))?)
        .execute(&mut *conn)
        .await;
    // The connection goes back to the pool, so it must not keep the file attached.
    sqlx::query("DETACH DATABASE bak").execute(&mut *conn).await?;
    stored?;
    Ok(())
}

/// Put `backup` in place of the database at `db` and its key in `data_dir`. What was there is
/// kept next to it as `*.before-restore`. The server must not be running.
pub async fn restore(backup: &Path, db: &Path, data_dir: &Path) -> anyhow::Result<()> {
    let with = |suffix: &str| std::path::PathBuf::from(format!("{}{suffix}", db.display()));
    let staged = with(".restoring");
    std::fs::copy(backup, &staged)?;
    let key = match take_key(&staged).await {
        Ok(key) => key,
        Err(_) => {
            let _ = std::fs::remove_file(&staged);
            anyhow::bail!("{} is not a Domus backup", backup.display());
        }
    };

    // The old write-ahead log belongs to the old database: left in place it would corrupt the new one.
    for suffix in ["", "-wal", "-shm"] {
        if with(suffix).exists() {
            std::fs::rename(with(suffix), with(&format!("{suffix}.before-restore")))?;
        }
    }
    std::fs::rename(&staged, db)?;

    if let Some((json,)) = key {
        let bytes = B64.decode(serde_json::from_str::<String>(&json)?)?;
        let path = data_dir.join(MASTER_KEY);
        if path.exists() {
            std::fs::rename(&path, data_dir.join(format!("{MASTER_KEY}.before-restore")))?;
        }
        write_private(&path, &bytes)?;
    }
    Ok(())
}

/// Removes the master key from a staged backup and returns it; fails on anything but a Domus database.
async fn take_key(staged: &Path) -> anyhow::Result<Option<(String,)>> {
    let mut conn = SqliteConnection::connect(&format!("sqlite://{}", staged.display())).await?;
    let key = sqlx::query_as("SELECT value_json FROM app_settings WHERE key = ?").bind(KEY_SETTING).fetch_optional(&mut conn).await?;
    sqlx::query("DELETE FROM app_settings WHERE key = ?").bind(KEY_SETTING).execute(&mut conn).await?;
    conn.close().await?;
    Ok(key)
}

#[cfg(test)]
mod tests {
    use crate::infrastructure::database::{get_setting, init_pool, set_setting};

    #[tokio::test]
    async fn a_backup_brings_back_the_data_and_the_key() {
        let dir = std::env::temp_dir().join(format!("domus-backup-test-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&dir).unwrap();
        let (db, file) = (dir.join("domus.db"), dir.join("backup.db"));
        let url = format!("sqlite://{}?mode=rwc", db.display());

        let pool = init_pool(&url, 2).await.unwrap();
        set_setting(&pool, "marker", &"before").await.unwrap();
        std::fs::write(dir.join("master.key"), [7u8; 32]).unwrap();
        super::write(&pool, &dir, &file).await.unwrap();
        assert_eq!(get_setting::<String>(&pool, super::KEY_SETTING).await, None, "the key stays out of the live database");

        // Everything is lost or changed after the backup was taken.
        set_setting(&pool, "marker", &"after").await.unwrap();
        pool.close().await;
        std::fs::write(dir.join("master.key"), [9u8; 32]).unwrap();

        super::restore(&file, &db, &dir).await.unwrap();
        let pool = init_pool(&url, 1).await.unwrap();
        assert_eq!(get_setting::<String>(&pool, "marker").await.as_deref(), Some("before"));
        assert_eq!(get_setting::<String>(&pool, super::KEY_SETTING).await, None);
        assert_eq!(std::fs::read(dir.join("master.key")).unwrap(), [7u8; 32]);
        assert_eq!(std::fs::read(dir.join("master.key.before-restore")).unwrap(), [9u8; 32]);
        pool.close().await;

        // Something that is not a backup changes nothing and leaves nothing behind.
        std::fs::write(dir.join("notes.txt"), "not a database").unwrap();
        assert!(super::restore(&dir.join("notes.txt"), &db, &dir).await.is_err());
        assert!(!dir.join("domus.db.restoring").exists());
        assert_eq!(std::fs::read(dir.join("master.key")).unwrap(), [7u8; 32]);
        std::fs::remove_dir_all(&dir).unwrap();
    }
}
