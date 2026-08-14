use tauri::{AppHandle, Emitter, State};

use crate::db::Db;
use crate::db::models::Feed;
use crate::error::AppResult;
use crate::fetch::HttpClient;

/// IPC entry point for refreshing one feed. The network/DB engine remains in
/// `feeds` because the scheduler calls it directly without IPC.
#[tauri::command]
pub async fn refresh_feed(
    app: AppHandle,
    db: State<'_, Db>,
    client: State<'_, HttpClient>,
    id: i64,
) -> AppResult<Feed> {
    let (feed, _new_count) = super::feeds::refresh_feed_inner(&app, &db, &client.0, id).await?;
    let _ = app.emit("feeds-updated", ());
    Ok(feed)
}

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
