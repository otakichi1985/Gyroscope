use std::sync::Arc;

use rusqlite::params;
use tauri::{AppHandle, Emitter, Manager};
use tokio::sync::Semaphore;

use crate::db::Db;
use crate::fetch::favicon;
use crate::fetch::HttpClient;

const MAX_CONCURRENT_FAVICON_FETCHES: usize = 6;

/// Fill missing RSS favicons once at startup without delaying window creation.
pub(crate) async fn backfill_favicons(app: &AppHandle) {
    let targets: Vec<(i64, String)> = {
        let db = app.state::<Db>();
        let conn = db.0.lock().unwrap();
        let Ok(mut stmt) = conn.prepare(
            "SELECT id, site_url FROM feeds \
             WHERE icon_path IS NULL AND site_url IS NOT NULL AND source_type != 'booth'",
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
