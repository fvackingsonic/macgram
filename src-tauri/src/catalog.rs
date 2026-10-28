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
