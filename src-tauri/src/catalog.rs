//! Открытые музыкальные каталоги для плеера (без ключей и входа): Deezer — поиск, исполнители,
//! альбомы, чарты; song.link — найти тот же трек в Spotify; iTunes. Только чтение, только эти адреса.

#[tauri::command]
pub async fn catalog_get(query: String) -> Result<serde_json::Value, String> {
    if query.len() > 600 || query.contains('#') || query.contains("..") || query.contains(['\n', '\r', ' ']) {
        return Err("недопустимый запрос к каталогу".into());
    }
    // dz/… — открытый каталог Deezer (поиск, исполнители, альбомы, чарты; без ключей и входа),
    // sl/… — song.link (находит тот же трек в Spotify), иначе — поиск iTunes.
    let url = if let Some(rest) = query.strip_prefix("dz/") {
        format!("https://api.deezer.com/{rest}")
    } else if let Some(rest) = query.strip_prefix("sl/") {
        format!("https://api.song.link/v1-alpha.1/{rest}")
    } else if query.starts_with("search?") || query.starts_with("lookup?") {
        format!("https://itunes.apple.com/{query}")
    } else {
        return Err("недопустимый запрос к каталогу".into());
    };
    tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
        let resp = ureq::get(&url)
            .set("User-Agent", "macgram")
            .timeout(std::time::Duration::from_secs(12))
            .call()
            .map_err(|e| format!("каталог недоступен: {e}"))?;
        let text = resp.into_string().map_err(|e| e.to_string())?;
        serde_json::from_str(&text).map_err(|e| e.to_string())
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Найти ролик на YouTube для трека (страница поиска YouTube, только видео). Возвращает до 10
/// результатов: id, название, канал, длительность — интерфейс выбирает подходящий.
#[tauri::command]
pub async fn yt_search(query: String) -> Result<serde_json::Value, String> {
    if query.trim().is_empty() || query.len() > 300 {
        return Err("пустой запрос".into());
    }
    let q: String = query
        .bytes()
        .map(|b| match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => (b as char).to_string(),
            b' ' => "+".to_string(),
            _ => format!("%{b:02X}"),
        })
        .collect();
    let url = format!("https://www.youtube.com/results?search_query={q}&sp=EgIQAQ%253D%253D");
    tauri::async_runtime::spawn_blocking(move || -> Result<serde_json::Value, String> {
        let text = ureq::get(&url)
            .set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36")
            .set("Accept-Language", "en-US,en;q=0.8,ru;q=0.6")
            .set("Cookie", "SOCS=CAI; CONSENT=YES+1")
            .timeout(std::time::Duration::from_secs(12))
            .call()
            .map_err(|e| format!("YouTube недоступен: {e}"))?
            .into_string()
            .map_err(|e| e.to_string())?;
        let mut out = Vec::new();
        let key = "\"videoRenderer\":{\"videoId\":\"";
        let mut from = 0;
        while let Some(i) = text[from..].find(key) {
            let start = from + i + key.len();
            let id: String = text[start..].chars().take(11).collect();
            from = start;
            if id.len() != 11 || out.iter().any(|v: &serde_json::Value| v["id"] == id.as_str()) {
                continue;
            }
            let end = (start + 6000).min(text.len());
            let end = (0..=end).rev().find(|&k| text.is_char_boundary(k)).unwrap_or(start);
            let block = &text[start..end];
            let length = block.find("\"lengthText\":").map(|k| grab(&block[k..], "\"simpleText\":\"")).unwrap_or_default();
            out.push(serde_json::json!({
                "id": id,
                "title": grab(block, "\"title\":{\"runs\":[{\"text\":\""),
                "channel": grab(block, "\"ownerText\":{\"runs\":[{\"text\":\""),
                "len": length,
            }));
            if out.len() >= 10 {
                break;
            }
        }
        Ok(serde_json::Value::Array(out))
    })
    .await
    .map_err(|e| e.to_string())?
}

/// Строка JSON после `pat` (до закрывающей кавычки), экранирование оставляем как есть.
fn grab(block: &str, pat: &str) -> String {
    let Some(k) = block.find(pat) else { return String::new() };
    let mut res = String::new();
    let mut esc = false;
    for c in block[k + pat.len()..].chars() {
        if esc {
            res.push('\\');
            res.push(c);
            esc = false;
            continue;
        }
        if c == '\\' {
            esc = true;
            continue;
        }
        if c == '"' {
            break;
        }
        res.push(c);
        if res.len() > 400 {
            break;
        }
    }
    res
}

/// Обложка из каталога как data:URL — чтобы плеер мог сверить её с обложкой трека в Telegram.
/// Только картинки Deezer и iTunes, не больше 2 МБ.
#[tauri::command]
pub async fn image_data(url: String) -> Result<String, String> {
    let host = url.strip_prefix("https://").and_then(|r| r.split('/').next()).unwrap_or("");
    if url.len() > 500 || !(host.ends_with(".dzcdn.net") || host.ends_with(".mzstatic.com")) {
        return Err("недопустимый адрес".into());
    }
    tauri::async_runtime::spawn_blocking(move || -> Result<String, String> {
        use base64::Engine;
        use std::io::Read;
        let resp = ureq::get(&url)
            .set("User-Agent", "macgram")
            .timeout(std::time::Duration::from_secs(10))
            .call()
            .map_err(|e| e.to_string())?;
        let mut buf = Vec::new();
        resp.into_reader().take(2 * 1024 * 1024).read_to_end(&mut buf).map_err(|e| e.to_string())?;
        let mime = if buf.starts_with(&[0x89, b'P', b'N', b'G']) { "image/png" } else { "image/jpeg" };
        Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(&buf)))
    })
    .await
    .map_err(|e| e.to_string())?
}
