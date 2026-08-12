//! Dev-only exit-path logging.
//!
//! A `npm run tauri dev` build that vanishes with no terminal error and no
//! WER report is indistinguishable from a clean process exit to the OS
//! (observed: silent "crash" with zero evidence in the event log, crash
//! dumps and WER archives). To discriminate the possible paths -- the X
//! button with the tray-minimize setting off, the tray "終了" item, an
//! update apply/rollback, the data-dir restart, or an external kill -- every
//! such path appends one line to `<data dir>/dev-exit.log`.
//!
//! Reading it after a "disappearance":
//! - last line `startup` (and the window was actually showing): the process
//!   was taken down externally (OOM, taskkill, ...) or the dev file watcher
//!   restarted it -- nothing in the app chose to exit;
//! - last line `close_requested: not prevented`: the window closed while
//!   tray-minimize was OFF -> the default last-window exit ran;
//! - last line `close_requested: prevent_close (tray)`: it hid to the tray,
//!   not a crash at all;
//! - last line `exit: ...`: that specific command path ran.
//!
//! Deliberately a no-op in release builds (`#[cfg(debug_assertions)]`) so a
//! shipped exe never writes this file.

use tauri::AppHandle;

/// Appends `msg` to `<data dir>/dev-exit.log`. No-op outside `debug_assertions`.
pub fn log(app: &AppHandle, msg: &str) {
    #[cfg(debug_assertions)]
    {
        let path = crate::paths::effective_data_dir(app).join("dev-exit.log");
        let ts = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|d| d.as_secs())
            .unwrap_or(0);
        if let Ok(mut f) = std::fs::OpenOptions::new().create(true).append(true).open(path) {
            use std::io::Write;
            let _ = writeln!(f, "{ts} | {msg}");
        }
    }
    #[cfg(not(debug_assertions))]
    {
        let _ = (app, msg);
    }
}
