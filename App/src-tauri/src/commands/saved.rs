use rusqlite::params;
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

/// Bookmarks saved from the discover ("探す") screen. They live here, not in
/// `entries`, and are surfaced to the timeline's bookmark view as synthetic
/// entries with negative ids (see commands::entries) so the starred view,
/// trash, and restore treat them exactly like a normal starred entry.
///
/// `save_article` upserts by URL and un-trashes the row if the article was
/// previously soft-deleted; `unsave_article` soft-deletes into the same
/// 30-day trash window as `delete_entry`.
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

/// Active (not trashed) saved-article URLs, used by the discover screen to
/// paint the ☆ state of its cards on mount.
#[tauri::command]
pub fn list_saved_article_urls(db: State<'_, Db>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare("SELECT url FROM saved_articles WHERE deleted_at IS NULL")?;
    let urls: Result<Vec<_>, _> = stmt.query_map([], |row| row.get(0))?.collect();
    Ok(urls?)
}