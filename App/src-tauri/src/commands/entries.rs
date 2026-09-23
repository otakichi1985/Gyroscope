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
    pub folder: Option<String>,
    pub unread_only: Option<bool>,
    pub starred_only: Option<bool>,
    pub query: Option<String>,
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub sort_order: Option<String>,
}

const DEFAULT_LIMIT: i64 = 200;

const SAVED_ARTICLE_ENTRY_COLUMNS: &str =
    "-s.id, 0, s.url, s.title, s.url, NULL, s.snippet, NULL, \
     s.thumbnail_url, s.saved_at, s.saved_at, 1, 1, s.deleted_at";

fn build_fts_query(input: &str) -> Option<String> {
    let tokens: Vec<String> = input
        .split_whitespace()
        .map(|tok| {
            tok.chars()
                .filter(|c| c.is_alphanumeric())
                .collect::<String>()
        })
        .filter(|tok| !tok.is_empty())
        .map(|tok| format!("{tok}*"))
        .collect();
    if tokens.is_empty() {
        None
    } else {
        Some(tokens.join(" "))
    }
}

#[tauri::command]
pub fn list_entries(db: State<'_, Db>, filter: EntriesFilter) -> AppResult<Vec<Entry>> {
    let conn = db.0.lock().unwrap();

    let fts_query = filter.query.as_deref().and_then(build_fts_query);

    let mut parts: Vec<String> = Vec::new();
    let mut bindings: Vec<Box<dyn ToSql>> = Vec::new();

    let mut base = format!("SELECT {ENTRY_COLUMNS} FROM entries e WHERE e.deleted_at IS NULL");

    if let Some(fts) = &fts_query {
        base.push_str(" AND e.id IN (SELECT rowid FROM entries_fts WHERE entries_fts MATCH ?)");
        bindings.push(Box::new(fts.clone()));
    }
    if let Some(feed_id) = filter.feed_id {
        base.push_str(" AND e.feed_id = ?");
        bindings.push(Box::new(feed_id));
    }
    if let Some(folder) = &filter.folder {
        base.push_str(" AND e.feed_id IN (SELECT id FROM feeds WHERE folder = ?)");
        bindings.push(Box::new(folder.clone()));
    }
    if filter.unread_only.unwrap_or(false) {
        base.push_str(" AND e.is_read = 0");
    }
    if filter.starred_only.unwrap_or(false) {
        base.push_str(" AND e.is_starred = 1");
    }
    parts.push(base);

    if filter.starred_only.unwrap_or(false)
        && filter.feed_id.is_none()
        && filter.folder.is_none()
        && !filter.unread_only.unwrap_or(false)
    {
        let mut saved = format!(
            "SELECT {SAVED_ARTICLE_ENTRY_COLUMNS} FROM saved_articles s WHERE s.deleted_at IS NULL"
        );
        if let Some(raw) = filter.query.as_deref().filter(|q| !q.trim().is_empty()) {
            saved.push_str(" AND (s.title LIKE ?1 OR s.url LIKE ?2 OR s.domain LIKE ?3)");
            let like = format!("%{}%", raw.trim());
            bindings.push(Box::new(like.clone()));
            bindings.push(Box::new(like.clone()));
            bindings.push(Box::new(like));
        }
        parts.push(saved);
    }

    let order = if filter.sort_order.as_deref() == Some("asc") {
        "published_at ASC, id ASC"
    } else {
        "published_at DESC, id DESC"
    };
    let sql = format!(
        "{} ORDER BY {order} LIMIT ? OFFSET ?",
        parts.join(" UNION ALL ")
    );
    bindings.push(Box::new(filter.limit.unwrap_or(DEFAULT_LIMIT)));
    bindings.push(Box::new(filter.offset.unwrap_or(0)));

    let mut stmt = conn.prepare(&sql)?;
    let param_refs: Vec<&dyn ToSql> = bindings.iter().map(|b| b.as_ref()).collect();
    let entries = stmt
        .query_map(param_refs.as_slice(), Entry::from_row)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(entries)
}

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
    if id < 0 {
        return Ok(());
    }
    conn.execute(
        "UPDATE entries SET is_read = ?1 WHERE id = ?2",
        params![is_read, id],
    )?;
    if is_read {
        record_read_history(&conn, id)?;
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_star(db: State<'_, Db>, id: i64, is_starred: bool) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    if id < 0 {
        if is_starred {
            conn.execute(
                "UPDATE saved_articles SET deleted_at = NULL WHERE id = ?1",
                params![-id],
            )?;
        } else {
            conn.execute(
                "UPDATE saved_articles SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
                 WHERE id = ?1 AND deleted_at IS NULL",
                params![-id],
            )?;
        }
        return Ok(());
    }
    conn.execute(
        "UPDATE entries SET is_starred = ?1 WHERE id = ?2",
        params![is_starred, id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn delete_entry(db: State<'_, Db>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    if id < 0 {
        conn.execute(
            "UPDATE saved_articles SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') \
             WHERE id = ?1 AND deleted_at IS NULL",
            params![-id],
        )?;
        return Ok(());
    }
    conn.execute(
        "UPDATE entries SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn restore_entry(db: State<'_, Db>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    if id < 0 {
        conn.execute(
            "UPDATE saved_articles SET deleted_at = NULL WHERE id = ?1",
            params![-id],
        )?;
        return Ok(());
    }
    conn.execute(
        "UPDATE entries SET deleted_at = NULL WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_deleted_entries(db: State<'_, Db>) -> AppResult<Vec<Entry>> {
    let conn = db.0.lock().unwrap();
    let sql = format!(
        "SELECT {ENTRY_COLUMNS} FROM entries WHERE deleted_at IS NOT NULL \
         UNION ALL \
         SELECT {SAVED_ARTICLE_ENTRY_COLUMNS} FROM saved_articles s WHERE s.deleted_at IS NOT NULL \
         ORDER BY deleted_at DESC"
    );
    let mut stmt = conn.prepare(&sql)?;
    let entries: Result<Vec<_>, _> = stmt.query_map([], Entry::from_row)?.collect();
    Ok(entries?)
}

#[tauri::command]
pub fn mark_all_read(db: State<'_, Db>, feed_id: Option<i64>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();

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
            conn.execute(
                "UPDATE entries SET is_read = 1 WHERE feed_id = ?1",
                params![id],
            )?
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
    match feed_id {
        Some(id) => conn.execute(
            "UPDATE entries SET is_read = 0 WHERE feed_id = ?1",
            params![id],
        )?,
        None => conn.execute("UPDATE entries SET is_read = 0", [])?,
    };
    Ok(())
}

#[tauri::command]
pub fn record_external_read(
    db: State<'_, Db>,
    url: String,
    title: String,
    feed_title: String,
) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "INSERT INTO read_history (feed_title, entry_guid, title, link, read_at) \
         VALUES (?1, ?2, ?3, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) \
         ON CONFLICT(feed_title, entry_guid) DO NOTHING",
        params![feed_title, url, title, url],
    )?;
    Ok(())
}

#[tauri::command]
pub fn list_read_history(
    db: State<'_, Db>,
    limit: Option<i64>,
    offset: Option<i64>,
) -> AppResult<Vec<ReadHistoryEntry>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(&format!(
        "SELECT {READ_HISTORY_COLUMNS} FROM read_history ORDER BY read_at DESC LIMIT ?1 OFFSET ?2"
    ))?;
    let entries: Result<Vec<_>, _> = stmt
        .query_map(
            params![limit.unwrap_or(DEFAULT_LIMIT), offset.unwrap_or(0)],
            ReadHistoryEntry::from_row,
        )?
        .collect();
    Ok(entries?)
}

#[tauri::command]
pub fn clear_read_history(db: State<'_, Db>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM read_history", [])?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizes_and_prefix_matches() {
        assert_eq!(build_fts_query("rust web"), Some("rust* web*".to_string()));
    }

    #[test]
    fn strips_fts5_syntax_characters() {
        assert_eq!(
            build_fts_query("\"foo\" bar:baz -qux"),
            Some("foo* barbaz* qux*".to_string())
        );
    }

    #[test]
    fn keeps_japanese_tokens() {
        assert_eq!(
            build_fts_query("日本語 検索"),
            Some("日本語* 検索*".to_string())
        );
    }

    #[test]
    fn symbols_only_input_yields_no_filter() {
        assert_eq!(build_fts_query("---  ::: \"\""), None);
    }

    #[test]
    fn empty_input_yields_no_filter() {
        assert_eq!(build_fts_query("   "), None);
    }
}
