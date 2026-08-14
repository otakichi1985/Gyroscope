use rusqlite::params;
use tauri::State;

use crate::db::Db;
use crate::error::AppResult;

#[tauri::command]
pub fn delete_feed(db: State<'_, Db>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM feeds WHERE id = ?1", params![id])?;
    Ok(())
}

#[tauri::command]
pub fn rename_feed(db: State<'_, Db>, id: i64, custom_title: Option<String>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE feeds SET custom_title = ?1 WHERE id = ?2", params![custom_title, id])?;
    Ok(())
}

#[tauri::command]
pub fn set_feed_folder(db: State<'_, Db>, id: i64, folder: Option<String>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE feeds SET folder = ?1 WHERE id = ?2", params![folder, id])?;
    Ok(())
}

#[tauri::command]
pub fn set_feed_interval(db: State<'_, Db>, id: i64, interval_min: Option<i64>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE feeds SET interval_min = ?1 WHERE id = ?2", params![interval_min, id])?;
    Ok(())
}

#[tauri::command]
pub fn set_feed_notify(db: State<'_, Db>, id: i64, notify_enabled: bool) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE feeds SET notify_enabled = ?1 WHERE id = ?2", params![notify_enabled, id])?;
    Ok(())
}

#[tauri::command]
pub fn reorder_feeds(db: State<'_, Db>, ordered_ids: Vec<i64>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    for (index, id) in ordered_ids.iter().enumerate() {
        conn.execute("UPDATE feeds SET sort_order = ?1 WHERE id = ?2", params![index as i64, id])?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_feed_tags(db: State<'_, Db>, id: i64, tags: Vec<String>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM feed_tags WHERE feed_id = ?1", params![id])?;
    for tag in &tags {
        let tag = tag.trim();
        if tag.is_empty() {
            continue;
        }
        conn.execute("INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING", params![tag])?;
        let tag_id: i64 = conn.query_row("SELECT id FROM tags WHERE name = ?1", params![tag], |r| r.get(0))?;
        conn.execute("INSERT OR IGNORE INTO feed_tags (feed_id, tag_id) VALUES (?1, ?2)", params![id, tag_id])?;
    }
    Ok(())
}
