use rusqlite::Row;
use serde::Serialize;

/// Feed as exposed to the frontend. Fetch bookkeeping fields (etag,
/// last_modified) stay DB-only since the UI never needs them.
#[derive(Debug, Clone, Serialize)]
pub struct Feed {
    pub id: i64,
    pub url: String,
    pub site_url: Option<String>,
    pub title: Option<String>,
    pub custom_title: Option<String>,
    pub icon_path: Option<String>,
    pub folder: Option<String>,
    pub interval_min: Option<i64>,
    pub notify_enabled: bool,
    pub sort_order: i64,
    pub last_fetched_at: Option<String>,
    pub last_error: Option<String>,
    pub created_at: String,
    pub tags: Vec<String>,
    pub unread_count: i64,
}

pub const FEED_COLUMNS: &str = "f.id, f.url, f.site_url, f.title, f.custom_title, f.icon_path, \
     f.folder, f.interval_min, f.notify_enabled, f.sort_order, f.last_fetched_at, \
     f.last_error, f.created_at";

impl Feed {
    /// Maps a row selected with [`FEED_COLUMNS`] (aliased `f`). `tags` and
    /// `unread_count` are filled in separately by the caller since they come
    /// from auxiliary queries, not this row itself.
    pub fn from_row(row: &Row) -> rusqlite::Result<Feed> {
        Ok(Feed {
            id: row.get(0)?,
            url: row.get(1)?,
            site_url: row.get(2)?,
            title: row.get(3)?,
            custom_title: row.get(4)?,
            icon_path: row.get(5)?,
            folder: row.get(6)?,
            interval_min: row.get(7)?,
            notify_enabled: row.get(8)?,
            sort_order: row.get(9)?,
            last_fetched_at: row.get(10)?,
            last_error: row.get(11)?,
            created_at: row.get(12)?,
            tags: Vec::new(),
            unread_count: 0,
        })
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct Entry {
    pub id: i64,
    pub feed_id: i64,
    pub guid: String,
    pub title: Option<String>,
    pub link: Option<String>,
    pub author: Option<String>,
    pub summary: Option<String>,
    pub content_html: Option<String>,
    pub thumbnail_url: Option<String>,
    pub published_at: Option<String>,
    pub fetched_at: String,
    pub is_read: bool,
    pub is_starred: bool,
}

pub const ENTRY_COLUMNS: &str = "id, feed_id, guid, title, link, author, summary, content_html, \
     thumbnail_url, published_at, fetched_at, is_read, is_starred";

impl Entry {
    pub fn from_row(row: &Row) -> rusqlite::Result<Entry> {
        Ok(Entry {
            id: row.get(0)?,
            feed_id: row.get(1)?,
            guid: row.get(2)?,
            title: row.get(3)?,
            link: row.get(4)?,
            author: row.get(5)?,
            summary: row.get(6)?,
            content_html: row.get(7)?,
            thumbnail_url: row.get(8)?,
            published_at: row.get(9)?,
            fetched_at: row.get(10)?,
            is_read: row.get(11)?,
            is_starred: row.get(12)?,
        })
    }
}

/// A parsed feed entry, ready to be upserted. Not yet associated with a
/// feed_id or database-assigned id.
#[derive(Debug, Clone)]
pub struct NewEntry {
    pub guid: String,
    pub title: Option<String>,
    pub link: Option<String>,
    pub author: Option<String>,
    pub summary: Option<String>,
    pub content_html: Option<String>,
    pub thumbnail_url: Option<String>,
    pub published_at: Option<String>,
}
