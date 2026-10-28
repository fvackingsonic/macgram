//! Плеер Spotify в macgram (кнопка с нотой).
//! Что играет и управление — через «Управление мультимедиа» Windows (то же, что клавиши мультимедиа:
//! работает и без подписки Spotify Premium). Громкость — громкость самого приложения Spotify в микшере
//! Windows. Вход в аккаунт Spotify (поиск, плейлисты, «Любимые треки») — OAuth PKCE через
//! одноразовый локальный адрес 127.0.0.1.

use serde_json::{json, Value};
use tauri::AppHandle;
use tauri_plugin_opener::OpenerExt;

#[cfg(windows)]
mod win {
    use base64::Engine;
    use serde_json::{json, Value};
    use windows::core::{Interface, HSTRING, PWSTR};
    use windows::Media::Control::{
        GlobalSystemMediaTransportControlsSession as Session, GlobalSystemMediaTransportControlsSessionManager as Manager,
        GlobalSystemMediaTransportControlsSessionPlaybackStatus as Status,
    };
    use windows::Media::MediaPlaybackAutoRepeatMode as Repeat;
    use windows::Storage::Streams::{DataReader, IInputStream};
    use windows::Win32::Foundation::CloseHandle;
    use windows::Win32::Media::Audio::{eMultimedia, eRender, IAudioSessionControl2, IAudioSessionManager2, IMMDeviceEnumerator, ISimpleAudioVolume, MMDeviceEnumerator};
    use windows::Win32::System::Com::{CoCreateInstance, CoInitializeEx, CLSCTX_ALL, COINIT_MULTITHREADED};
    use windows::Win32::System::Threading::{OpenProcess, QueryFullProcessImageNameW, PROCESS_NAME_WIN32, PROCESS_QUERY_LIMITED_INFORMATION};

    fn hs(h: windows::core::Result<HSTRING>) -> String {
        h.map(|s| s.to_string_lossy()).unwrap_or_default()
    }

    fn session() -> windows::core::Result<Option<Session>> {
        let mgr = Manager::RequestAsync()?.get()?;
        let list = mgr.GetSessions()?;
        for i in 0..list.Size()? {
            let s = list.GetAt(i)?;
            if hs(s.SourceAppUserModelId()).to_lowercase().contains("spotify") {
                return Ok(Some(s));
            }
        }
        Ok(None)
    }

