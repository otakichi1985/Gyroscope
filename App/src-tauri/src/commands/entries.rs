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
    /// "asc" sorts oldest-first; anything else (including absent) keeps the
    /// original newest-first order, so old callers/rows with no preference
    /// saved yet behave exactly as before.
    pub sort_order: Option<String>,
}

const DEFAULT_LIMIT: i64 = 200;

/// Turns free-text user input into a safe FTS5 `MATCH` query. Passing raw
/// input straight to `MATCH` can throw a syntax error (quotes, colons,
/// hyphens, etc. are all FTS5 query-language punctuation) -- instead, each
/// whitespace-separated token is stripped down to alphanumerics (Unicode
/// aware, so this keeps Japanese text intact) and turned into a prefix
/// match, then joined with spaces (FTS5's default connector is AND).
/// Returns `None` if nothing searchable is left (e.g. symbols-only input),
/// so the caller can skip the search filter entirely rather than issuing a
/// `MATCH ''` that errors.
fn build_fts_query(input: &str) -> Option<String> {
    let tokens: Vec<String> = input
        .split_whitespace()
        .map(|tok| tok.chars().filter(|c| c.is_alphanumeric()).collect::<String>())
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

    // Soft-deleted (bookmark trash, see delete_entry) entries never show up
    // in any filter of the normal timeline -- only list_deleted_entries
    // reaches them.
    let mut sql = format!("SELECT {ENTRY_COLUMNS} FROM entries e WHERE e.deleted_at IS NULL");
    let mut bindings: Vec<Box<dyn ToSql>> = Vec::new();

    if let Some(fts) = &fts_query {
        sql.push_str(" AND e.id IN (SELECT rowid FROM entries_fts WHERE entries_fts MATCH ?)");
        bindings.push(Box::new(fts.clone()));
    }
    if let Some(feed_id) = filter.feed_id {
        sql.push_str(" AND e.feed_id = ?");
        bindings.push(Box::new(feed_id));
    }
    if let Some(folder) = &filter.folder {
        sql.push_str(" AND e.feed_id IN (SELECT id FROM feeds WHERE folder = ?)");
        bindings.push(Box::new(folder.clone()));
    }
    if filter.unread_only.unwrap_or(false) {
        sql.push_str(" AND e.is_read = 0");
    }
    if filter.starred_only.unwrap_or(false) {
        sql.push_str(" AND e.is_starred = 1");
    }
    if filter.sort_order.as_deref() == Some("asc") {
        sql.push_str(" ORDER BY e.published_at ASC, e.id ASC LIMIT ? OFFSET ?");
    } else {
        sql.push_str(" ORDER BY e.published_at DESC, e.id DESC LIMIT ? OFFSET ?");
    }
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

/// Soft-deletes an entry (sets `deleted_at`) rather than removing the row --
/// this is what backs the bookmark "ゴミ箱" (recoverable for
/// `scheduler::BOOKMARK_TRASH_RETENTION_DAYS` days via `restore_entry`
/// before `scheduler::cleanup_deleted_entries` purges it for good). The
/// command itself is generic (not restricted to starred entries); the UI
/// only exposes it from the bookmark-filtered view.
#[tauri::command]
pub fn delete_entry(db: State<'_, Db>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE entries SET deleted_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now') WHERE id = ?1",
        params![id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn restore_entry(db: State<'_, Db>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE entries SET deleted_at = NULL WHERE id = ?1", params![id])?;
    Ok(())
}

#[tauri::command]
pub fn list_deleted_entries(db: State<'_, Db>) -> AppResult<Vec<Entry>> {
    let conn = db.0.lock().unwrap();
    let sql = format!("SELECT {ENTRY_COLUMNS} FROM entries WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC");
    let mut stmt = conn.prepare(&sql)?;
    let entries: Result<Vec<_>, _> = stmt.query_map([], Entry::from_row)?.collect();
    Ok(entries?)
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

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn tokenizes_and_prefix_matches() {
        assert_eq!(build_fts_query("rust web"), Some("rust* web*".to_string()));
    }

    #[test]
    fn strips_fts5_syntax_characters() {
        // Quotes/colons/hyphens are FTS5 query-language punctuation --
        // passed through unescaped they'd throw a MATCH syntax error rather
        // than just failing to find anything.
        assert_eq!(build_fts_query("\"foo\" bar:baz -qux"), Some("foo* barbaz* qux*".to_string()));
    }

    #[test]
    fn keeps_japanese_tokens() {
        assert_eq!(build_fts_query("日本語 検索"), Some("日本語* 検索*".to_string()));
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
