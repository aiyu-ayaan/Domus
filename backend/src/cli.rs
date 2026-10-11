//! Admin commands run from the same binary, e.g. `domus-backend reset-password <username>`.
//! They talk to the database directly, so they work while the server is running or stopped.
use crate::config::AppConfig;
use crate::infrastructure::database::init_pool;
use crate::modules::auth::{hash_password, routes::validate_credentials};
use rand::{distributions::Alphanumeric, Rng};

const USAGE: &str = "Usage:\n  domus-backend reset-password <username> [new-password]\n  domus-backend restore <backup-file>\n\nWithout a password a random one is generated and printed.\nStop the server before a restore; the current database and key are kept as *.before-restore.";

/// Runs a command when the arguments name one; returns false when the server should start instead.
pub async fn run(args: &[String]) -> anyhow::Result<bool> {
    match args.first().map(String::as_str) {
        Some("reset-password") => reset_password(&args[1..]).await.map(|_| true),
        Some("restore") => restore(&args[1..]).await.map(|_| true),
        Some("help" | "--help" | "-h") => {
            println!("{USAGE}");
            Ok(true)
        }
        _ => Ok(false),
    }
}

async fn reset_password(args: &[String]) -> anyhow::Result<()> {
    let Some(username) = args.first() else { anyhow::bail!("{USAGE}") };
    let generated = args.get(1).is_none();
    let password = args
        .get(1)
        .cloned()
        .unwrap_or_else(|| rand::thread_rng().sample_iter(Alphanumeric).take(16).map(char::from).collect());
    validate_credentials(username, &password).map_err(|e| anyhow::anyhow!("{e}"))?;

    let config = AppConfig::load()?;
    let pool = init_pool(&config.database.url, 1).await?;
    let hash = hash_password(&password).map_err(|e| anyhow::anyhow!("{e}"))?;
    let done = sqlx::query("UPDATE users SET password_hash = ?, updated_at = ? WHERE username = ? COLLATE NOCASE")
        .bind(hash)
        .bind(chrono::Utc::now())
        .bind(username.trim())
        .execute(&pool)
        .await?;
    if done.rows_affected() == 0 {
        anyhow::bail!("No user named '{username}'");
    }
    println!("Password for '{username}' changed.");
    if generated {
        println!("New password: {password}");
    }
    Ok(())
}

async fn restore(args: &[String]) -> anyhow::Result<()> {
    let Some(file) = args.first() else { anyhow::bail!("{USAGE}") };
    let config = AppConfig::load()?;
    let db = config.database.url.trim_start_matches("sqlite://").split('?').next().unwrap_or_default().to_string();
    crate::infrastructure::backup::restore(file.as_ref(), db.as_ref(), &config.server.data_dir).await?;
    println!("Restored {file} to {db}. Start the server again.");
    Ok(())
}
