use rusqlite::params;
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

#[tauri::command]
pub fn save_article(
    db: State<'_, Db>,
    url: String,
    title: String,
    domain: String,
    snippet: String,
    thumbnail_url: Option<String>,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "INSERT INTO saved_articles (url, title, domain, snippet, thumbnail_url, saved_at, deleted_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), NULL) \
         ON CONFLICT(url) DO UPDATE SET title = excluded.title, domain = excluded.domain, \
             snippet = excluded.snippet, thumbnail_url = excluded.thumbnail_url, deleted_at = NULL",
        params![url, title, domain, snippet, thumbnail_url],
    )?;
    Ok(())
}

#[tauri::command]
pub fn unsave_article(db: State<'_, Db>, url: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE saved_articles SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         WHERE url = ?1 AND deleted_at IS NULL",
        params![url],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_saved_article_urls(db: State<'_, Db>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT url FROM saved_articles WHERE deleted_at IS NULL")?;
    let urls: Result<Vec<_>, _> = stmt.query_map([], |row| row.get(0))?.collect();
    Ok(urls?)
}
