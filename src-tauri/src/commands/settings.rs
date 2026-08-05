use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::paths::{self, DataDirInfo};

#[tauri::command]
pub fn get_data_dir_info(app: AppHandle) -> DataDirInfo {
    paths::resolve(&app)
}

/// Sets (or, for `path: None`, clears) the custom data directory. Copies
/// the current database into the new location if it doesn't already have
/// one of its own, then persists the override -- the caller is expected to
/// follow up with `restart_app` since the already-open `Db` connection
/// keeps pointing at the old location until relaunch.
#[tauri::command]
pub fn set_data_dir(app: AppHandle, db: State<'_, Db>, path: Option<String>) -> AppResult<()> {
    if let Some(p) = &path {
        let new_dir = PathBuf::from(p);
        let conn = db.0.lock().unwrap();
        paths::migrate_into(&conn, &new_dir).map_err(AppError::Other)?;
    }

    paths::set_override(&app, path.as_deref().map(std::path::Path::new))
        .map_err(|e| AppError::Other(format!("設定を保存できませんでした: {e}")))?;
    Ok(())
}

/// Relaunches the app as a new process and exits the current one --
/// needed after changing the data directory, since the open SQLite
/// connection (and everything built on top of it) is only ever resolved
/// once, at startup.
#[tauri::command]
pub fn restart_app(app: AppHandle) -> AppResult<()> {
    let exe = std::env::current_exe()
        .map_err(|e| AppError::Other(format!("実行ファイルを特定できませんでした: {e}")))?;
    std::process::Command::new(exe)
        .spawn()
        .map_err(|e| AppError::Other(format!("再起動に失敗しました: {e}")))?;
    app.exit(0);
    Ok(())
}
