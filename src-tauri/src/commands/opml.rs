use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use tauri::State;

use crate::db::models::{Feed, FEED_COLUMNS};
use crate::db::Db;
use crate::error::AppResult;
use crate::opml::{build_opml, parse_opml};

#[derive(Debug, Serialize)]
pub struct OpmlImportSummary {
    pub added: u32,
    pub skipped: u32,
}

/// Registers feeds found in the OPML file but doesn't fetch them yet --
/// an import can list hundreds of feeds, and fetching them all inline would
/// block the command for a long time. They pick up entries on the next
/// manual or scheduled refresh.
#[tauri::command]
pub fn import_opml(db: State<'_, Db>, content: String) -> AppResult<OpmlImportSummary> {
    let feeds = parse_opml(&content)?;
    let conn = db.0.lock().unwrap();

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

#[tauri::command]
pub fn export_opml(db: State<'_, Db>) -> AppResult<String> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(&format!("SELECT {FEED_COLUMNS} FROM feeds f ORDER BY f.sort_order, f.id"))?;
    let feeds = stmt.query_map([], Feed::from_row)?.collect::<Result<Vec<_>, _>>()?;
    Ok(build_opml(&feeds))
}
