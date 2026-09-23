use std::path::PathBuf;

use tauri::{AppHandle, State};

use crate::db::{settings, Db};
use crate::error::{AppError, AppResult};
use crate::paths::{self, DataDirInfo};

pub(crate) const READ_HISTORY_RETENTION_KEY: &str = "read_history_retention_days";
pub(crate) const UNLIMITED: &str = "unlimited";

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
    let value = days
        .map(|d| d.to_string())
        .unwrap_or_else(|| UNLIMITED.to_string());
    settings::set(&conn, READ_HISTORY_RETENTION_KEY, &value)?;
    Ok(())
}

#[tauri::command]
pub fn get_data_dir_info(app: AppHandle) -> DataDirInfo {
    paths::resolve(&app)
}

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

#[tauri::command]
pub fn restart_app(app: AppHandle, db: State<'_, Db>) -> AppResult<()> {
    let exe = std::env::current_exe()
        .map_err(|e| AppError::Other(format!("実行ファイルを特定できませんでした: {e}")))?;
    std::process::Command::new(exe)
        .spawn()
        .map_err(|e| AppError::Other(format!("再起動に失敗しました: {e}")))?;
    let _guard = db.0.lock().unwrap();
    crate::diag::log(&app, "exit: restart_app");
    app.exit(0);
    Ok(())
}
