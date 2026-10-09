//! At-rest encryption for integration credentials and device secrets.
//!
//! Values are sealed with AES-256-GCM under a master key that lives outside
//! the database (`DOCUS_MASTER_KEY` env var, or `<data_dir>/master.key`).

use aes_gcm::aead::{Aead, AeadCore, KeyInit, OsRng};
use aes_gcm::{Aes256Gcm, Key, Nonce};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use rand::RngCore;
use serde::{de::DeserializeOwned, Serialize};
use std::path::Path;

#[derive(Clone)]
pub struct Vault {
    cipher: Aes256Gcm,
}

impl Vault {
    pub fn new(key: [u8; 32]) -> Self {
        Self {
            cipher: Aes256Gcm::new(Key::<Aes256Gcm>::from_slice(&key)),
        }
    }

    /// Load the master key from `DOCUS_MASTER_KEY` (base64) or `data_dir/master.key`,
    /// creating the file on first start.
    pub fn load_or_create(data_dir: &Path) -> anyhow::Result<Self> {
        if let Ok(b64) = std::env::var("DOCUS_MASTER_KEY") {
            let bytes = B64.decode(b64.trim())?;
            let key: [u8; 32] = bytes
                .try_into()
                .map_err(|_| anyhow::anyhow!("DOCUS_MASTER_KEY must be 32 bytes (base64)"))?;
            return Ok(Self::new(key));
        }
        let bytes = read_or_create_secret(&data_dir.join("master.key"), 32)?;
        let key: [u8; 32] = bytes
            .try_into()
            .map_err(|_| anyhow::anyhow!("master.key is corrupt (expected 32 bytes)"))?;
        Ok(Self::new(key))
    }

    pub fn encrypt(&self, plaintext: &[u8]) -> anyhow::Result<String> {
        let nonce = Aes256Gcm::generate_nonce(&mut OsRng);
        let ct = self
            .cipher
            .encrypt(&nonce, plaintext)
            .map_err(|_| anyhow::anyhow!("encryption failed"))?;
        let mut out = nonce.to_vec();
        out.extend_from_slice(&ct);
        Ok(B64.encode(out))
    }

    pub fn decrypt(&self, sealed: &str) -> anyhow::Result<Vec<u8>> {
        let raw = B64.decode(sealed)?;
        if raw.len() < 12 {
            anyhow::bail!("sealed value too short");
        }
        let (nonce, ct) = raw.split_at(12);
        self.cipher
            .decrypt(Nonce::from_slice(nonce), ct)
            .map_err(|_| anyhow::anyhow!("decryption failed (wrong master key?)"))
    }

    pub fn seal_json<T: Serialize>(&self, value: &T) -> anyhow::Result<String> {
        self.encrypt(&serde_json::to_vec(value)?)
    }

    pub fn open_json<T: DeserializeOwned>(&self, sealed: &str) -> anyhow::Result<T> {
        Ok(serde_json::from_slice(&self.decrypt(sealed)?)?)
    }
}

/// Read a binary secret file, or create it with `len` random bytes (mode 0600).
pub fn read_or_create_secret(path: &Path, len: usize) -> anyhow::Result<Vec<u8>> {
    if path.exists() {
        return Ok(std::fs::read(path)?);
    }
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut bytes = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut bytes);
    write_private(path, &bytes)?;
    tracing::info!("Generated new secret at {}", path.display());
    Ok(bytes)
}

pub fn write_private(path: &Path, bytes: &[u8]) -> anyhow::Result<()> {
    std::fs::write(path, bytes)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(path, std::fs::Permissions::from_mode(0o600))?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn roundtrip() {
        let v = Vault::new([7u8; 32]);
        let sealed = v.seal_json(&serde_json::json!({"token": "abc"})).unwrap();
        assert!(!sealed.contains("abc"));
        let back: serde_json::Value = v.open_json(&sealed).unwrap();
        assert_eq!(back["token"], "abc");
        assert!(Vault::new([8u8; 32]).decrypt(&sealed).is_err());
    }
}
