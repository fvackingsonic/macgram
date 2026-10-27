//! Связь с Windows: выбор файлов, перетаскивание, вставка из буфера, уведомления, счётчик на значке.
//! Доступ интерфейса к файлам открывается только для тех, что выбрал сам пользователь.

use base64::Engine;
use std::path::{Path, PathBuf};
use tauri::{AppHandle, DragDropEvent, Emitter, Manager, Window, WindowEvent};
use tauri_plugin_dialog::DialogExt;
use tauri_plugin_notification::NotificationExt;

fn allow(app: &AppHandle, path: &Path) {
    let _ = app.asset_protocol_scope().allow_file(path);
}

fn to_strings(app: &AppHandle, paths: &[PathBuf]) -> Vec<String> {
    paths
        .iter()
        .filter(|p| p.is_file())
        .map(|p| {
            allow(app, p);
            p.to_string_lossy().into_owned()
        })
        .collect()
}

#[tauri::command]
pub async fn pick_files(app: AppHandle, media: bool) -> Result<Vec<String>, String> {
    let mut dialog = app.dialog().file().set_title(if media { "Фото и видео" } else { "Выберите файлы" });
    if media {
        dialog = dialog.add_filter("Фото и видео", &["jpg", "jpeg", "png", "webp", "gif", "heic", "mp4", "mov", "webm", "mkv"]);
    }
    let picked = dialog.blocking_pick_files().unwrap_or_default();
    let paths: Vec<PathBuf> = picked.into_iter().filter_map(|p| p.into_path().ok()).collect();
    Ok(to_strings(&app, &paths))
}

/// Свои шрифты: для интерфейса можно выбрать сразу несколько файлов (разные начертания),
/// для смайликов — один. Файлы копируются в папку программы.
#[tauri::command]
pub async fn pick_font(app: AppHandle, kind: String) -> Result<Vec<String>, String> {
    let emoji = kind == "emoji";
    let dialog = app
        .dialog()
        .file()
        .set_title(if emoji { "Шрифт смайликов" } else { "Шрифты интерфейса (можно выбрать несколько)" })
        .add_filter("Шрифты", &["ttf", "otf", "woff", "woff2"]);
    let picked: Vec<PathBuf> = if emoji {
        dialog.blocking_pick_file().and_then(|p| p.into_path().ok()).into_iter().collect()
    } else {
        dialog.blocking_pick_files().unwrap_or_default().into_iter().filter_map(|p| p.into_path().ok()).collect()
    };
    if picked.is_empty() {
        return Ok(vec![]);
    }
    // Проверяем размер до того, как удалить прежние шрифты.
    for src in picked.iter() {
        // Очень большие шрифты (сотни МБ картинок-смайликов) подвешивают окно: не принимаем их.
        let limit: u64 = if emoji { 60 } else { 30 } * 1024 * 1024;
        let size = std::fs::metadata(src).map(|m| m.len()).unwrap_or(0);
        if size > limit {
            return Err(format!(
                "Файл {} слишком большой ({} МБ). Можно до {} МБ — такие шрифты подвешивают программу.",
                src.file_name().and_then(|n| n.to_str()).unwrap_or("шрифта"),
                size / 1024 / 1024,
                limit / 1024 / 1024
            ));
        }
    }
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("fonts").join(if emoji { "emoji" } else { "ui" });
    let _ = std::fs::remove_dir_all(&dir);
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut out = Vec::new();
    for src in picked.iter().take(32) {
        let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
        if !matches!(ext.as_str(), "ttf" | "otf" | "woff" | "woff2") {
            continue;
        }
        let name: String = src
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("font")
            .chars()
            .map(|c| if c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' { c } else { '_' })
            .collect();
        let dst = dir.join(&name);
        std::fs::copy(src, &dst).map_err(|e| format!("не удалось скопировать шрифт: {e}"))?;
        allow(&app, &dst);
        out.push(dst.to_string_lossy().into_owned());
    }
    if out.is_empty() {
        return Err("нужны файлы .ttf, .otf, .woff или .woff2".into());
    }
    Ok(out)
}

/// Картинка из буфера обмена: сохраняем во временную папку программы.
#[tauri::command]
pub fn save_paste(app: AppHandle, data: String, ext: String) -> Result<String, String> {
    let ext = ext.to_ascii_lowercase();
    if !matches!(ext.as_str(), "png" | "jpg" | "jpeg" | "gif" | "webp" | "ogg") {
        return Err("неподдерживаемый формат".into());
    }
    let bytes = base64::engine::general_purpose::STANDARD.decode(data).map_err(|e| e.to_string())?;
    if bytes.len() > 50 * 1024 * 1024 {
        return Err("файл слишком большой".into());
    }
    let dir = app.path().app_cache_dir().map_err(|e| e.to_string())?.join("paste");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    let mut rnd = [0u8; 8];
    getrandom::getrandom(&mut rnd).map_err(|e| e.to_string())?;
    let name: String = rnd.iter().map(|b| format!("{b:02x}")).collect();
    let kind = if ext == "ogg" { "voice" } else { "image" };
    let path = dir.join(format!("{kind}-{name}.{ext}"));
    std::fs::write(&path, bytes).map_err(|e| e.to_string())?;
    allow(&app, &path);
    Ok(path.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn notify(app: AppHandle, title: String, body: String) -> Result<(), String> {
    let short: String = body.chars().take(200).collect();
    app.notification()
        .builder()
        .title(title)
        .body(short)
        .show()
        .map_err(|e| e.to_string())?;
    if let Some(w) = app.get_webview_window("main") {
        if !w.is_focused().unwrap_or(true) {
            let _ = w.request_user_attention(Some(tauri::UserAttentionType::Informational));
        }
    }
    Ok(())
}

/// Значок поверх иконки в панели задач (как красный счётчик в Dock).
#[tauri::command]
pub fn set_badge(app: AppHandle, png: Option<String>) -> Result<(), String> {
    let Some(w) = app.get_webview_window("main") else { return Ok(()) };
    #[cfg(windows)]
    {
        let icon = match png {
            Some(b64) => {
                let bytes = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
                Some(tauri::image::Image::from_bytes(&bytes).map_err(|e| e.to_string())?)
            }
            None => None,
        };
        w.set_overlay_icon(icon).map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = (w, png);
    }
    Ok(())
}

/// Перетаскивание файлов в окно.
pub fn on_window_event(window: &Window, event: &WindowEvent) {
    if let WindowEvent::DragDrop(e) = event {
        let app = window.app_handle();
        match e {
            DragDropEvent::Enter { .. } => {
                let _ = window.emit("drag-state", true);
            }
            DragDropEvent::Leave => {
                let _ = window.emit("drag-state", false);
            }
            DragDropEvent::Drop { paths, .. } => {
                let _ = window.emit("drag-state", false);
                let files = to_strings(app, paths);
                if !files.is_empty() {
                    let _ = window.emit("files-dropped", files);
                }
            }
            _ => {}
        }
    }
}
