//! Resolves where the SQLite database lives, and lets the user redirect it.
//!
//! Two independent axes:
//! - **Portable vs. installed**: detected via a `.portable` marker file
//!   placed next to the executable (see `npm run package:portable`, which
//!   creates it). This is opt-in and file-presence-based on purpose: every
//!   existing install (NSIS/MSI) and every `cargo build`/`npm run tauri dev`
//!   run has no marker, so the default data location (`app_data_dir`) is
//!   byte-for-byte unchanged unless someone deliberately builds/ships a
//!   portable package.
//! - **Custom override**: a user-chosen directory, settable from the
//!   Settings screen regardless of portable/installed. Persisted as a
//!   pointer file (just the chosen path as text) so it survives restarts.
//!   In portable mode the pointer file itself lives next to the exe, so a
//!   portable package with a custom path stays self-contained when moved.

use std::io;
use std::path::{Path, PathBuf};
use std::time::Duration;

use rusqlite::Connection;
use tauri::{AppHandle, Manager};

const PORTABLE_MARKER: &str = ".portable";
const OVERRIDE_POINTER_FILE: &str = "data-dir-override.txt";
pub const DB_FILENAME: &str = "rss-widget.sqlite3";

fn exe_dir() -> PathBuf {
    std::env::current_exe()
        .expect("failed to resolve current executable path")
        .parent()
        .expect("executable path has no parent directory")
        .to_path_buf()
}

pub fn is_portable() -> bool {
    exe_dir().join(PORTABLE_MARKER).is_file()
}

/// Where the override pointer file (and, in portable mode, the default
/// `data/` directory) lives.
fn config_dir(app: &AppHandle) -> PathBuf {
    if is_portable() {
        exe_dir()
    } else {
        app.path().app_config_dir().expect("no app config dir available")
    }
}

pub fn default_data_dir(app: &AppHandle) -> PathBuf {
    if is_portable() {
        exe_dir().join("data")
    } else {
        app.path().app_data_dir().expect("no app data dir available")
    }
}

fn override_pointer_path(app: &AppHandle) -> PathBuf {
    config_dir(app).join(OVERRIDE_POINTER_FILE)
}

fn read_override(app: &AppHandle) -> Option<PathBuf> {
    let text = std::fs::read_to_string(override_pointer_path(app)).ok()?;
    let trimmed = text.trim();
    (!trimmed.is_empty()).then(|| PathBuf::from(trimmed))
}

/// Writes (or, for `None`, clears) the persisted custom data directory.
/// Takes effect on next launch -- the open `rusqlite::Connection` isn't
/// relocated live, see `commands::settings::restart_app`.
pub fn set_override(app: &AppHandle, dir: Option<&Path>) -> io::Result<()> {
    let pointer = override_pointer_path(app);
    match dir {
        Some(d) => {
            if let Some(parent) = pointer.parent() {
                std::fs::create_dir_all(parent)?;
            }
            std::fs::write(pointer, d.display().to_string())
        }
        None if pointer.exists() => std::fs::remove_file(pointer),
        None => Ok(()),
    }
}

fn ensure_writable(dir: &Path) -> io::Result<()> {
    std::fs::create_dir_all(dir)?;
    let probe = dir.join(".write-test");
    std::fs::write(&probe, b"")?;
    std::fs::remove_file(&probe)
}

/// Info surfaced to the frontend (Settings screen). Mirrors this project's
/// existing convention of not swallowing errors (see `feeds.last_error`):
/// a custom directory that's become unusable (e.g. an unplugged external
/// drive) falls back to the default rather than crashing the app, and the
/// reason is reported back rather than silently discarded.
#[derive(Debug, Clone, serde::Serialize)]
pub struct DataDirInfo {
    pub path: String,
    pub is_portable: bool,
    pub is_custom: bool,
    pub default_path: String,
    pub fallback_reason: Option<String>,
}

pub fn resolve(app: &AppHandle) -> DataDirInfo {
    let portable = is_portable();
    let default_dir = default_data_dir(app);

    if let Some(custom) = read_override(app) {
        match ensure_writable(&custom) {
            Ok(()) => {
                return DataDirInfo {
                    path: custom.display().to_string(),
                    is_portable: portable,
                    is_custom: true,
                    default_path: default_dir.display().to_string(),
                    fallback_reason: None,
                };
            }
            Err(e) => {
                let _ = ensure_writable(&default_dir);
                return DataDirInfo {
                    path: default_dir.display().to_string(),
                    is_portable: portable,
                    is_custom: false,
                    default_path: default_dir.display().to_string(),
                    fallback_reason: Some(format!(
                        "設定された保存先「{}」を使用できなかったため、既定の場所に戻しました（{e}）",
                        custom.display()
                    )),
                };
            }
        }
    }

    DataDirInfo {
        path: default_dir.display().to_string(),
        is_portable: portable,
        is_custom: false,
        default_path: default_dir.display().to_string(),
        fallback_reason: None,
    }
}

/// Validates `new_dir` and, unless it already has a database of its own
/// (the user pointing at pre-existing data), copies the current live
/// database into it via SQLite's online backup API -- safe to run while
/// `conn` is open and potentially mid-write, unlike a raw file copy.
pub fn migrate_into(conn: &Connection, new_dir: &Path) -> Result<(), String> {
    ensure_writable(new_dir).map_err(|e| format!("指定したフォルダを使用できません: {e}"))?;

    let dest_db = new_dir.join(DB_FILENAME);
    if dest_db.exists() {
        return Ok(());
    }

    let mut dest = Connection::open(&dest_db).map_err(|e| format!("保存先データベースを作成できません: {e}"))?;
    let backup =
        rusqlite::backup::Backup::new(conn, &mut dest).map_err(|e| format!("データの移行に失敗しました: {e}"))?;
    backup
        .run_to_completion(5, Duration::from_millis(50), None)
        .map_err(|e| format!("データの移行に失敗しました: {e}"))
}
