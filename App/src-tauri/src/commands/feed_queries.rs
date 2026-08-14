use rusqlite::{params, Connection};

use crate::db::models::{Feed, FEED_COLUMNS};
use crate::error::AppResult;

pub(crate) fn fetch_feed_by_id(conn: &Connection, id: i64) -> AppResult<Feed> {
    let mut feed = conn.query_row(
        &format!("SELECT {FEED_COLUMNS} FROM feeds f WHERE f.id = ?1"),
        params![id],
        Feed::from_row,
    )?;
    feed.unread_count = unread_count(conn, id)?;
    feed.tags = tags_for_feed(conn, id)?;
    Ok(feed)
}

pub(crate) fn unread_count(conn: &Connection, feed_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM entries WHERE feed_id = ?1 AND is_read = 0",
        params![feed_id],
        |row| row.get(0),
    )?)
}

pub(crate) fn tags_for_feed(conn: &Connection, feed_id: i64) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT t.name FROM tags t JOIN feed_tags ft ON ft.tag_id = t.id WHERE ft.feed_id = ?1 ORDER BY t.name",
    )?;
    let names = stmt
        .query_map(params![feed_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(names)
}
