pub mod migrations;
pub mod models;
pub mod settings;

use std::collections::HashSet;
use std::path::Path;
use std::sync::Mutex;

use rusqlite::{params, Connection};

use crate::parse::text::strip_html;
use models::NewEntry;

pub struct Db(pub Mutex<Connection>);

pub fn open(data_dir: &Path) -> rusqlite::Result<Connection> {
    std::fs::create_dir_all(data_dir).expect("failed to create app data directory");
    let conn = Connection::open(data_dir.join(crate::paths::DB_FILENAME))?;
    migrations::run(&conn)?;
    backfill_body_text(&conn)?;
    Ok(conn)
}

fn backfill_body_text(conn: &Connection) -> rusqlite::Result<()> {
    let rows: Vec<(i64, Option<String>, Option<String>)> = {
        let mut stmt =
            conn.prepare("SELECT id, content_html, summary FROM entries WHERE body_text IS NULL")?;
        let rows: Result<Vec<_>, _> = stmt
            .query_map([], |r| Ok((r.get(0)?, r.get(1)?, r.get(2)?)))?
            .collect();
        rows?
    };
    if rows.is_empty() {
        return Ok(());
    }
    let tx = conn.unchecked_transaction()?;
    for (id, content_html, summary) in rows {
        if let Some(body_text) = content_html
            .as_deref()
            .or(summary.as_deref())
            .map(strip_html)
        {
            tx.execute(
                "UPDATE entries SET body_text = ?1 WHERE id = ?2",
                params![body_text, id],
            )?;
        }
    }
    tx.commit()
}

pub fn upsert_entries(
    conn: &Connection,
    feed_id: i64,
    entries: &[NewEntry],
) -> rusqlite::Result<Vec<NewEntry>> {
    let existing_guids: HashSet<String> = {
        let mut stmt = conn.prepare("SELECT guid FROM entries WHERE feed_id = ?1")?;
        let guids: Result<HashSet<String>, _> = stmt
            .query_map(params![feed_id], |row| row.get(0))?
            .collect();
        guids?
    };

    let mut stmt = conn.prepare(
        "INSERT INTO entries \
            (feed_id, guid, title, link, author, summary, content_html, thumbnail_url, published_at, body_text) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10) \
         ON CONFLICT(feed_id, guid) DO UPDATE SET \
            title = excluded.title, \
            link = excluded.link, \
            author = excluded.author, \
            summary = excluded.summary, \
            content_html = excluded.content_html, \
            thumbnail_url = excluded.thumbnail_url, \
            published_at = excluded.published_at, \
            body_text = excluded.body_text",
    )?;
    let mut new_entries = Vec::new();
    for entry in entries {
        let body_text = entry
            .content_html
            .as_deref()
            .or(entry.summary.as_deref())
            .map(strip_html);
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
            body_text,
        ])?;
        if !existing_guids.contains(&entry.guid) {
            new_entries.push(entry.clone());
        }
    }
    Ok(new_entries)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn setup() -> Connection {
        let conn = Connection::open_in_memory().unwrap();
        migrations::run(&conn).unwrap();
        conn.execute(
            "INSERT INTO feeds (url) VALUES ('https://example.com/feed.xml')",
            [],
        )
        .unwrap();
        conn
    }

    fn entry(guid: &str, title: &str, content_html: &str) -> NewEntry {
        NewEntry {
            guid: guid.to_string(),
            title: Some(title.to_string()),
            link: None,
            author: None,
            summary: None,
            content_html: Some(content_html.to_string()),
            thumbnail_url: None,
            published_at: None,
        }
    }

    #[test]
    fn fts_index_matches_inserted_and_updated_entries() {
        let conn = setup();
        upsert_entries(
            &conn,
            1,
            &[entry(
                "a",
                "Rust rewrite",
                "<p>We migrated the backend to Rust.</p>",
            )],
        )
        .unwrap();

        let hit: i64 = conn
            .query_row(
                "SELECT rowid FROM entries_fts WHERE entries_fts MATCH 'rust*'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(hit, 1);

        upsert_entries(
            &conn,
            1,
            &[entry("a", "Rewrite done", "<p>Now using Go instead.</p>")],
        )
        .unwrap();

        let old_gone: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM entries_fts WHERE entries_fts MATCH 'migrated'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(old_gone, 0);

        let new_hit: String = conn
            .query_row(
                "SELECT title FROM entries_fts WHERE entries_fts MATCH 'go'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(new_hit, "Rewrite done");
    }

    #[test]
    fn fts_row_removed_on_entry_delete() {
        let conn = setup();
        upsert_entries(&conn, 1, &[entry("a", "Temp", "<p>Deleteme text</p>")]).unwrap();
        conn.execute("DELETE FROM entries WHERE guid = 'a'", [])
            .unwrap();

        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM entries_fts WHERE entries_fts MATCH 'deleteme'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(count, 0);
    }

    #[test]
    fn backfill_makes_pre_existing_rows_searchable() {
        let conn = setup();
        conn.execute(
            "INSERT INTO entries (feed_id, guid, title, content_html) \
             VALUES (1, 'pre-existing', 'Old Entry', '<p>Written before search existed.</p>')",
            [],
        )
        .unwrap();

        let before: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM entries_fts WHERE entries_fts MATCH 'written'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(before, 0);

        backfill_body_text(&conn).unwrap();

        let after: String = conn
            .query_row(
                "SELECT title FROM entries_fts WHERE entries_fts MATCH 'written'",
                [],
                |r| r.get(0),
            )
            .unwrap();
        assert_eq!(after, "Old Entry");
    }
}
