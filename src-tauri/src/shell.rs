//! Значок в трее, закрытие в трей и всплывающие уведомления macgram (своё окно в углу экрана,
//! как баннеры в macOS: аватар, имя, текст, по щелчку открывается чат).

use std::sync::atomic::{AtomicBool, Ordering};
use tauri::menu::{CheckMenuItem, Menu, MenuItem, PredefinedMenuItem};
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

static CLOSE_TO_TRAY: AtomicBool = AtomicBool::new(true);
/// Номер последнего уведомления — страховка: окно прячется само, даже если его страница не ответила.
static TOAST_SEQ: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(0);
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

const TOAST_W: f64 = 360.0;
const TOAST_H: f64 = 92.0;
const TOAST_H_REPLY: f64 = 132.0;

/// Правый нижний угол основного монитора, над панелью задач.
fn place_toast(win: &tauri::WebviewWindow, h: f64) {
    if let Ok(Some(m)) = win.primary_monitor() {
        let scale = m.scale_factor();
        let size = m.size().to_logical::<f64>(scale);
        let pos = m.position().to_logical::<f64>(scale);
        let x = pos.x + size.width - TOAST_W - 12.0;
        let y = pos.y + size.height - h - 60.0;
        let _ = win.set_position(tauri::LogicalPosition::new(x, y));
    }
}

/// Показать всплывающее уведомление macgram (окно без рамки поверх всех, не забирает фокус).
/// Команда обязательно async: на Windows создание окна из синхронной команды блокирует
/// главный поток (tauri#4121) — из-за этого в 0.5/0.6 «зависало» всё окно после первого уведомления.
#[tauri::command]
pub async fn toast_show(app: AppHandle, payload: serde_json::Value) -> Result<(), String> {
    let win = match app.get_webview_window("toast") {
        Some(w) => w,
        None => WebviewWindowBuilder::new(&app, "toast", WebviewUrl::App("toast.html".into()))
            .title("macgram")
            .inner_size(TOAST_W, TOAST_H)
            .decorations(false)
            .transparent(true)
            .shadow(false)
            .always_on_top(true)
            .skip_taskbar(true)
            .resizable(false)
            .focused(false)
            .focusable(false)
            .visible(false)
            .build()
            .map_err(|e| e.to_string())?,
    };
    let _ = win.set_focusable(false);
    let _ = win.set_size(tauri::LogicalSize::new(TOAST_W, TOAST_H));
    place_toast(&win, TOAST_H);
    if let Ok(mut l) = LAST_TOAST.lock() {
        *l = Some(payload.clone());
    }
    let _ = app.emit_to("toast", "toast", payload);
    let _ = win.show();
    let seq = TOAST_SEQ.fetch_add(1, Ordering::Relaxed) + 1;
    std::thread::spawn(move || {
        std::thread::sleep(std::time::Duration::from_secs(12));
        if TOAST_SEQ.load(Ordering::Relaxed) == seq {
            let _ = win.hide();
        }
    });
    Ok(())
}

/// Окно уведомления только что загрузилось — отдать ему уведомление, ради которого его открыли.
#[tauri::command]
pub fn toast_last() -> Option<serde_json::Value> {
    LAST_TOAST.lock().ok().and_then(|l| l.clone())
}

#[tauri::command]
pub fn toast_hide(app: AppHandle) {
    if let Some(w) = app.get_webview_window("toast") {
        let _ = w.hide();
        let _ = w.set_focusable(false);
    }
}

/// «Ответить» в уведомлении: окно становится выше и принимает ввод с клавиатуры.
#[tauri::command]
pub async fn toast_reply_mode(app: AppHandle, on: bool) {
    if let Some(w) = app.get_webview_window("toast") {
        let h = if on { TOAST_H_REPLY } else { TOAST_H };
        TOAST_SEQ.fetch_add(1, Ordering::Relaxed); // пока пишут ответ — не прятать само
        let _ = w.set_focusable(on);
        let _ = w.set_size(tauri::LogicalSize::new(TOAST_W, h));
        place_toast(&w, h);
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
