//! Обновление из приложения: скачиваем установщик новой версии с GitHub Releases,
//! проверяем SHA-256 (из данных релиза) и запускаем его. Адрес проверяется: только
//! файлы релизов нашего репозитория на github.com.

use sha2::{Digest, Sha256};
use std::io::{Read, Write};
use tauri::{AppHandle, Emitter, Manager};

const ALLOWED_PREFIXES: &[&str] = &[
    "https://github.com/fvackingsonic/macgram/releases/download/",
    "https://github.com/fvackingsonic/mactele/releases/download/",
];

fn hex(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{b:02x}")).collect()
}

#[tauri::command]
pub async fn update_install(app: AppHandle, url: String, sha256: String) -> Result<(), String> {
    if !ALLOWED_PREFIXES.iter().any(|p| url.starts_with(p)) || !url.ends_with(".exe") {
        return Err("адрес обновления не из официального репозитория macgram".into());
    }
    let expected = sha256.trim().trim_start_matches("sha256:").to_ascii_lowercase();
    if expected.len() != 64 || !expected.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("у обновления нет контрольной суммы — установка отменена".into());
    }
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("updates");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let path = dir.join("macgram-update-setup.exe");
    let app2 = app.clone();
    let path2 = path.clone();
    // Скачивание — в отдельном потоке, с событиями прогресса для интерфейса.
    tauri::async_runtime::spawn_blocking(move || -> Result<(), String> {
        let resp = ureq::get(&url)
            .set("User-Agent", "macgram-updater")
            .call()
            .map_err(|e| format!("не удалось скачать: {e}"))?;
        let total: u64 = resp.header("Content-Length").and_then(|v| v.parse().ok()).unwrap_or(0);
        let mut reader = resp.into_reader().take(300 * 1024 * 1024);
        let mut file = std::fs::File::create(&path2).map_err(|e| e.to_string())?;
        let mut hasher = Sha256::new();
        let mut buf = vec![0u8; 64 * 1024];
        let mut done: u64 = 0;
        let mut last = 0u64;
        loop {
            let n = reader.read(&mut buf).map_err(|e| format!("обрыв загрузки: {e}"))?;
            if n == 0 { break; }
            hasher.update(&buf[..n]);
            file.write_all(&buf[..n]).map_err(|e| e.to_string())?;
            done += n as u64;
            if done - last > 256 * 1024 || done == total {
                last = done;
                let _ = app2.emit("update-progress", serde_json::json!({ "done": done, "total": total }));
            }
        }
        drop(file);
        let got = hex(&hasher.finalize());
        if got != expected {
            let _ = std::fs::remove_file(&path2);
            return Err("контрольная сумма не совпала — файл повреждён или подменён, установка отменена".into());
        }
        Ok(())
    })
    .await
    .map_err(|e| e.to_string())??;

    // Запускаем установщик и закрываем программу, чтобы он мог заменить файлы.
    std::process::Command::new(&path)
        .spawn()
        .map_err(|e| format!("не удалось запустить установщик: {e}"))?;
    app.exit(0);
    Ok(())
}

/// Данные последнего релиза. Сначала API GitHub; если он отказал (лимит запросов без ключа, 403) —
/// берём страницу со списком файлов релиза: она не упирается в этот лимит.
#[tauri::command]
pub async fn update_release() -> Result<serde_json::Value, String> {
    tauri::async_runtime::spawn_blocking(|| -> Result<serde_json::Value, String> {
        for repo in ["fvackingsonic/macgram", "fvackingsonic/mactele"] {
            let url = format!("https://api.github.com/repos/{repo}/releases/tags/latest");
            if let Ok(r) = ureq::get(&url).set("User-Agent", "macgram-updater").set("Accept", "application/vnd.github+json").call() {
                if let Ok(text) = r.into_string() {
                    if let Ok(v) = serde_json::from_str::<serde_json::Value>(&text) { return Ok(v); }
                }
            }
        }
        for repo in ["fvackingsonic/macgram", "fvackingsonic/mactele"] {
            let url = format!("https://github.com/{repo}/releases/expanded_assets/latest");
            let Ok(r) = ureq::get(&url).set("User-Agent", "macgram-updater").call() else { continue };
            let Ok(page) = r.into_string() else { continue };
            let marker = "_x64-setup.exe";
            let Some(end) = page.find(marker) else { continue };
            let Some(start) = page[..end].rfind("/fvackingsonic/") else { continue };
            let path = format!("{}{}", &page[start..end], marker);
            if !path.contains("/releases/download/") { continue; }
            let name = path.rsplit('/').next().unwrap_or("").to_string();
            let tail = &page[end..];
            let digest = tail.find("sha256:").map(|i| tail[i..].chars().take(71).collect::<String>()).unwrap_or_default();
            let ver = name.split('_').nth(1).unwrap_or("").to_string();
            return Ok(serde_json::json!({
                "name": format!("macgram {ver}"), "tag_name": "latest", "body": "", "html_url": format!("https://github.com/{repo}/releases/tag/latest"),
                "assets": [{ "name": name, "browser_download_url": format!("https://github.com{path}"), "size": 0, "digest": digest }]
            }));
        }
        Err("GitHub не отвечает".into())
    }).await.map_err(|e| e.to_string())?
}
