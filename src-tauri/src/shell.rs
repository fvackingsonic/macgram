//! Значок в трее, закрытие в трей и всплывающие уведомления macgram (своё окно в углу экрана,
//! как баннеры в macOS: аватар, имя, текст, по щелчку открывается чат).

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
/// Номер последнего уведомления — страховка: окно прячется само, даже если его страница не ответила.
static TOAST_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
static TOAST_ACK: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
/// Последнее уведомление: окно, созданное только что, ещё не слушает события и забирает его само.
static LAST_TOAST: std::sync::Mutex<Option<serde_json::Value>> = std::sync::Mutex::new(None);
pub fn close_to_tray() -> bool {
    CLOSE_TO_TRAY.load(Ordering::Relaxed)
}

pub fn show_main(app: &AppHandle) {
    if let Some(w) = app.get_webview_window("main") {
        let _ = w.unminimize();
        let _ = w.show();
        let _ = w.set_focus();
    }
}

pub struct TrayState {
    pub notify: CheckMenuItem<tauri::Wry>,
}

pub fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let open = MenuItem::with_id(app, "open", "Открыть macgram", true, None::<&str>)?;
    let notify = CheckMenuItem::with_id(app, "notify", "Уведомления", true, true, None::<&str>)?;
    let lock = MenuItem::with_id(app, "lock", "Заблокировать", true, None::<&str>)?;
    let sep = PredefinedMenuItem::separator(app)?;
    let quit = MenuItem::with_id(app, "quit", "Выйти из macgram", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&open, &notify, &lock, &sep, &quit])?;
    app.manage(TrayState { notify: notify.clone() });
    let mut b = TrayIconBuilder::with_id("tray")
        .tooltip("macgram")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "open" => show_main(app),
            "notify" => {
                let on = app.state::<TrayState>().notify.is_checked().unwrap_or(true);
                let _ = app.emit_to("main", "tray-notify", on);
            }
            "lock" => {
                let _ = app.emit_to("main", "tray-lock", ());
            }
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                show_main(tray.app_handle());
            }
        });
    if let Some(icon) = app.default_window_icon() {
        b = b.icon(icon.clone());
    }
    b.build(app)?;
    Ok(())
}

/// Настройки, которые меняет интерфейс: закрывать в трей, галочка «Уведомления» в меню трея.
#[tauri::command]
pub fn shell_prefs(app: AppHandle, close_to_tray: bool, notify: bool) {
    CLOSE_TO_TRAY.store(close_to_tray, Ordering::Relaxed);
    if let Some(st) = app.try_state::<TrayState>() {
        let _ = st.notify.set_checked(notify);
    }
}

/// Вид и место уведомления — из настроек (Настройки → Уведомления → Вид баннера).
#[derive(Clone, PartialEq)]
struct ToastLook {
    blur: bool,  // размытие того, что под окном (акрил Windows): окно = карточка
    pos: String, // "tr" | "br" | "tl" | "bl"
    w: f64,
    h: f64,
}
static LOOK: std::sync::Mutex<Option<ToastLook>> = std::sync::Mutex::new(None);
/// Какое размытие сейчас стоит у окна (чтобы не менять его без нужды).
static BLUR_ON: std::sync::Mutex<Option<bool>> = std::sync::Mutex::new(None);
const REPLY_EXTRA: f64 = 44.0;
/// Одно окно на все виды. Раньше при смене вида старое окно удалялось и сразу создавалось новое —
/// WebView2 иногда не успевал и отвечал ошибкой 0x80010108 («объект отключился от клиентов»).
const TOAST: &str = "toast";

fn cur_toast(app: &AppHandle) -> Option<tauri::WebviewWindow> {
    app.get_webview_window(TOAST)
}

fn look_from(p: &serde_json::Value) -> ToastLook {
    let o = p.get("look");
    let get = |k: &str, d: &str| o.and_then(|o| o.get(k)).and_then(|v| v.as_str()).unwrap_or(d).to_string();
    let blur = o.and_then(|o| o.get("blur")).and_then(|v| v.as_bool()).unwrap_or(false);
    let (w, h) = match get("size", "m").as_str() {
        "s" => (330.0, 78.0),
        "l" => (420.0, 112.0),
        _ => (372.0, 92.0),
    };
    // без размытия карточка рисуется страницей: прозрачные поля 10px под тень и скругление
    let pad = if blur { 0.0 } else { 20.0 };
    ToastLook { blur, pos: get("pos", "tr"), w: w + pad, h: h + pad }
}

