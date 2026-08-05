use std::sync::Arc;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Emitter, Manager, State};
use tauri_plugin_notification::NotificationExt;
use tokio::sync::Semaphore;
use url::Url;

use crate::db::models::{Feed, FEED_COLUMNS};
use crate::db::{upsert_entries, Db};
use crate::error::{AppError, AppResult};
use crate::fetch::client::{fetch_conditional, FetchOutcome};
use crate::fetch::{discovery, favicon, HttpClient};
use crate::parse::feed::parse_feed;

const MAX_CONCURRENT_FAVICON_FETCHES: usize = 6;

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
pub async fn add_feed(
    db: State<'_, Db>,
    client: State<'_, HttpClient>,
    url: String,
) -> AppResult<Feed> {
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
            return Err(AppError::Other(
                "このフィードは既に登録されています".to_string(),
            ));
        }
    }

    let discovered = discovery::discover(&client.0, &parsed_url).await?;
    let parsed = parse_feed(&discovered.body, Some(&discovered.feed_url))?;

    // Best-effort: a feed with no discoverable site icon just keeps
    // icon_path NULL (frontend shows no thumbnail substitute for it),
    // same as any other missing-image case -- never fails the add itself.
    let icon_path = match &parsed.site_url {
        Some(site_url) => favicon::discover_favicon(&client.0, site_url).await,
        None => None,
    };

    let conn = db.0.lock().unwrap();
    conn.execute(
        "INSERT INTO feeds (url, site_url, title, icon_path, etag, last_modified, last_fetched_at, sort_order) \
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
                 (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM feeds))",
        params![
            discovered.feed_url,
            parsed.site_url,
            parsed.title,
            icon_path,
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
    let mut stmt = conn.prepare(&format!(
        "SELECT {FEED_COLUMNS} FROM feeds f ORDER BY f.sort_order, f.id"
    ))?;
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
    conn.execute(
        "UPDATE feeds SET folder = ?1 WHERE id = ?2",
        params![folder, id],
    )?;
    Ok(())
}

const KNOWN_GENRES_KEY: &str = "known_genres";

fn read_known_genres(conn: &Connection) -> AppResult<Vec<String>> {
    Ok(crate::db::settings::get(conn, KNOWN_GENRES_KEY)?
        .and_then(|json| serde_json::from_str(&json).ok())
        .unwrap_or_default())
}

fn write_known_genres(conn: &Connection, names: &[String]) -> AppResult<()> {
    let json = serde_json::to_string(names).expect("Vec<String> always serializes");
    crate::db::settings::set(conn, KNOWN_GENRES_KEY, &json)?;
    Ok(())
}

/// Genres as a first-class, folder-like list (user request: create a genre
/// up front and file feeds into it, rather than the old "type the same
/// string on every feed row" free-text approach). Backed by the existing
/// key/value `settings` table (a JSON array under `known_genres`) rather
/// than a new SQL table+migration -- this is genuinely just a list of
/// names, and reusing `db::settings` (already built for the read-history
/// retention setting) keeps this a one-file addition.
///
/// The returned list is the union of that explicit list and whatever
/// `feeds.folder` values are actually in use -- a feed's assigned genre
/// (e.g. set via OPML import, which never calls `create_genre`) must never
/// disappear from the picker just because it wasn't "officially" created.
#[tauri::command]
pub fn list_genres(db: State<'_, Db>) -> AppResult<Vec<String>> {
    let conn = db.0.lock().unwrap();
    let mut set: std::collections::BTreeSet<String> =
        read_known_genres(&conn)?.into_iter().collect();
    let mut stmt = conn.prepare("SELECT DISTINCT folder FROM feeds WHERE folder IS NOT NULL")?;
    let used: Vec<String> = stmt
        .query_map([], |r| r.get(0))?
        .collect::<Result<_, _>>()?;
    set.extend(used);
    Ok(set.into_iter().collect())
}

/// Idempotent (creating an already-known genre is a no-op, not an error) --
/// mirrors "New Folder" when one of that name already exists.
#[tauri::command]
pub fn create_genre(db: State<'_, Db>, name: String) -> AppResult<()> {
    let name = name.trim().to_string();
    if name.is_empty() {
        return Err(AppError::Other("ジャンル名を入力してください".to_string()));
    }
    let conn = db.0.lock().unwrap();
    let mut names = read_known_genres(&conn)?;
    if !names.iter().any(|n| n == &name) {
        names.push(name);
        names.sort();
        write_known_genres(&conn, &names)?;
    }
    Ok(())
}

