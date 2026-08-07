use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::db::{settings, Db};
use crate::error::{AppError, AppResult};
use crate::paths::{self, DataDirInfo};

pub(crate) const READ_HISTORY_RETENTION_KEY: &str = "read_history_retention_days";
pub(crate) const UNLIMITED: &str = "unlimited";

/// `None` means "keep forever". This is also the default when the setting
/// has never been touched: read_history had no auto-delete at all before
/// this feature existed, so defaulting to a finite duration would silently
/// purge pre-existing history the first time an upgraded build starts up
/// (see CLAUDE.md's "SPEC.mdからの意図的な差分" note).
#[tauri::command]
pub fn get_read_history_retention(db: State<'_, Db>) -> AppResult<Option<i64>> {
    let conn = db.0.lock().unwrap();
    let stored = settings::get(&conn, READ_HISTORY_RETENTION_KEY)?;
    Ok(match stored.as_deref() {
        None | Some(UNLIMITED) => None,
        Some(days) => days.parse::<i64>().ok(),
    })
}

#[tauri::command]
pub fn set_read_history_retention(db: State<'_, Db>, days: Option<i64>) -> AppResult<()> {
    let conn = db.0.lock().unwrap();
    let value = days.map(|d| d.to_string()).unwrap_or_else(|| UNLIMITED.to_string());
    settings::set(&conn, READ_HISTORY_RETENTION_KEY, &value)?;
    Ok(())
}

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
pub fn restart_app(app: AppHandle, db: State<'_, Db>) -> AppResult<()> {
    let exe = std::env::current_exe()
        .map_err(|e| AppError::Other(format!("実行ファイルを特定できませんでした: {e}")))?;
    std::process::Command::new(exe)
        .spawn()
        .map_err(|e| AppError::Other(format!("再起動に失敗しました: {e}")))?;
    // `app.exit()` skips Drop and can land mid-write on another thread (the
    // background scheduler writes to this same connection every tick) --
    // taking the lock first rules that out. See commands::update::apply_update
    // for the incident this mirrors.
    let _guard = db.0.lock().unwrap();
    app.exit(0);
    Ok(())
}