/// Угол основного монитора (сверху справа — как в macOS).
fn place_toast(win: &tauri::WebviewWindow, look: &ToastLook, h: f64) {
    if let Ok(Some(m)) = win.primary_monitor() {
        let scale = m.scale_factor();
        let size = m.size().to_logical::<f64>(scale);
        let pos = m.position().to_logical::<f64>(scale);
        let edge = if look.blur { 12.0 } else { 2.0 };
        let left = look.pos.ends_with('l');
        let top = look.pos.starts_with('t');
        let x = if left { pos.x + edge } else { pos.x + size.width - look.w - edge };
        let y = if top { pos.y + edge + 6.0 } else { pos.y + size.height - h - 56.0 };
        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
    }
}

fn build_toast(app: &AppHandle, look: &ToastLook) -> Result<tauri::WebviewWindow, String> {
    let mut b = WebviewWindowBuilder::new(app, TOAST, WebviewUrl::App("toast.html".into()))
        .title("macgram")
        .inner_size(look.w, look.h)
        .decorations(false)
        .transparent(true)
        .shadow(false)
        .always_on_top(true)
        .skip_taskbar(true)
        .resizable(false)
        .focused(false)
        .focusable(false)
        .visible(false);
    // У всех окон WebView2 с общей папкой данных должны быть одинаковые параметры браузера.
    if let Some(args) = app.config().app.windows.iter().find(|w| w.label == "main").and_then(|w| w.additional_browser_args.clone()) {
        b = b.additional_browser_args(&args);
    }
    b.build().map_err(|e| e.to_string())
}

async fn create_toast(app: &AppHandle, look: &ToastLook) -> Result<tauri::WebviewWindow, String> {
    match build_toast(app, look) {
        Ok(w) => Ok(w),
        Err(_) => {
            // WebView2 бывает занят (например, только что закрылось другое окно) — пробуем ещё раз
            std::thread::sleep(std::time::Duration::from_millis(500));
            if let Some(w) = app.get_webview_window(TOAST) {
                let _ = w.destroy();
                std::thread::sleep(std::time::Duration::from_millis(300));
            }
            build_toast(app, look)
        }
    }
}

/// Размытие под окном: включаем/выключаем на ходу, без пересоздания окна.
fn apply_blur(win: &tauri::WebviewWindow, on: bool) {
    let mut cur = BLUR_ON.lock().unwrap_or_else(|e| e.into_inner());
    if *cur == Some(on) {
        return;
    }
    if on {
        let _ = win.set_effects(tauri::window::EffectsBuilder::new().effect(tauri::window::Effect::Acrylic).build());
        let _ = win.set_shadow(true); // Windows 11 скругляет углы и даёт тень
    } else {
        let _ = win.set_effects(Option::<tauri::utils::config::WindowEffectsConfig>::None);
        let _ = win.set_shadow(false);
    }
    *cur = Some(on);
}

