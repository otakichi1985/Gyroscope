use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, State};
use tauri_plugin_notification::NotificationExt;
use url::Url;

use crate::db::models::{Feed, NewEntry, FEED_COLUMNS};
use crate::db::{upsert_entries, Db};
use crate::error::{AppError, AppResult};
use crate::fetch::booth::{self, BoothItem, BoothScrapeError, BoothScrapeResult};
use crate::fetch::client::{fetch_conditional, FetchOutcome};
use crate::fetch::{discovery, favicon, HttpClient};
use crate::parse::feed::parse_feed;
use super::feed_source::{is_booth_shop_host, validate_url};
use super::feed_queries::{fetch_feed_by_id, tags_for_feed, unread_count};

/// BOOTH default refresh interval -- longer than the global 30-minute RSS
/// default (`scheduler::DEFAULT_INTERVAL_MIN`). Polling a scraped page as
/// aggressively as a normal feed risks tripping Cloudflare.
const BOOTH_DEFAULT_INTERVAL_MIN: i64 = 60;
fn booth_item_to_entry(item: &BoothItem) -> NewEntry {
    NewEntry {
        guid: item.id.clone(),
        title: Some(item.title.clone()),
        link: Some(item.url.clone()),
        author: None,
        summary: item.price_text.clone(),
        content_html: None,
        thumbnail_url: item.thumbnail_url.clone(),
        published_at: None,
    }
}

