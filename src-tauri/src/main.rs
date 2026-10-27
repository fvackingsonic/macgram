#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod desktop;
mod secrets;
mod tdjson;
mod updater;
mod shell;

use serde_json::{json, Value};
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{AppHandle, Emitter, Manager, State};
use tdjson::TdJson;

#[derive(Default)]
struct Td {
    lib: Mutex<Option<Arc<TdJson>>>,
    client: Mutex<Option<i32>>,
}

fn lib_names() -> &'static [&'static str] {
    if cfg!(windows) {
        &["tdjson.dll"]
    } else if cfg!(target_os = "macos") {
        &["libtdjson.dylib"]
    } else {
        &["libtdjson.so", "libtdjson.so.1.8"]
    }
}

/// Где искать библиотеку TDLib: переменная окружения, папка ресурсов, папка программы.
fn find_tdjson(app: Option<&AppHandle>) -> Option<PathBuf> {
    let mut dirs: Vec<PathBuf> = Vec::new();
    if let Ok(p) = std::env::var("MACTELE_TDJSON") {
        let p = PathBuf::from(p);
        if p.is_file() {
            return Some(p);
        }
    }
    if let Some(app) = app {
        if let Ok(r) = app.path().resource_dir() {
            dirs.push(r.join("lib"));
            dirs.push(r);
        }
    }
    if let Ok(exe) = std::env::current_exe() {
        if let Some(d) = exe.parent() {
            dirs.push(d.join("lib"));
            dirs.push(d.to_path_buf());
        }
    }
    for d in dirs {
        for n in lib_names() {
            let p = d.join(n);
            if p.is_file() {
                return Some(p);
            }
        }
    }
    None
}

fn data_dir(app: &AppHandle) -> Result<PathBuf, String> {
    app.path().app_local_data_dir().map_err(|e| e.to_string())
}

