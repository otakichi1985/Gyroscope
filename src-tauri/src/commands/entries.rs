use rusqlite::params;
use rusqlite::types::ToSql;
use serde::Deserialize;
use tauri::State;

use crate::db::models::{Entry, ENTRY_COLUMNS};
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

#[tauri::command]
pub fn mark_entry_read(db: State<'_, Db>, id: i64, is_read: bool) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE entries SET is_read = ?1 WHERE id = ?2", params![is_read, id])?;
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
    match feed_id {
        Some(id) => conn.execute("UPDATE entries SET is_read = 1 WHERE feed_id = ?1", params![id])?,
        None => conn.execute("UPDATE entries SET is_read = 1", [])?,
    };
    Ok(())
}
