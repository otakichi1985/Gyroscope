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

pub const DEFAULT_INTERVAL_MIN: i64 = 30;
const MAX_CONCURRENT_FETCHES: usize = 6;
const TICK_INTERVAL: Duration = Duration::from_secs(60);
const BOOKMARK_TRASH_RETENTION_DAYS: i64 = 30;

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

fn cleanup_deleted_entries(db: &Db) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    conn.execute(
        "DELETE FROM entries WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?1)",
        params![format!("-{BOOKMARK_TRASH_RETENTION_DAYS} days")],
    )?;
    conn.execute(
        "DELETE FROM saved_articles WHERE deleted_at IS NOT NULL AND deleted_at < datetime('now', ?1)",
        params![format!("-{BOOKMARK_TRASH_RETENTION_DAYS} days")],
    )?;
    Ok(())
}

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
    let ids: Result<Vec<i64>, _> = stmt
        .query_map(params![DEFAULT_INTERVAL_MIN], |r| r.get(0))?
        .collect();
    Ok(ids?)
}

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
