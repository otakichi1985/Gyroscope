use rusqlite::Connection;

/// Schema migrations, applied in order and tracked via `PRAGMA user_version`.
/// Each entry is the full SQL for that version; add new entries to the end
/// rather than editing existing ones once shipped.
const MIGRATIONS: &[&str] = &[
    // v1: initial schema
    r#"
    CREATE TABLE feeds (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        url             TEXT NOT NULL UNIQUE,
        site_url        TEXT,
        title           TEXT,
        custom_title    TEXT,
        icon_path       TEXT,
        folder          TEXT,
        interval_min    INTEGER,
        notify_enabled  INTEGER NOT NULL DEFAULT 0,
        sort_order      INTEGER NOT NULL DEFAULT 0,
        etag            TEXT,
        last_modified   TEXT,
        last_fetched_at TEXT,
        last_error      TEXT,
        created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
    );

    CREATE TABLE entries (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_id         INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
        guid            TEXT NOT NULL,
        title           TEXT,
        link            TEXT,
        author          TEXT,
        summary         TEXT,
        content_html    TEXT,
        thumbnail_url   TEXT,
        published_at    TEXT,
        fetched_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        is_read         INTEGER NOT NULL DEFAULT 0,
        is_starred      INTEGER NOT NULL DEFAULT 0,
        UNIQUE (feed_id, guid)
    );
    CREATE INDEX idx_entries_feed_published ON entries(feed_id, published_at DESC);
    CREATE INDEX idx_entries_published ON entries(published_at DESC);
    CREATE INDEX idx_entries_unread ON entries(is_read);

    CREATE TABLE tags (
        id   INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT NOT NULL UNIQUE
    );

    CREATE TABLE feed_tags (
        feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
        tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
        PRIMARY KEY (feed_id, tag_id)
    );

    CREATE TABLE settings (
        key   TEXT PRIMARY KEY,
        value TEXT NOT NULL
    );
    "#,
    // v2: read history -- deliberately not a foreign key to entries/feeds,
    // since entries get auto-deleted after 30 days (SPEC data model) and
    // feeds can be deleted outright; this table snapshots what's needed to
    // still show "what I've read" after the source row is gone.
    r#"
    CREATE TABLE read_history (
        id         INTEGER PRIMARY KEY AUTOINCREMENT,
        feed_title TEXT NOT NULL,
        entry_guid TEXT NOT NULL,
        title      TEXT,
        link       TEXT,
        read_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
        UNIQUE (feed_title, entry_guid)
    );
    CREATE INDEX idx_read_history_read_at ON read_history(read_at DESC);
    "#,
];

pub fn run(conn: &Connection) -> rusqlite::Result<()> {
    conn.pragma_update(None, "foreign_keys", "ON")?;

    let current_version: u32 = conn.query_row("PRAGMA user_version", [], |row| row.get(0))?;
    let target_version = MIGRATIONS.len() as u32;

    for (index, sql) in MIGRATIONS.iter().enumerate() {
        let version = (index + 1) as u32;
        if version <= current_version {
            continue;
        }
        conn.execute_batch(sql)?;
    }

    if target_version > current_version {
        conn.pragma_update(None, "user_version", target_version)?;
    }

    Ok(())
}
