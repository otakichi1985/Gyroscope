use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::db::models::{Feed, FEED_COLUMNS};
use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::opml::{build_opml, parse_opml, OpmlFeed};

#[derive(Debug, Serialize)]
pub struct OpmlImportSummary {
    pub added: u32,
    pub skipped: u32,
}

/// Registers feeds found in the OPML file but doesn't fetch them yet --
/// an import can list hundreds of feeds, and fetching them all inline would
/// block the command for a long time. They pick up entries on the next
/// manual or scheduled refresh. Shared by both the content-based and
/// path-based import commands below.
fn import_feeds(conn: &Connection, feeds: Vec<OpmlFeed>) -> AppResult<OpmlImportSummary> {
    let mut added = 0u32;
    let mut skipped = 0u32;

    for feed in feeds {
        let exists: Option<i64> = conn
            .query_row("SELECT id FROM feeds WHERE url = ?1", params![feed.xml_url], |r| r.get(0))
            .optional()?;
        if exists.is_some() {
            skipped += 1;
            continue;
        }
        conn.execute(
            "INSERT INTO feeds (url, site_url, title, folder, sort_order) \
             VALUES (?1, ?2, ?3, ?4, (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM feeds))",
            params![feed.xml_url, feed.html_url, feed.title, feed.folder],
        )?;
        added += 1;
    }

    Ok(OpmlImportSummary { added, skipped })
}

fn export_opml_string(db: &Db) -> AppResult<String> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(&format!("SELECT {FEED_COLUMNS} FROM feeds f ORDER BY f.sort_order, f.id"))?;
    let feeds = stmt.query_map([], Feed::from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(build_opml(&feeds))
}

#[tauri::command]
pub fn import_opml(db: State<'_, Db>, content: String) -> AppResult<OpmlImportSummary> {
    let feeds = parse_opml(&content)?;
    let conn = db.0.lock().unwrap();
    import_feeds(&conn, feeds)
}

#[tauri::command]
pub fn export_opml(db: State<'_, Db>) -> AppResult<String> {
    export_opml_string(&db)
}

/// Path-based counterparts used by the frontend's native Open/Save dialog
/// flow (`@tauri-apps/plugin-dialog` returns a path, not file content). Plain
/// `std::fs` here needs no ACL scope -- Tauri's fs permissions only gate the
/// fs *plugin's* own JS-invokable commands, not arbitrary code inside our
/// own command handlers (this is why tauri-plugin-fs was deliberately not
/// added as a dependency).
#[tauri::command]
pub fn import_opml_from_path(db: State<'_, Db>, path: String) -> AppResult<OpmlImportSummary> {
    let content = std::fs::read_to_string(&path)
        .map_err(|e| AppError::Other(format!("ファイルを読み込めませんでした: {e}")))?;
    let feeds = parse_opml(&content)?;
    let conn = db.0.lock().unwrap();
    import_feeds(&conn, feeds)
}

#[tauri::command]
pub fn export_opml_to_path(db: State<'_, Db>, path: String) -> AppResult<()> {
    let xml = export_opml_string(&db)?;
    std::fs::write(&path, xml).map_err(|e| AppError::Other(format!("ファイルを書き込めませんでした: {e}")))?;
    Ok(())
}