/// Показать всплывающее уведомление macgram (окно без рамки поверх всех, не забирает фокус).
/// Команда обязательно async: на Windows создание окна из синхронной команды блокирует
/// главный поток (tauri#4121).
#[tauri::command]
pub async fn toast_show(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let look = look_from(&payload);
    // старые окна прежних версий (по одному на вид) больше не нужны
    if let Some(w) = app.get_webview_window("toastg") {
        let _ = w.destroy();
    }
    if let Ok(mut l) = LOOK.lock() {
        *l = Some(look.clone());
    }
    let win = match app.get_webview_window(TOAST) {
        Some(w) => w,
        None => {
            if let Ok(mut b) = BLUR_ON.lock() {
                *b = None;
            }
            create_toast(&app, &look).await?
        }
    };
    apply_blur(&win, look.blur);
    let seq = TOAST_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
    let mut payload = payload;
    if let Some(o) = payload.as_object_mut() {
        o.insert("id".into(), serde_json::json!(seq));
    }
    let _ = win.set_size(tauri::LogicalSize::new(look.w, look.h));
    place_toast(&win, &look, look.h);
    if let Ok(mut l) = LAST_TOAST.lock() {
        *l = Some(payload.clone());
    }
    let _ = app.emit_to(TOAST, "toast", payload.clone());
    let _ = win.show();
    // Доставка надёжнее событий: вызываем функцию страницы напрямую, пока она не подтвердит показ.
    // Если за 5 с подтверждения нет — прячем окно и просим главное окно показать уведомление Windows.
    let js = format!("window.__toast && window.__toast({})", payload);
    let fallback = payload.clone();
    let stay = payload.get("look").and_then(|l| l.get("secs")).and_then(|v| v.as_u64()).unwrap_or(6);
    std::thread::spawn(move || {
        for ms in [150u64, 450, 900, 1500, 2000] {
            std::thread::sleep(std::time::Duration::from_millis(ms));
            if TOAST_ACK.load(Ordering::Relaxed) >= seq || TOAST_SEQ.load(Ordering::Relaxed) != seq {
                break;
            }
            let _ = win.eval(&js);
        }
        if TOAST_ACK.load(Ordering::Relaxed) < seq && TOAST_SEQ.load(Ordering::Relaxed) == seq {
            let _ = win.hide();
            let _ = app.emit_to("main", "toast-failed", fallback);
            return;
        }
        // страховка: окно прячется само, даже если страница не ответила
        let wait = if stay == 0 { 600 } else { stay + 6 };
        std::thread::sleep(std::time::Duration::from_secs(wait));
        if TOAST_SEQ.load(Ordering::Relaxed) == seq {
            let _ = win.hide();
        }
    });
    Ok(())
}

/// Состояние окна уведомления — для кнопки «Проверить уведомление» в настройках.
#[tauri::command]
pub fn toast_status(app: AppHandle) -> serde_json::Value {
    let w = cur_toast(&app);
    serde_json::json!({
        "created": w.is_some(),
        "visible": w.as_ref().and_then(|w| w.is_visible().ok()).unwrap_or(false),
        "seq": TOAST_SEQ.load(Ordering::Relaxed),
        "ack": TOAST_ACK.load(Ordering::Relaxed),
    })
}

/// Окно уведомления показало карточку.
#[tauri::command]
pub fn toast_ack(id: u64) {
    TOAST_ACK.fetch_max(id, Ordering::Relaxed);
}

/// Окно уведомления только что загрузилось — отдать ему уведомление, ради которого его открыли.
#[tauri::command]
pub fn toast_last() -> Option<serde_json::Value> {
    LAST_TOAST.lock().ok().and_then(|l| l.clone())
}

#[tauri::command]
pub fn toast_hide(app: AppHandle) {
    if let Some(w) = cur_toast(&app) {
        let _ = w.hide();
        let _ = w.set_focusable(false);
    }
}

/// «Ответить» в уведомлении: окно становится выше и принимает ввод с клавиатуры.
#[tauri::command]
pub async fn toast_reply_mode(app: AppHandle, on: bool) {
    if let Some(w) = cur_toast(&app) {
        let look = LOOK.lock().ok().and_then(|l| l.clone()).unwrap_or_else(|| look_from(&serde_json::Value::Null));
        let h = if on { look.h + REPLY_EXTRA } else { look.h };
        TOAST_SEQ.fetch_add(1, Ordering::Relaxed); // пока пишут ответ — не прятать само
        let _ = w.set_focusable(on);
        let _ = w.set_size(tauri::LogicalSize::new(look.w, h));
        place_toast(&w, &look, h);
        if on {
            let _ = w.set_focus();
        }
    }
}

/// Отправить быстрый ответ из уведомления (сообщение отправляет главное окно через TDLib).
#[tauri::command]
pub fn toast_send(app: AppHandle, chat_id: i64, text: String) {
    let _ = app.emit_to("main", "toast-reply", serde_json::json!({ "chatId": chat_id, "text": text }));
}

