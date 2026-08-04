pub mod migrations;
pub mod models;

use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};

use models::NewEntry;

/// App-managed handle to the single SQLite connection. A single connection
/// guarded by a mutex is simple and fast enough here: all queries are local,
/// small, and the app has no concurrent-writer requirement beyond what the
/// UI itself triggers.
pub struct Db(pub Mutex<Connection>);

pub fn open(data_dir: &Path) -> rusqlite::Result<Connection> {
    std::fs::create_dir_all(data_dir).expect("failed to create app data directory");
    let conn = Connection::open(data_dir.join("rss-widget.sqlite3"))?;
    migrations::run(&conn)?;
    Ok(conn)
}

/// Inserts new entries, or refreshes an existing one's content while
/// preserving its `is_read`/`is_starred` state -- the dedup key
/// (`feed_id`, `guid`) is what makes this idempotent across re-fetches.
///
/// Returns the subset of `entries` that were genuinely new (not already
/// present for this feed), for callers that need to know (Phase 4:
/// notifications should only fire for real new arrivals, not updates to
/// existing rows). `ON CONFLICT ... DO UPDATE` always reports 1 row changed
/// either way, so `changes()` can't distinguish insert from update -- the
/// existing-guid set has to be snapshotted before the upsert instead.
pub fn upsert_entries(
    conn: &Connection,
    feed_id: i64,
    entries: &[NewEntry],
) -> rusqlite::Result<Vec<NewEntry>> {
    let existing_guids: HashSet<String> = {
        let mut stmt = conn.prepare("SELECT guid FROM entries WHERE feed_id = ?1")?;
        let guids: Result<HashSet<String>, _> = stmt.query_map(params![feed_id], |row| row.get(0))?.collect();
        guids?
    };

    let mut stmt = conn.prepare(
        "INSERT INTO entries \
            (feed_id, guid, title, link, author, summary, content_html, thumbnail_url, published_at) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9) \
         ON CONFLICT(feed_id, guid) DO UPDATE SET \
            title = excluded.title, \
            link = excluded.link, \
            author = excluded.author, \
            summary = excluded.summary, \
            content_html = excluded.content_html, \
            thumbnail_url = excluded.thumbnail_url, \
            published_at = excluded.published_at",
    )?;
    let mut new_entries = Vec::new();
    for entry in entries {
        stmt.execute(params![
            feed_id,
            entry.guid,
            entry.title,
            entry.link,
            entry.author,
            entry.summary,
            entry.content_html,
            entry.thumbnail_url,
            entry.published_at,
        ])?;
        if !existing_guids.contains(&entry.guid) {
            new_entries.push(entry.clone());
        }
    }
    Ok(new_entries)
}
