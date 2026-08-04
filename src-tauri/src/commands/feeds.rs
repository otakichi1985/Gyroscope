use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Emitter, State};
use tauri_plugin_notification::NotificationExt;
use url::Url;

use crate::db::models::{Feed, FEED_COLUMNS};
use crate::db::{upsert_entries, Db};
use crate::error::{AppError, AppResult};
use crate::fetch::client::{fetch_conditional, FetchOutcome};
use crate::fetch::{discovery, HttpClient};
use crate::parse::feed::parse_feed;

/// SPEC §5: user-supplied URLs may only be http(s); file:// and javascript:
/// (or anything else) must be rejected before any network activity happens.
fn validate_url(input: &str) -> AppResult<Url> {
    let url = Url::parse(input.trim()).map_err(|_| AppError::InvalidUrl(input.to_string()))?;
    match url.scheme() {
        "http" | "https" => Ok(url),
        _ => Err(AppError::InvalidUrl(input.to_string())),
    }
}

#[tauri::command]
pub async fn add_feed(db: State<'_, Db>, client: State<'_, HttpClient>, url: String) -> AppResult<Feed> {
    let parsed_url = validate_url(&url)?;

    {
        let conn = db.0.lock().unwrap();
        let existing: Option<i64> = conn
            .query_row(
                "SELECT id FROM feeds WHERE url = ?1",
                params![parsed_url.as_str()],
                |row| row.get(0),
            )
            .optional()?;
        if existing.is_some() {
            return Err(AppError::Other("このフィードは既に登録されています".to_string()));
        }
    }

    let discovered = discovery::discover(&client.0, &parsed_url).await?;
    let parsed = parse_feed(&discovered.body, Some(&discovered.feed_url))?;

    let conn = db.0.lock().unwrap();
    conn.execute(
        "INSERT INTO feeds (url, site_url, title, etag, last_modified, last_fetched_at, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
                 (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM feeds))",
        params![
            discovered.feed_url,
            parsed.site_url,
            parsed.title,
            discovered.etag,
            discovered.last_modified,
        ],
    )?;
    let feed_id = conn.last_insert_rowid();
    // Discarded: a brand-new feed's entire initial batch is trivially "new"
    // and notify_enabled defaults to false for feeds that don't exist yet,
    // so there's nothing to notify about on first import anyway.
    let _ = upsert_entries(&conn, feed_id, &parsed.entries)?;

    fetch_feed_by_id(&conn, feed_id)
}

#[tauri::command]
pub fn list_feeds(db: State<'_, Db>) -> AppResult<Vec<Feed>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(&format!("SELECT {FEED_COLUMNS} FROM feeds f ORDER BY f.sort_order, f.id"))?;
    let mut feeds = stmt
        .query_map([], Feed::from_row)?
        .collect::<Result<Vec<_>, _>>()?;

    for feed in &mut feeds {
        feed.unread_count = unread_count(&conn, feed.id)?;
        feed.tags = tags_for_feed(&conn, feed.id)?;
    }
    Ok(feeds)
}

#[tauri::command]
pub fn delete_feed(db: State<'_, Db>, id: i64) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM feeds WHERE id = ?1", params![id])?;
    Ok(())
}