    // 100-нс интервалы от 1601 года — как DateTime в Windows
    fn now_ticks() -> i64 {
        let d = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).unwrap_or_default();
        (d.as_secs() as i64 + 11_644_473_600) * 10_000_000 + (d.subsec_nanos() / 100) as i64
    }

    fn thumb(s: &Session) -> Option<String> {
        let props = s.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
        let r = props.Thumbnail().ok()?;
        let stream = r.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()? as u32;
        if size == 0 || size > 4_000_000 {
            return None;
        }
        let ct = hs(stream.ContentType());
        let input: IInputStream = stream.cast().ok()?;
        let reader = DataReader::CreateDataReader(&input).ok()?;
        reader.LoadAsync(size).ok()?.get().ok()?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf).ok()?;
        let mime = if ct.starts_with("image/") { ct } else { "image/png".into() };
        Some(format!("data:{};base64,{}", mime, base64::engine::general_purpose::STANDARD.encode(&buf)))
    }

    pub fn now(have: &str) -> windows::core::Result<Value> {
        let Some(s) = session()? else { return Ok(json!({ "found": false })) };
        let props = s.TryGetMediaPropertiesAsync()?.get()?;
        let title = hs(props.Title());
        let artist = hs(props.Artist());
        let album = hs(props.AlbumTitle());
        let info = s.GetPlaybackInfo()?;
        let playing = info.PlaybackStatus()? == Status::Playing;
        let ctl = info.Controls()?;
        let shuffle = info.IsShuffleActive().ok().and_then(|v| v.Value().ok());
        let repeat = info.AutoRepeatMode().ok().and_then(|v| v.Value().ok()).map(|r| if r == Repeat::Track { 2 } else if r == Repeat::List { 1 } else { 0 });
        let tl = s.GetTimelineProperties()?;
        let dur = (tl.EndTime()?.Duration - tl.StartTime()?.Duration) as f64 / 1e7;
        let mut pos = tl.Position()?.Duration as f64 / 1e7;
        if playing {
            let upd = tl.LastUpdatedTime()?.UniversalTime;
            if upd > 0 {
                pos += ((now_ticks() - upd).max(0) as f64) / 1e7;
            }
        }
        let pos = pos.max(0.0).min(if dur > 0.0 { dur } else { f64::MAX });
        let key = format!("{title}|{artist}|{album}");
        let th = if key != have { thumb(&s) } else { None };
        Ok(json!({
            "found": true, "title": title, "artist": artist, "album": album, "playing": playing,
            "pos": pos, "dur": dur, "key": key, "thumb": th,
            "canSeek": ctl.IsPlaybackPositionEnabled().unwrap_or(false),
            "canNext": ctl.IsNextEnabled().unwrap_or(true), "canPrev": ctl.IsPreviousEnabled().unwrap_or(true),
            "shuffle": shuffle, "repeat": repeat,
        }))
    }

    pub fn ctl(action: &str, value: f64) -> windows::core::Result<bool> {
        let Some(s) = session()? else { return Ok(false) };
        let ok = match action {
            "toggle" => s.TryTogglePlayPauseAsync()?.get()?,
            "play" => s.TryPlayAsync()?.get()?,
            "pause" => s.TryPauseAsync()?.get()?,
            "next" => s.TrySkipNextAsync()?.get()?,
            "prev" => s.TrySkipPreviousAsync()?.get()?,
            "seek" => s.TryChangePlaybackPositionAsync((value * 1e7) as i64)?.get()?,
            "shuffle" => s.TryChangeShuffleActiveAsync(value > 0.5)?.get()?,
            "repeat" => {
                let m = if value > 1.5 { Repeat::Track } else if value > 0.5 { Repeat::List } else { Repeat::None };
                s.TryChangeAutoRepeatModeAsync(m)?.get()?
            }
            _ => false,
        };
        Ok(ok)
    }

    fn is_spotify(pid: u32) -> bool {
        if pid == 0 {
            return false;
        }
        unsafe {
            let Ok(h) = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, false, pid) else { return false };
            let mut buf = [0u16; 520];
            let mut len = buf.len() as u32;
            let ok = QueryFullProcessImageNameW(h, PROCESS_NAME_WIN32, PWSTR(buf.as_mut_ptr()), &mut len).is_ok();
            let _ = CloseHandle(h);
            ok && String::from_utf16_lossy(&buf[..len as usize]).to_lowercase().ends_with("spotify.exe")
        }
    }

    /// Громкость приложения Spotify в микшере Windows: set = None — только узнать.
    pub fn volume(set: Option<f32>) -> windows::core::Result<Option<f32>> {
        unsafe {
            let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
            let en: IMMDeviceEnumerator = CoCreateInstance(&MMDeviceEnumerator, None, CLSCTX_ALL)?;
            let dev = en.GetDefaultAudioEndpoint(eRender, eMultimedia)?;
            let mgr: IAudioSessionManager2 = dev.Activate(CLSCTX_ALL, None)?;
            let list = mgr.GetSessionEnumerator()?;
            let mut out = None;
            for i in 0..list.GetCount()? {
                let c = list.GetSession(i)?;
                let c2: IAudioSessionControl2 = c.cast()?;
                if !is_spotify(c2.GetProcessId().unwrap_or(0)) {
                    continue;
                }
                let v: ISimpleAudioVolume = c.cast()?;
                if let Some(x) = set {
                    v.SetMasterVolume(x.clamp(0.0, 1.0), std::ptr::null())?;
                }
                out = Some(v.GetMasterVolume()?);
            }
            Ok(out)
        }
    }
}

#[tauri::command]
pub async fn spotify_now(have: String) -> Result<Value, String> {
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(move || win::now(&have).map_err(|e| e.to_string())).await.map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = have;
        Ok(json!({ "found": false }))
    }
}

