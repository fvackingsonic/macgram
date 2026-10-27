//! Хранение секретов.
//! На Windows — в «Диспетчере учётных данных» (Credential Manager), он защищён учётной записью Windows.
//! На других системах (только для разработки) — в файле внутри папки приложения.

use base64::Engine;
use std::path::PathBuf;

const SERVICE: &str = "MacTele";

#[cfg(windows)]
pub fn get(_dir: &PathBuf, key: &str) -> Option<String> {
    keyring::Entry::new(SERVICE, key).ok()?.get_password().ok()
}

#[cfg(windows)]
pub fn set(_dir: &PathBuf, key: &str, value: &str) -> Result<(), String> {
    keyring::Entry::new(SERVICE, key)
        .and_then(|e| e.set_password(value))
        .map_err(|e| format!("не удалось сохранить в диспетчер учётных данных: {e}"))
}

#[cfg(not(windows))]
pub fn get(dir: &PathBuf, key: &str) -> Option<String> {
    std::fs::read_to_string(dir.join(format!(".{SERVICE}-{key}"))).ok()
}

#[cfg(not(windows))]
pub fn set(dir: &PathBuf, key: &str, value: &str) -> Result<(), String> {
    std::fs::create_dir_all(dir).map_err(|e| e.to_string())?;
    let p = dir.join(format!(".{SERVICE}-{key}"));
    std::fs::write(&p, value).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(&p, std::fs::Permissions::from_mode(0o600));
    }
    Ok(())
}

/// Ключ шифрования локальной базы TDLib: 32 случайных байта, создаётся один раз.
pub fn database_key(dir: &PathBuf) -> Result<String, String> {
    if let Some(k) = get(dir, "db-key") {
        return Ok(k);
    }
    let mut bytes = [0u8; 32];
    getrandom::getrandom(&mut bytes).map_err(|e| e.to_string())?;
    let k = base64::engine::general_purpose::STANDARD.encode(bytes);
    set(dir, "db-key", &k)?;
    Ok(k)
}