/// Щелчок по уведомлению: открыть macgram на нужном чате.
#[tauri::command]
pub fn toast_open(app: AppHandle, chat_id: i64) {
    toast_hide(app.clone());
    show_main(&app);
    let _ = app.emit_to("main", "open-chat", chat_id);
}

/// Значок приложения (как «Значок в Dock» в Telegram для macOS): меняет значок окна,
/// панели задач и трея. Ярлык на рабочем столе остаётся прежним.
#[tauri::command]
pub fn set_app_icon(app: AppHandle, name: String) -> Result<(), String> {
    let bytes: &[u8] = match name.as_str() {
        "dark" => include_bytes!("../icons/alt/dark.png"),
        "light" => include_bytes!("../icons/alt/light.png"),
        "purple" => include_bytes!("../icons/alt/purple.png"),
        "green" => include_bytes!("../icons/alt/green.png"),
        "sunset" => include_bytes!("../icons/alt/sunset.png"),
        _ => include_bytes!("../icons/alt/blue.png"),
    };
    let img = tauri::image::Image::from_bytes(bytes).map_err(|e| e.to_string())?;
    if let Some(w) = app.get_webview_window("main") {
        w.set_icon(img.clone()).map_err(|e| e.to_string())?;
    }
    if let Some(t) = app.tray_by_id("tray") {
        let _ = t.set_icon(Some(img));
    }
    Ok(())
}

/// Живой фон (GIF или видео) — Telegram такие фоны не хранит, поэтому держим копию у себя.
#[tauri::command]
pub fn set_live_wallpaper(app: AppHandle, path: String) -> Result<String, String> {
    let src = std::path::PathBuf::from(&path);
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if !matches!(ext.as_str(), "gif" | "mp4" | "webm" | "mov") {
        return Err("Живой фон — только GIF, MP4, WEBM или MOV".into());
    }
    let size = std::fs::metadata(&src).map_err(|e| e.to_string())?.len();
    if size > 80 * 1024 * 1024 {
        return Err("Файл больше 80 МБ — слишком тяжёлый для фона".into());
    }
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("wallpapers");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            if e.file_name().to_string_lossy().starts_with("live_") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let dst = dir.join(format!("live_{}.{}", stamp, ext));
    std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
    Ok(dst.to_string_lossy().into_owned())
}

#[tauri::command]
pub fn clear_live_wallpaper(app: AppHandle) {
    if let Ok(dir) = app.path().app_local_data_dir() {
        let _ = std::fs::remove_dir_all(dir.join("wallpapers"));
    }
}

/// Копия выбранного файла для предпросмотра фона (окно может показывать только файлы программы).
#[tauri::command]
pub fn stage_wallpaper(app: AppHandle, path: String) -> Result<String, String> {
    let src = std::path::PathBuf::from(&path);
    let ext = src.extension().and_then(|e| e.to_str()).unwrap_or("").to_ascii_lowercase();
    if !matches!(ext.as_str(), "jpg" | "jpeg" | "png" | "webp" | "gif" | "mp4" | "webm" | "mov") {
        return Err("Подходят JPG, PNG, WEBP, GIF, MP4, WEBM, MOV".into());
    }
    let size = std::fs::metadata(&src).map_err(|e| e.to_string())?.len();
    if size > 80 * 1024 * 1024 {
        return Err("Файл больше 80 МБ — слишком тяжёлый для фона".into());
    }
    let dir = app.path().app_local_data_dir().map_err(|e| e.to_string())?.join("wallpapers");
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    // Каждый раз новое имя: TDLib узнаёт файл по пути и иначе снова ставил старую картинку.
    if let Ok(rd) = std::fs::read_dir(&dir) {
        for e in rd.flatten() {
            if e.file_name().to_string_lossy().starts_with("preview") {
                let _ = std::fs::remove_file(e.path());
            }
        }
    }
    let stamp = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map(|d| d.as_millis()).unwrap_or(0);
    let dst = dir.join(format!("preview_{}.{}", stamp, ext));
    std::fs::copy(&src, &dst).map_err(|e| e.to_string())?;
    Ok(dst.to_string_lossy().into_owned())
}
