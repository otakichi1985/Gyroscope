use rusqlite::params;
use rusqlite::types::ToSql;
use rusqlite::Connection;
use serde::Deserialize;
use tauri::State;

use crate::db::models::{Entry, ReadHistoryEntry, ENTRY_COLUMNS, READ_HISTORY_COLUMNS};
use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Default, Deserialize)]
pub struct EntriesFilter {
    pub feed_id: Option<i64>,
    pub unread_only: Option<bool>,
    pub starred_only: Option<bool>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
}

const DEFAULT_LIMIT: i64 = 200;

#[tauri::command]
pub fn list_entries(db: State<'_, Db>, filter: EntriesFilter) -> AppResult<Vec<Entry>> {
    let conn = db.0.lock().unwrap();

    let mut sql = format!("SELECT {ENTRY_COLUMNS} FROM entries WHERE 1 = 1");
    let mut bindings: Vec<Box<dyn ToSql>> = Vec::new();

    if let Some(feed_id) = filter.feed_id {
        sql.push_str(" AND feed_id = ?");
        bindings.push(Box::new(feed_id));
    }
    if filter.unread_only.unwrap_or(false) {
        sql.push_str(" AND is_read = 0");
    }
    if filter.starred_only.unwrap_or(false) {
        sql.push_str(" AND is_starred = 1");
    }
    sql.push_str(" ORDER BY published_at DESC, id DESC LIMIT ? OFFSET ?");
    bindings.push(Box::new(filter.limit.unwrap_or(DEFAULT_LIMIT)));
    bindings.push(Box::new(filter.offset.unwrap_or(0)));

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn ToSql> = bindings.iter().map(|b| b.as_ref()).collect();
    let entries = stmt
        .query_map(param_refs.as_slice(), Entry::from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

/// Snapshots the entry (and its feed's display name) into `read_history` so
/// "what I've read" survives the entry itself being auto-deleted or its
/// feed removed (SPEC's 30-day old-entry cleanup). `ON CONFLICT DO NOTHING`
/// keeps the first-read timestamp if the same entry is toggled unread/read
/// again later, rather than spamming updates.
fn record_read_history(conn: &Connection, entry_id: i64) -> AppResult<()> {
    conn.execute(
        "INSERT INTO read_history (feed_title, entry_guid, title, link, read_at) \
         SELECT COALESCE(f.custom_title, f.title, f.url), e.guid, e.title, e.link, \
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         FROM entries e JOIN feeds f ON f.id = e.feed_id \
         WHERE e.id = ?1 \
         ON CONFLICT(feed_title, entry_guid) DO NOTHING",
        params![entry_id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn mark_entry_read(db: State<'_, Db>, id: i64, is_read: bool) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE entries SET is_read = ?1 WHERE id = ?2", params![is_read, id])?;
    if is_read {
        record_read_history(&conn, id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_star(db: State<'_, Db>, id: i64, is_starred: bool) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE entries SET is_starred = ?1 WHERE id = ?2",
        params![is_starred, id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn mark_all_read(db: State<'_, Db>, feed_id: Option<i64>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();

    // Snapshot the still-unread rows into read_history *before* flipping
    // is_read, same dedupe key/semantics as record_read_history above.
    let history_sql = "INSERT INTO read_history (feed_title, entry_guid, title, link, read_at) \
         SELECT COALESCE(f.custom_title, f.title, f.url), e.guid, e.title, e.link, \
                strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
         FROM entries e JOIN feeds f ON f.id = e.feed_id \
         WHERE e.is_read = 0";
    match feed_id {
        Some(id) => {
            conn.execute(
                &format!("{history_sql} AND e.feed_id = ?1 ON CONFLICT(feed_title, entry_guid) DO NOTHING"),
                params![id],
            )?;
            conn.execute("UPDATE entries SET is_read = 1 WHERE feed_id = ?1", params![id])?
        }
        None => {
            conn.execute(
                &format!("{history_sql} ON CONFLICT(feed_title, entry_guid) DO NOTHING"),
                [],
            )?;
            conn.execute("UPDATE entries SET is_read = 1", [])?
        }
    };
    Ok(())
}

#[tauri::command]
pub fn mark_all_unread(db: State<'_, Db>, feed_id: Option<i64>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    // No read_history write here -- unmarking is not "unreading": the fact
    // an entry was read stays recorded (see record_read_history's doc).
    match feed_id {
        Some(id) => conn.execute("UPDATE entries SET is_read = 0 WHERE feed_id = ?1", params![id])?,
        None => conn.execute("UPDATE entries SET is_read = 0", [])?,
    };
    Ok(())
}

#[tauri::command]
pub fn list_read_history(db: State<'_, Db>, limit: Option<i64>, offset: Option<i64>) -> AppResult<Vec<ReadHistoryEntry>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {READ_HISTORY_COLUMNS} FROM read_history ORDER BY read_at DESC LIMIT ?1 OFFSET ?2"
    ))?;
    let entries: Result<Vec<_>, _> = stmt
        .query_map(params![limit.unwrap_or(DEFAULT_LIMIT), offset.unwrap_or(0)], ReadHistoryEntry::from_row)?
        .collect();
    Ok(entries?)
}

#[tauri::command]
pub fn clear_read_history(db: State<'_, Db>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM read_history", [])?;
    Ok(())
}
