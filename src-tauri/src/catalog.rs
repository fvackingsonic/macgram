//! Каталог музыки для мини-плеера: открытый поиск iTunes (исполнители, альбомы, обложки).
//! Только чтение и только адреса itunes.apple.com/search и /lookup — сама музыка играет из Telegram.

#[tauri::command]
pub async fn catalog_get(query: String) -> Result<serde_json::Value, String> {
    if !(query.starts_with("search?") || query.starts_with("lookup?")) || query.len() > 400 || query.contains('#') {
        return Err("недопустимый запрос к каталогу".into());
    }
    let url = format!("https://itunes.apple.com/{query}");
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