/// Deleting a genre un-files any feed currently in it (folder -> NULL)
/// rather than deleting those feeds -- same "contents become unfiled"
/// semantics as deleting a real folder.
#[tauri::command]
pub fn delete_genre(db: State<'_, Db>, name: String) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "UPDATE feeds SET folder = NULL WHERE folder = ?1",
        params![name],
    )?;
    let mut names = read_known_genres(&conn)?;
    names.retain(|n| n != &name);
    write_known_genres(&conn, &names)?;
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
        let tag_id: i64 =
            conn.query_row("SELECT id FROM tags WHERE name = ?1", params![tag], |r| {
                r.get(0)
            })?;
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
/// Also returns how many entries were genuinely new (not just re-fetched),
/// so batch callers can report a total "N new" (or "no updates") count.
///
/// Emitting "feeds-updated" is left to the callers rather than done here,
/// so a batch refresh (`scheduler::refresh_many`) can emit once for the
/// whole batch instead of once per feed.
pub(crate) async fn refresh_feed_inner(
    app: &AppHandle,
    db: &Db,
    client: &reqwest::Client,
    id: i64,
) -> AppResult<(Feed, usize)> {
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

    let (new_entries, favicon_site_url) = {
        let conn = db.0.lock().unwrap();
        let mut new_entries = Vec::new();
        let mut feed_content_changed = false;
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
                    feed_content_changed = true;
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
                new_entries[0]
                    .title
                    .clone()
                    .unwrap_or_else(|| "(無題)".to_string())
            } else {
                format!("{}件の新着記事", new_entries.len())
            };
            // Best-effort: a notification failure (e.g. OS permission denied)
            // must not fail the refresh itself.
            let _ = app
                .notification()
                .builder()
                .title(display_name)
                .body(body)
                .show();
        }

        let favicon_site_url = if feed_content_changed {
            conn.query_row(
                "SELECT site_url FROM feeds WHERE id = ?1 AND icon_path IS NULL",
                params![id],
                |row| row.get::<_, Option<String>>(0),
            )
            .optional()?
            .flatten()
        } else {
            None
        };
        (new_entries, favicon_site_url)
    };
    let new_count = new_entries.len();

    // OPML imports register feeds without doing network work. Discover the
    // favicon on their first successful refresh so the card fallback works
    // immediately, rather than only after the next full app restart.
    if let Some(site_url) = favicon_site_url {
        if let Some(icon_path) = favicon::discover_favicon(client, &site_url).await {
            let conn = db.0.lock().unwrap();
            conn.execute(
                "UPDATE feeds SET icon_path = ?1 WHERE id = ?2 AND icon_path IS NULL",
                params![icon_path, id],
            )?;
        }
    }

    let conn = db.0.lock().unwrap();
    Ok((fetch_feed_by_id(&conn, id)?, new_count))
}

#[tauri::command]
pub async fn refresh_feed(
    app: AppHandle,
    db: State<'_, Db>,
    client: State<'_, HttpClient>,
    id: i64,
) -> AppResult<Feed> {
    let (feed, _new_count) = refresh_feed_inner(&app, &db, &client.0, id).await?;
    let _ = app.emit("feeds-updated", ());
    Ok(feed)
}

/// Backs the tray's "更新" item and FilterBar's "記事を更新" button. The
/// scheduler's periodic tick reuses `crate::scheduler::refresh_many`
/// directly rather than this command, since it already runs inside the
/// app process and doesn't need to round-trip through IPC. Returns the
/// total new-entry count across the whole batch so the manual-refresh UI
/// can tell the user "更新はありません" when nothing changed (user
/// feedback: a silent no-op refresh was indistinguishable from a broken one).
#[tauri::command]
pub async fn refresh_all_feeds(app: AppHandle, db: State<'_, Db>) -> AppResult<usize> {
    let ids: Vec<i64> = {
        let conn = db.0.lock().unwrap();
        let mut stmt = conn.prepare("SELECT id FROM feeds")?;
        let ids: Result<Vec<i64>, _> = stmt.query_map([], |r| r.get(0))?.collect();
        ids?
    };
    crate::scheduler::refresh_many(&app, ids).await
}

/// One-time-per-feed catch-up for feeds added before favicon discovery
/// existed (`add_feed` only calls `favicon::discover_favicon` for newly
/// added feeds, so anything added earlier is stuck with a NULL
/// `icon_path` forever otherwise). Mirrors `scheduler::refresh_many`'s
/// concurrency-limited batch pattern. Spawned from `lib.rs`'s `.setup()`
/// rather than run synchronously at startup: this needs network access
/// per feed, and SPEC §7 requires startup to stay under 2s.
pub(crate) async fn backfill_favicons(app: &AppHandle) {
    let targets: Vec<(i64, String)> = {
        let db = app.state::<Db>();
        let conn = db.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, site_url FROM feeds WHERE icon_path IS NULL AND site_url IS NOT NULL",
        ) else {
            return;
        };
        let Ok(rows) = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, String>(1)?)))
        else {
            return;
        };
        rows.filter_map(Result::ok).collect()
    };
    if targets.is_empty() {
        return;
    }

    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_FAVICON_FETCHES));
    let mut handles = Vec::with_capacity(targets.len());
    for (id, site_url) in targets {
        let app = app.clone();
        let semaphore = Arc::clone(&semaphore);
        handles.push(tauri::async_runtime::spawn(async move {
            let _permit = semaphore.acquire_owned().await;
            let client = app.state::<HttpClient>();
            let Some(icon_path) = favicon::discover_favicon(&client.0, &site_url).await else {
                return;
            };
            let db = app.state::<Db>();
            let conn = db.0.lock().unwrap();
            let _ = conn.execute(
                "UPDATE feeds SET icon_path = ?1 WHERE id = ?2",
                params![icon_path, id],
            );
        }));
    }
    for handle in handles {
        let _ = handle.await;
    }
    let _ = app.emit("feeds-updated", ());
}

fn fetch_feed_by_id(conn: &Connection, id: i64) -> AppResult<Feed> {
    let mut feed = conn.query_row(
        &format!("SELECT {FEED_COLUMNS} FROM feeds f WHERE f.id = ?1"),
        params![id],
        Feed::from_row,
    )?;
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