#[tauri::command]
pub async fn add_feed(
    app: AppHandle,
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

    if is_booth_shop_host(&parsed_url) {
        return add_booth_feed(&app, &db, parsed_url).await;
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

/// BOOTH counterpart to the RSS path above in `add_feed`. Scrapes the shop
/// once up front (same as discovering+parsing a feed for the first time),
/// then immediately marks that whole initial batch read: a shop's existing
/// catalog isn't "news" the way a fresh RSS feed's backlog is, only
/// products that appear on a *later* scan should. This is a direct
/// `UPDATE`, not `commands::entries::mark_all_read` -- that command also
/// snapshots into `read_history`, and logging the entire catalog as "just
/// read" there would be wrong (the user never actually read any of it).
///
/// `notify_enabled` defaults to on here specifically (every other feed
/// defaults to off) -- unlike a general RSS subscription, the whole point
/// of watching a BOOTH shop is to be alerted the moment something new
/// shows up, so an opt-in-then-remember-to-flip-a-toggle default would
/// undercut the feature. Still editable per-feed afterward, same as any
/// other feed's notify toggle.
async fn add_booth_feed(app: &AppHandle, db: &Db, shop_url: Url) -> AppResult<Feed> {
    let result: BoothScrapeResult = booth::scrape_shop(app, shop_url.as_str())
        .await
        .map_err(|e: BoothScrapeError| AppError::Scrape(e.to_string()))?;

    let entries: Vec<NewEntry> = result.items.iter().map(booth_item_to_entry).collect();

    let conn = db.0.lock().unwrap();
    conn.execute(
        "INSERT INTO feeds (url, site_url, title, icon_path, source_type, notify_enabled, interval_min, \
             last_fetched_at, sort_order) \
         VALUES (?1, ?1, ?2, ?3, 'booth', 1, ?4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), \
                 (SELECT COALESCE(MAX(sort_order), -1) + 1 FROM feeds))",
        params![
            shop_url.as_str(),
            result.shop_title,
            result.shop_icon_url,
            BOOTH_DEFAULT_INTERVAL_MIN,
        ],
    )?;
    let feed_id = conn.last_insert_rowid();
    let _ = upsert_entries(&conn, feed_id, &entries)?;
    conn.execute(
        "UPDATE entries SET is_read = 1 WHERE feed_id = ?1",
        params![feed_id],
    )?;

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
/// Writes a BOOTH scrape's outcome to the DB and returns (new entries,
/// whether the feed's own content changed) -- the shape
/// `refresh_feed_inner` needs to decide on notifications/favicon lookup
/// afterward, same contract as `apply_rss_outcome` below.
fn apply_booth_outcome(
    conn: &Connection,
    id: i64,
    outcome: Result<BoothScrapeResult, BoothScrapeError>,
) -> AppResult<(Vec<NewEntry>, bool)> {
    match outcome {
        Ok(result) => {
            let entries: Vec<NewEntry> = result.items.iter().map(booth_item_to_entry).collect();
            conn.execute(
                "UPDATE feeds SET title = COALESCE(?1, title), icon_path = COALESCE(icon_path, ?2), \
                     last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = NULL \
                 WHERE id = ?3",
                params![result.shop_title, result.shop_icon_url, id],
            )?;
            let new_entries = upsert_entries(conn, id, &entries)?;
            Ok((new_entries, true))
        }
        Err(err) => {
            conn.execute(
                "UPDATE feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = ?1 \
                 WHERE id = ?2",
                params![err.to_string(), id],
            )?;
            Ok((Vec::new(), false))
        }
    }
}

/// RSS counterpart to `apply_booth_outcome` above -- this is the original
/// `refresh_feed_inner` body, extracted unchanged so both sources can share
/// the notification/favicon tail that follows.
fn apply_rss_outcome(
    conn: &Connection,
    id: i64,
    url: &str,
    outcome: AppResult<FetchOutcome>,
) -> AppResult<(Vec<NewEntry>, bool)> {
    match outcome {
        Ok(FetchOutcome::NotModified) => {
            conn.execute(
                "UPDATE feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = NULL \
                 WHERE id = ?1",
                params![id],
            )?;
            Ok((Vec::new(), false))
        }
        Ok(FetchOutcome::Fetched {
            body,
            etag,
            last_modified,
        }) => match parse_feed(&body, Some(url)) {
            Ok(parsed) => {
                conn.execute(
                    "UPDATE feeds SET title = COALESCE(?1, title), site_url = COALESCE(?2, site_url), \
                         etag = ?3, last_modified = ?4, \
                         last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = NULL \
                     WHERE id = ?5",
                    params![parsed.title, parsed.site_url, etag, last_modified, id],
                )?;
                let new_entries = upsert_entries(conn, id, &parsed.entries)?;
                Ok((new_entries, true))
            }
            Err(err) => {
                conn.execute(
                    "UPDATE feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = ?1 \
                     WHERE id = ?2",
                    params![err.to_string(), id],
                )?;
                Ok((Vec::new(), false))
            }
        },
        Err(err) => {
            conn.execute(
                "UPDATE feeds SET last_fetched_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), last_error = ?1 \
                 WHERE id = ?2",
                params![err.to_string(), id],
            )?;
            Ok((Vec::new(), false))
        }
    }
}

pub(crate) async fn refresh_feed_inner(
    app: &AppHandle,
    db: &Db,
    client: &reqwest::Client,
    id: i64,
) -> AppResult<(Feed, usize)> {
    let (url, etag, last_modified, notify_enabled, custom_title, title, source_type) = {
        let conn = db.0.lock().unwrap();
        conn.query_row(
            "SELECT url, etag, last_modified, notify_enabled, custom_title, title, source_type \
             FROM feeds WHERE id = ?1",
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, Option<String>>(1)?,
                    row.get::<_, Option<String>>(2)?,
                    row.get::<_, bool>(3)?,
                    row.get::<_, Option<String>>(4)?,
                    row.get::<_, Option<String>>(5)?,
                    row.get::<_, String>(6)?,
                ))
            },
        )?
    };
    let is_booth = source_type == "booth";

    // The network-bound part happens before the DB lock is taken, same as
    // the plain-RSS path always did -- only one of these two actually runs
    // a request, gated by `is_booth`.
    let booth_outcome = if is_booth {
        Some(booth::scrape_shop(app, &url).await)
    } else {
        None
    };
    let rss_outcome = if is_booth {
        None
    } else {
        Some(fetch_conditional(client, &url, etag.as_deref(), last_modified.as_deref()).await)
    };

    let (new_entries, favicon_site_url) = {
        let conn = db.0.lock().unwrap();
        let (new_entries, feed_content_changed) = match (booth_outcome, rss_outcome) {
            (Some(outcome), _) => apply_booth_outcome(&conn, id, outcome)?,
            (_, Some(outcome)) => apply_rss_outcome(&conn, id, &url, outcome)?,
            (None, None) => unreachable!("exactly one of booth_outcome/rss_outcome is always Some"),
        };

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

        // BOOTH feeds skip favicon discovery entirely: it's a plain reqwest
        // request, which Cloudflare would just block the same way it blocks
        // a bare feed fetch. A BOOTH shop's icon instead comes from the
        // scrape itself (see apply_booth_outcome), re-attempted on every
        // successful scrape until it succeeds.
        let favicon_site_url = if feed_content_changed && !is_booth {
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

#[cfg(test)]
mod tests {
    use super::*;

    fn host(url: &str) -> bool {
        is_booth_shop_host(&Url::parse(url).unwrap())
    }

    #[test]
    fn recognizes_a_shop_subdomain() {
        assert!(host("https://m-hayabusa.booth.pm/"));
    }

    #[test]
    fn rejects_the_bare_booth_domain() {
        assert!(!host("https://booth.pm/ja/items/12345"));
    }

    #[test]
    fn rejects_known_infrastructure_subdomains() {
        assert!(!host("https://www.booth.pm/"));
        assert!(!host("https://s.booth.pm/some/asset.png"));
        assert!(!host("https://accounts.booth.pm/users/sign_in"));
    }

    #[test]
    fn rejects_unrelated_hosts() {
        assert!(!host("https://example.com/"));
        assert!(!host("https://notbooth.pm/"));
    }
}