fn lib(app: &AppHandle, td: &Td) -> Result<Arc<TdJson>, String> {
    let mut guard = td.lib.lock().unwrap();
    if let Some(l) = guard.as_ref() {
        return Ok(l.clone());
    }
    let path = find_tdjson(Some(app)).ok_or("библиотека TDLib (tdjson) не найдена рядом с программой")?;
    let l = Arc::new(TdJson::load(&path)?);
    // Минимум логов: TDLib не должна писать лишнего о переписке.
    l.execute(r#"{"@type":"setLogVerbosityLevel","new_verbosity_level":1}"#);
    *guard = Some(l.clone());
    Ok(l)
}

fn current_client(td: &Td) -> Result<i32, String> {
    td.client.lock().unwrap().ok_or_else(|| "TDLib ещё не запущена".to_string())
}

#[tauri::command]
fn td_start(app: AppHandle, td: State<Td>) -> Result<(), String> {
    let l = lib(&app, &td)?;
    let mut client = td.client.lock().unwrap();
    if client.is_some() {
        // Окно перезагрузили — просто попросим текущее состояние входа.
        l.send(client.unwrap(), r#"{"@type":"getAuthorizationState"}"#)?;
        return Ok(());
    }
    let id = l.create_client();
    *client = Some(id);
    drop(client);

    let reader = l.clone();
    let handle = app.clone();
    std::thread::Builder::new()
        .name("tdlib-receive".into())
        .spawn(move || loop {
            if let Some(update) = reader.receive(1.0) {
                let _ = handle.emit("td-update", update);
            }
        })
        .map_err(|e| e.to_string())?;

    // Любой запрос «будит» клиента; ответом придёт состояние авторизации.
    l.send(id, r#"{"@type":"getOption","name":"version"}"#)?;
    Ok(())
}

#[tauri::command]
fn td_restart(app: AppHandle, td: State<Td>) -> Result<(), String> {
    let l = lib(&app, &td)?;
    let id = l.create_client();
    *td.client.lock().unwrap() = Some(id);
    l.send(id, r#"{"@type":"getOption","name":"version"}"#)
}

#[tauri::command]
fn td_send(app: AppHandle, td: State<Td>, request: String) -> Result<(), String> {
    let parsed: Value = serde_json::from_str(&request).map_err(|_| "неверный запрос")?;
    let kind = parsed.get("@type").and_then(Value::as_str).unwrap_or("");
    // Параметры базы и ключ шифрования задаёт только Rust-часть.
    if matches!(kind, "setTdlibParameters" | "setDatabaseEncryptionKey" | "setLogStream" | "setLogVerbosityLevel" | "setLogTagVerbosityLevel") {
        return Err("запрос запрещён".into());
    }
    let l = lib(&app, &td)?;
    l.send(current_client(&td)?, &request)
}

#[tauri::command]
fn creds_status(app: AppHandle) -> Result<bool, String> {
    let dir = data_dir(&app)?;
    Ok(api_credentials(&dir).is_some())
}

/// Ключи приложения, вшитые при сборке (секреты репозитория MACGRAM_API_ID / MACGRAM_API_HASH).
/// Если они есть, вход обычный — только номер телефона, как в официальных клиентах.
fn builtin_credentials() -> Option<(i64, String)> {
    let id: i64 = option_env!("MACGRAM_API_ID")?.trim().parse().ok()?;
    let hash = option_env!("MACGRAM_API_HASH")?.trim().to_string();
    (id > 0 && hash.len() == 32 && hash.chars().all(|c| c.is_ascii_hexdigit())).then_some((id, hash))
}

/// Свои ключи пользователя (если он когда-то их вводил) важнее вшитых — сеанс не меняется.
fn api_credentials(dir: &std::path::PathBuf) -> Option<(i64, String)> {
    let own = secrets::get(dir, "api-id").and_then(|v| v.parse::<i64>().ok()).zip(secrets::get(dir, "api-hash"));
    own.or_else(builtin_credentials)
}

#[tauri::command]
fn creds_save(app: AppHandle, api_id: i64, api_hash: String) -> Result<(), String> {
    let hash = api_hash.trim().to_string();
    if api_id <= 0 || api_id > i32::MAX as i64 {
        return Err("api_id должен быть положительным числом".into());
    }
    if hash.len() != 32 || !hash.chars().all(|c| c.is_ascii_hexdigit()) {
        return Err("api_hash — это 32 символа из цифр и букв a–f".into());
    }
    let dir = data_dir(&app)?;
    secrets::set(&dir, "api-id", &api_id.to_string())?;
    secrets::set(&dir, "api-hash", &hash)
}

/// Код-пароль: храним только проверочный хэш (PBKDF2, считается в интерфейсе) в «Диспетчере
/// учётных данных». Сам код нигде не сохраняется.
#[tauri::command]
fn passcode_get(app: AppHandle) -> Result<Option<String>, String> {
    let dir = data_dir(&app)?;
    Ok(secrets::get(&dir, "passcode").filter(|v| !v.is_empty()))
}

#[tauri::command]
fn passcode_set(app: AppHandle, verifier: Option<String>) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let v = verifier.unwrap_or_default();
    if !v.is_empty() && (!v.starts_with("pbkdf2$") || v.len() > 300) {
        return Err("неверный формат".into());
    }
    secrets::set(&dir, "passcode", &v)
}

#[tauri::command]
fn td_set_parameters(app: AppHandle, td: State<Td>, lang: String) -> Result<(), String> {
    let dir = data_dir(&app)?;
    let (api_id, api_hash) = api_credentials(&dir).ok_or("нет ключей приложения")?;
    let key = secrets::database_key(&dir)?;
    let base = dir.join("tdlib");
    let lang = if lang.chars().all(|c| c.is_ascii_alphabetic()) && !lang.is_empty() { lang } else { "ru".into() };

    let req = json!({
        "@type": "setTdlibParameters",
        "use_test_dc": false,
        "database_directory": base.join("db").to_string_lossy(),
        "files_directory": base.join("files").to_string_lossy(),
        "database_encryption_key": key,
        "use_file_database": true,
        "use_chat_info_database": true,
        "use_message_database": true,
        "use_secret_chats": true,
        "api_id": api_id,
        "api_hash": api_hash,
        "system_language_code": lang,
        "device_model": "Windows PC",
        "system_version": os_version(),
        "application_version": env!("CARGO_PKG_VERSION"),
    });
    let l = lib(&app, &td)?;
    l.send(current_client(&td)?, &req.to_string())
}

fn os_version() -> String {
    if cfg!(windows) { "Windows".into() } else { std::env::consts::OS.into() }
}

/// Проверка сборки: `mactele.exe --selftest out.txt` загружает TDLib и пишет результат в файл.
fn selftest(out: &str) -> ! {
    let res = (|| -> Result<String, String> {
        let path = find_tdjson(None).ok_or("tdjson не найден")?;
        let l = TdJson::load(&path)?;
        l.execute(r#"{"@type":"setLogVerbosityLevel","new_verbosity_level":0}"#);
        let v = l.execute(r#"{"@type":"getTextEntities","text":"@mactele https://example.com"}"#).ok_or("пустой ответ")?;
        Ok(format!("OK {}\n{}", path.display(), v))
    })();
    let text = match res { Ok(s) => s, Err(e) => format!("FAIL {e}") };
    let _ = std::fs::write(out, &text);
    std::process::exit(if text.starts_with("OK") { 0 } else { 1 });
}

fn main() {
    let args: Vec<String> = std::env::args().collect();
    if let Some(i) = args.iter().position(|a| a == "--selftest") {
        selftest(args.get(i + 1).map(String::as_str).unwrap_or("selftest.txt"));
    }

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .on_window_event(desktop::on_window_event)
        .setup(|app| {
            let _ = shell::setup_tray(app.handle());
            Ok(())
        })
        .manage(Td::default())
        .invoke_handler(tauri::generate_handler![
            td_start,
            td_restart,
            td_send,
            td_set_parameters,
            creds_status,
            creds_save,
            passcode_get,
            passcode_set,
            desktop::pick_files,
            desktop::pick_font,
            desktop::save_paste,
            desktop::notify,
            updater::update_install,
            shell::shell_prefs,
            shell::toast_show,
            shell::toast_hide,
            shell::toast_last,
            shell::toast_reply_mode,
            shell::toast_send,
            shell::toast_open,
            desktop::set_badge
        ])
        .run(tauri::generate_context!())
        .expect("не удалось запустить приложение");
}