#[tauri::command]
pub fn rename_feed(db: State<'_, Db>, id: i64, custom_title: Option<String>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE feeds SET custom_title = ?1 WHERE id = ?2",
        params![custom_title, id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn set_feed_folder(db: State<'_, Db>, id: i64, folder: Option<String>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("UPDATE feeds SET folder = ?1 WHERE id = ?2", params![folder, id])?;
    Ok(())
}

#[tauri::command]
pub fn set_feed_interval(db: State<'_, Db>, id: i64, interval_min: Option<i64>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE feeds SET interval_min = ?1 WHERE id = ?2",
        params![interval_min, id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn set_feed_notify(db: State<'_, Db>, id: i64, notify_enabled: bool) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE feeds SET notify_enabled = ?1 WHERE id = ?2",
        params![notify_enabled, id],
    )?;
    Ok(())
}

#[tauri::command]
pub fn reorder_feeds(db: State<'_, Db>, ordered_ids: Vec<i64>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    for (index, id) in ordered_ids.iter().enumerate() {
        conn.execute(
            "UPDATE feeds SET sort_order = ?1 WHERE id = ?2",
            params![index as i64, id],
        )?;
    }
    Ok(())
}

#[tauri::command]
pub fn set_feed_tags(db: State<'_, Db>, id: i64, tags: Vec<String>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute("DELETE FROM feed_tags WHERE feed_id = ?1", params![id])?;
    for tag in &tags {
        let tag = tag.trim();
        if tag.is_empty() {
            continue;
        }
        conn.execute(
            "INSERT INTO tags (name) VALUES (?1) ON CONFLICT(name) DO NOTHING",
            params![tag],
        )?;
        let tag_id: i64 = conn.query_row("SELECT id FROM tags WHERE name = ?1", params![tag], |r| r.get(0))?;
        conn.execute(
            "INSERT OR IGNORE INTO feed_tags (feed_id, tag_id) VALUES (?1, ?2)",
            params![id, tag_id],
        )?;
    }
    Ok(())
}

/// Manual "update" button (`refresh_feed`) and the periodic auto-refresh
/// (`crate::scheduler`) both go through this: conditional GET, and on
/// failure the error is stored on the feed row rather than propagated, so
/// the UI can show a per-feed warning icon instead of losing the rest of
/// the timeline (SPEC §7 -- errors must be visible, never swallowed).
///
/// Emitting "feeds-updated" is left to the callers rather than done here,
/// so a batch refresh (`scheduler::refresh_many`) can emit once for the
/// whole batch instead of once per feed.
pub(crate) async fn refresh_feed_inner(
    app: &AppHandle,
    db: &Db,
    client: &reqwest::Client,
    id: i64,
) -> AppResult<Feed> {
    let (url, etag, last_modified, notify_enabled, custom_title, title) = {
        let conn = db.0.lock().unwrap();
        conn.query_row(
            "SELECT url, etag, last_modified, notify_enabled, custom_title, title FROM feeds WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, bool>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                ))
            },
        )?
    };

    let outcome = fetch_conditional(client, &url, etag.as_deref(), last_modified.as_deref()).await;

    let conn = db.0.lock().unwrap();
    let mut new_entries = Vec::new();
    match outcome {
        Ok(FetchOutcome::NotModified) => {
            conn.execute(
                "UPDATE feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = NULL \
                 WHERE id = ?1",
                params![id],
            )?;
        }
        Ok(FetchOutcome::Fetched {
            body,
            etag,
            last_modified,
        }) => match parse_feed(&body, Some(&url)) {
            Ok(parsed) => {
                conn.execute(
                    "UPDATE feeds SET title = COALESCE(?1, title), site_url = COALESCE(?2, site_url), \
                         etag = ?3, last_modified = ?4, \
                         last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = NULL \
                     WHERE id = ?5",
                    params![parsed.title, parsed.site_url, etag, last_modified, id],
                )?;
                new_entries = upsert_entries(&conn, id, &parsed.entries)?;
            }
            Err(err) => {
                conn.execute(
                    "UPDATE feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = ?1 \
                     WHERE id = ?2",
                    params![err.to_string(), id],
                )?;
            }
        },
        Err(err) => {
            conn.execute(
                "UPDATE feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = ?1 \
                 WHERE id = ?2",
                params![err.to_string(), id],
            )?;
        }
    }

    if notify_enabled && !new_entries.is_empty() {
        let display_name = custom_title.as_deref().or(title.as_deref()).unwrap_or(&url);
        let body = if new_entries.len() == 1 {
            new_entries[0].title.clone().unwrap_or_else(|| "(無題)".to_string())
        } else {
            format!("{}件の新着記事", new_entries.len())
        };
        // Best-effort: a notification failure (e.g. OS permission denied)
        // must not fail the refresh itself.
        let _ = app.notification().builder().title(display_name).body(body).show();
    }

    fetch_feed_by_id(&conn, id)
}

#[tauri::command]
pub async fn refresh_feed(app: AppHandle, db: State<'_, Db>, client: State<'_, HttpClient>, id: i64) -> AppResult<Feed> {
    let feed = refresh_feed_inner(&app, &db, &client.0, id).await?;
    let _ = app.emit("feeds-updated", ());
    Ok(feed)
}

/// Backs the tray's "更新" item and (later) any "refresh all" UI. The
/// scheduler's periodic tick reuses `crate::scheduler::refresh_many`
/// directly rather than this command, since it already runs inside the
/// app process and doesn't need to round-trip through IPC.
#[tauri::command]
pub async fn refresh_all_feeds(app: AppHandle, db: State<'_, Db>) -> AppResult<()> {
    let ids: Vec<i64> = {
        let conn = db.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id FROM feeds")?;
        let ids: Result<Vec<i64>, _> = stmt.query_map([], |r| r.get(0))?.collect();
        ids?
    };
    crate::scheduler::refresh_many(&app, ids).await
}

fn fetch_feed_by_id(conn: &Connection, id: i64) -> AppResult<Feed> {
    let mut feed = conn.query_row(&format!("SELECT {FEED_COLUMNS} FROM feeds f WHERE f.id = ?1"), params![id], Feed::from_row)?;
    feed.unread_count = unread_count(conn, id)?;
    feed.tags = tags_for_feed(conn, id)?;
    Ok(feed)
}

fn unread_count(conn: &Connection, feed_id: i64) -> AppResult<i64> {
    Ok(conn.query_row(
        "SELECT COUNT(*) FROM entries WHERE feed_id = ?1 AND is_read = 0",
        params![feed_id],
        |row| row.get(0),
    )?)
}

fn tags_for_feed(conn: &Connection, feed_id: i64) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT t.name FROM tags t JOIN feed_tags ft ON ft.tag_id = t.id WHERE ft.feed_id = ?1 ORDER BY t.name",
    )?;
    let names = stmt
        .query_map(params![feed_id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(names)
}
