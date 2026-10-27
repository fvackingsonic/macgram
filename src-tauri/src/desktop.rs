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
