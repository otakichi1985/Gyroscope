use std::sync::Arc;
use std::time::Duration;

use rusqlite::params;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Semaphore;

use crate::commands::feeds::refresh_feed_inner;
use crate::db::Db;
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
    refresh_many(app, due_ids).await
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
/// of them cause one event per feed.
pub async fn refresh_many(app: &AppHandle, ids: Vec<i64>) -> AppResult<()> {
    if ids.is_empty() {
        return Ok(());
    }
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
            let _ = refresh_feed_inner(&app, &db, &client.0, id).await;
        }));
    }
    for handle in handles {
        let _ = handle.await;
    }
    let _ = app.emit("feeds-updated", ());
    Ok(())
}
