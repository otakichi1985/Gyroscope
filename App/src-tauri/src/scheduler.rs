use std::sync::Arc;
use std::time::Duration;

use rusqlite::params;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Semaphore;

use crate::commands::feeds::refresh_feed_inner;
use crate::commands::settings::{READ_HISTORY_RETENTION_KEY, UNLIMITED};
use crate::db::{settings, Db};
use crate::error::AppResult;
use crate::fetch::HttpClient;

/// SPEC §2.2 default global refresh interval; a feed's own `interval_min`
/// overrides this. Both are plain consts for now -- the `settings` table
/// exists but is unused; a real global-default UI is Phase 5.
pub const DEFAULT_INTERVAL_MIN: i64 = 30;
/// SPEC §2.2 default concurrent-fetch cap.
const MAX_CONCURRENT_FETCHES: usize = 6;
/// How often the loop wakes up to check which feeds are due -- independent
/// of any individual feed's own interval, just the check granularity.
const TICK_INTERVAL: Duration = Duration::from_secs(60);
/// How long a deleted bookmark stays recoverable (commands::entries::
/// delete_entry/restore_entry) before being purged for good. Fixed, unlike
/// read-history retention above -- not exposed as a setting.
const BOOKMARK_TRASH_RETENTION_DAYS: i64 = 30;

/// Starts the one background task that periodically refreshes due feeds.
/// Called once from `.setup()`.
pub fn start(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(TICK_INTERVAL).await;
            let _ = tick(&app).await;
        }
    });
}

async fn tick(app: &AppHandle) -> AppResult<()> {
    let due_ids = due_feed_ids(&app.state::<Db>())?;
    refresh_many(app, due_ids).await?;
    cleanup_read_history(&app.state::<Db>())?;
    cleanup_deleted_entries(&app.state::<Db>())?;
    Ok(())
}

/// Hard-deletes bookmark-trash entries (commands::entries::delete_entry)
/// once they're past the fixed recovery window. Same "just run it every
/// tick, it's a no-op when nothing qualifies" approach as
/// cleanup_read_history -- no separate timer needed.
fn cleanup_deleted_entries(db: &Db) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "DELETE FROM entries WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?1)",
        params![format!("-{BOOKMARK_TRASH_RETENTION_DAYS} days")],
    )?;
    // Discover-saved bookmarks (commands::saved) ride the same trash window.
    conn.execute(
        "DELETE FROM saved_articles WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?1)",
        params![format!("-{BOOKMARK_TRASH_RETENTION_DAYS} days")],
    )?;
    Ok(())
}

/// Deletes `read_history` rows older than the user's configured retention
/// (see commands::settings::get/set_read_history_retention). No-op when the
/// setting is unset or "unlimited" (the default), or when nothing has
/// actually expired yet -- cheap enough to just run on every tick rather
/// than tracking a separate "last ran" timestamp.
fn cleanup_read_history(db: &Db) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    let Some(stored) = settings::get(&conn, READ_HISTORY_RETENTION_KEY)? else {
        return Ok(());
    };
    if stored == UNLIMITED {
        return Ok(());
    }
    let Ok(days) = stored.parse::<i64>() else {
        return Ok(());
    };
    conn.execute(
        "DELETE FROM read_history WHERE read_at < datetime('now', ?1)",
        params![format!("-{days} days")],
    )?;
    Ok(())
}

fn due_feed_ids(db: &Db) -> AppResult<Vec<i64>> {
    let conn = db.0.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT id FROM feeds WHERE last_fetched_at IS NULL \
            OR (strftime('%s', 'now') - strftime('%s', last_fetched_at)) \
                >= COALESCE(interval_min, ?1) * 60",
    )?;
    let ids: Result<Vec<i64>, _> = stmt.query_map(params![DEFAULT_INTERVAL_MIN], |r| r.get(0))?.collect();
    Ok(ids?)
}

/// Refreshes `ids` with a concurrency cap of `MAX_CONCURRENT_FETCHES`, then
/// emits a single "feeds-updated" event for the whole batch -- used by the
/// scheduler tick, `refresh_all_feeds`, and the tray's "更新" item, so none
/// of them cause one event per feed. Also emits "feeds-refresh-start" right
/// before starting (only when there's actually something to do), so the
/// frontend can show a background-activity indicator for the duration --
/// there was previously no signal at all for "a refresh is happening right
/// now" (user feedback). Returns the total new-entry count across the
/// batch, which `refresh_all_feeds` surfaces to the manual-refresh UI.
pub async fn refresh_many(app: &AppHandle, ids: Vec<i64>) -> AppResult<usize> {
    if ids.is_empty() {
        return Ok(0);
    }
    let _ = app.emit("feeds-refresh-start", ());
    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_FETCHES));
    let mut handles = Vec::with_capacity(ids.len());
    for id in ids {
        let app = app.clone();
        let semaphore = Arc::clone(&semaphore);
        handles.push(tauri::async_runtime::spawn(async move {
            let _permit = semaphore.acquire_owned().await;
            let db = app.state::<Db>();
            let client = app.state::<HttpClient>();
            // Failures are already stored on the feed row's last_error by
            // refresh_feed_inner (SPEC §7); nothing further to do here.
            match refresh_feed_inner(&app, &db, &client.0, id).await {
                Ok((_, new_count)) => new_count,
                Err(_) => 0,
            }
        }));
    }
    let mut total_new = 0usize;
    for handle in handles {
        if let Ok(new_count) = handle.await {
            total_new += new_count;
        }
    }
    let _ = app.emit("feeds-updated", ());
    Ok(total_new)
}