#[tauri::command]
pub async fn spotify_ctl(action: String, value: f64) -> Result<bool, String> {
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(move || win::ctl(&action, value).map_err(|e| e.to_string())).await.map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = (action, value);
        Ok(false)
    }
}

/// Громкость Spotify (0…1). value < 0 — только узнать. null — Spotify сейчас не играет звук.
#[tauri::command]
pub async fn spotify_volume(value: f32) -> Result<Option<f32>, String> {
    #[cfg(windows)]
    {
        return tauri::async_runtime::spawn_blocking(move || win::volume(if value < 0.0 { None } else { Some(value) }).map_err(|e| e.to_string()))
            .await
            .map_err(|e| e.to_string())?;
    }
    #[cfg(not(windows))]
    {
        let _ = value;
        Ok(None)
    }
}

/// Открыть ссылку Spotify: трек/альбом/плейлист в приложении Spotify или страницу входа в браузере.
#[tauri::command]
pub fn spotify_open(app: AppHandle, uri: String) -> Result<(), String> {
    let ok = uri.starts_with("spotify:") || uri.starts_with("https://accounts.spotify.com/") || uri.starts_with("https://open.spotify.com/")
        || uri.starts_with("https://www.spotify.com/");
    if !ok || uri.len() > 4000 || uri.contains(['\n', '\r', '"']) {
        return Err("недопустимая ссылка".into());
    }
    app.opener().open_url(uri, None::<&str>).map_err(|e| e.to_string())
}

/// Вход в Spotify: ждём, пока браузер вернётся на http://127.0.0.1:{port}/callback?code=…,
/// отвечаем страницей «Можно закрыть вкладку» и отдаём строку запроса (code, state или error).
#[tauri::command]
pub async fn spotify_auth_wait(port: u16) -> Result<String, String> {
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        use std::io::{Read, Write};
        let listener = std::net::TcpListener::bind(("127.0.0.1", port)).map_err(|e| format!("порт {port} занят: {e}"))?;
        listener.set_nonblocking(true).map_err(|e| e.to_string())?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(300);
        while std::time::Instant::now() < deadline {
            match listener.accept() {
                Ok((mut sock, _)) => {
                    let _ = sock.set_nonblocking(false);
                    let _ = sock.set_read_timeout(Some(std::time::Duration::from_secs(5)));
                    let mut buf = [0u8; 4096];
                    let n = sock.read(&mut buf).unwrap_or(0);
                    let req = String::from_utf8_lossy(&buf[..n]).to_string();
                    let line = req.lines().next().unwrap_or("");
                    let path = line.split(' ').nth(1).unwrap_or("");
                    if let Some(q) = path.strip_prefix("/callback?") {
                        let ok = !q.contains("error=");
                        let body = format!(
                            "<!doctype html><meta charset=utf-8><title>macgram</title><body style=\"font:16px system-ui;display:grid;place-items:center;height:90vh;margin:0;background:#111;color:#fff\"><div style=text-align:center><div style=font-size:44px>{}</div><p>{}</p></div></body>",
                            if ok { "✓" } else { "✕" },
                            if ok { "Spotify подключён к macgram. Эту вкладку можно закрыть." } else { "Вход отменён. Эту вкладку можно закрыть." }
                        );
                        let _ = write!(sock, "HTTP/1.1 200 OK\r\nContent-Type: text/html; charset=utf-8\r\nContent-Length: {}\r\nConnection: close\r\n\r\n{}", body.len(), body);
                        return Ok(q.to_string());
                    }
                    let _ = write!(sock, "HTTP/1.1 404 Not Found\r\nContent-Length: 0\r\nConnection: close\r\n\r\n");
                }
                Err(e) if e.kind() == std::io::ErrorKind::WouldBlock => std::thread::sleep(std::time::Duration::from_millis(120)),
                Err(e) => return Err(e.to_string()),
            }
        }
        Err("время входа вышло".into())
    })
    .await
    .map_err(|e| e.to_string())?
}

#[allow(dead_code)]
fn _unused() -> Value {
    json!(null)
}
