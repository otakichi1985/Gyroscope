//! Checks GitHub Releases for a newer portable build, downloads the bare
//! exe (not the full zip -- the zip's `data/` folder would clobber the
//! user's real data), and applies it via the same "spawn a new process,
//! exit this one" pattern `restart_app` (`commands::settings`) uses. One
//! level of rollback is kept: the exe being replaced is renamed aside
//! instead of deleted, so a bad build can be undone. This never touches
//! the SQLite database -- see `rollback_update` for what that does and
//! doesn't cover.

use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, State};

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::fetch::HttpClient;
use crate::paths;

const REPO_OWNER: &str = "otakichi1985";
const REPO_NAME: &str = "Gyroscope";
const UPDATE_ASSET_NAME: &str = "gyroscope.exe";
const BACKUP_META_FILENAME: &str = "update-backup.json";

/// The release found by the last successful `check_for_update`, if it was
/// newer than the running build. `download_update`/`apply_update` read
/// from here rather than re-parsing arguments from the frontend, so there
/// is exactly one place that decides what "the update" is.
#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<ReadyUpdate>>);

/// The version string lives in the `Available` status returned to the
/// frontend, not here -- this only needs to remember where to download
/// from.
#[derive(Clone)]
pub struct ReadyUpdate {
    asset_url: String,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UpdateStatus {
    /// Not a portable build -- exe_dir isn't necessarily writable, and
    /// installed (MSI/NSIS) builds have no distribution channel yet.
    Unsupported,
    UpToDate,
    // `rename_all` on the enum itself only renames variant tags, not the
    // fields of a struct-like variant -- those need their own attribute.
    #[serde(rename_all = "camelCase")]
    Available {
        version: String,
        notes: String,
        published_at: String,
    },
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResponse {
    pub current_version: String,
    pub status: UpdateStatus,
}

#[derive(Deserialize)]
struct GithubRelease {
    tag_name: String,
    #[serde(default)]
    body: Option<String>,
    published_at: String,
    assets: Vec<GithubAsset>,
}

#[derive(Deserialize)]
struct GithubAsset {
    name: String,
    browser_download_url: String,
}

#[derive(Serialize, Deserialize)]
struct BackupMeta {
    version: String,
}

fn current_version() -> String {
    env!("CARGO_PKG_VERSION").to_string()
}

fn exe_path() -> AppResult<PathBuf> {
    std::env::current_exe().map_err(|e| AppError::Other(format!("実行ファイルを特定できませんでした: {e}")))
}

/// Same directory, same stem, `.exe.update` instead of `.exe` -- a
/// download in progress or freshly finished, not yet swapped in.
fn staged_update_path(exe: &Path) -> PathBuf {
    exe.with_extension("exe.update")
}

/// The exe being replaced, kept for one level of rollback.
fn backup_exe_path(exe: &Path) -> PathBuf {
    exe.with_extension("exe.bak")
}

fn backup_meta_path(exe: &Path) -> PathBuf {
    exe.parent().expect("exe path has a parent directory").join(BACKUP_META_FILENAME)
}

fn write_backup_meta(exe: &Path, version: &str) -> AppResult<()> {
    let json = serde_json::to_string(&BackupMeta { version: version.to_string() })
        .map_err(|e| AppError::Other(e.to_string()))?;
    std::fs::write(backup_meta_path(exe), json)
        .map_err(|e| AppError::Other(format!("更新履歴の保存に失敗しました: {e}")))
}

/// No network call, no portable/token requirements -- always answerable,
/// so Settings can show "現在のバージョン" even before any check runs.
#[tauri::command]
pub fn get_app_version() -> String {
    current_version()
}

/// `None` if there is nothing to roll back to (either no update has ever
/// been applied, or a rollback already consumed the one backup slot).
#[tauri::command]
pub fn get_update_backup_info() -> AppResult<Option<String>> {
    let exe = exe_path()?;
    if !backup_exe_path(&exe).exists() {
        return Ok(None);
    }
    let version = std::fs::read_to_string(backup_meta_path(&exe))
        .ok()
        .and_then(|s| serde_json::from_str::<BackupMeta>(&s).ok())
        .map(|m| m.version);
    Ok(version)
}

#[tauri::command]
pub async fn check_for_update(
    http: State<'_, HttpClient>,
    pending: State<'_, PendingUpdate>,
) -> AppResult<UpdateCheckResponse> {
    let current = current_version();

    if !paths::is_portable() {
        return Ok(UpdateCheckResponse {
            current_version: current,
            status: UpdateStatus::Unsupported,
        });
    }

    // Public repo -- no auth needed. (This used to carry a fine-grained
    // PAT for a private repo, but GitHub's repository-picker UI for
    // editing/creating those tokens turned out to be unreliable in
    // practice -- see the community reports linked in CLAUDE.md's note on
    // this module -- so the repo was made public instead of chasing that
    // further.)
    let url = format!("https://api.github.com/repos/{REPO_OWNER}/{REPO_NAME}/releases/latest");
    let response = http
        .0
        .get(&url)
        .header(reqwest::header::ACCEPT, "application/vnd.github+json")
        .header("X-GitHub-Api-Version", "2022-11-28")
        .send()
        .await
        .map_err(AppError::Network)?;

    if !response.status().is_success() {
        return Err(AppError::Other(format!("更新の確認に失敗しました（HTTP {}）", response.status())));
    }
    let release: GithubRelease = response.json().await.map_err(AppError::Network)?;
    let latest_tag = release.tag_name.trim_start_matches('v').to_string();

    let latest = semver::Version::parse(&latest_tag)
        .map_err(|e| AppError::Other(format!("リリースのバージョン表記を解釈できませんでした: {e}")))?;
    let running = semver::Version::parse(&current)
        .map_err(|e| AppError::Other(format!("現在のバージョン表記を解釈できませんでした: {e}")))?;

    if latest <= running {
        *pending.0.lock().unwrap() = None;
        return Ok(UpdateCheckResponse {
            current_version: current,
            status: UpdateStatus::UpToDate,
        });
    }

    let asset = release
        .assets
        .iter()
        .find(|a| a.name == UPDATE_ASSET_NAME)
        .ok_or_else(|| AppError::Other("最新リリースに更新用の実行ファイルが添付されていません".to_string()))?;

    *pending.0.lock().unwrap() = Some(ReadyUpdate {
        asset_url: asset.browser_download_url.clone(),
    });

    Ok(UpdateCheckResponse {
        current_version: current,
        status: UpdateStatus::Available {
            version: latest_tag,
            notes: release.body.unwrap_or_default(),
            published_at: release.published_at,
        },
    })
}

/// Downloads the exe found by the last `check_for_update` to a staging
/// file next to the running exe. Does not touch the running exe itself --
/// that happens in `apply_update`, kept as a separate step so a failed
/// download never leaves the app in a half-updated state.
#[tauri::command]
pub async fn download_update(http: State<'_, HttpClient>, pending: State<'_, PendingUpdate>) -> AppResult<()> {
    let ready = pending
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| AppError::Other("先に更新の確認を行ってください".to_string()))?;

    // Public repo -- `browser_download_url` is a plain, unauthenticated
    // link straight to the asset bytes.
    let response = http.0.get(&ready.asset_url).send().await.map_err(AppError::Network)?;

    if !response.status().is_success() {
        return Err(AppError::Other(format!(
            "更新のダウンロードに失敗しました（HTTP {}）",
            response.status()
        )));
    }
    let bytes = response.bytes().await.map_err(AppError::Network)?;

    let exe = exe_path()?;
    std::fs::write(staged_update_path(&exe), &bytes)
        .map_err(|e| AppError::Other(format!("更新ファイルの保存に失敗しました: {e}")))?;
    Ok(())
}

/// Swaps the downloaded exe into place and relaunches. The exe being
/// replaced is renamed to `.exe.bak` rather than deleted -- Windows
/// allows renaming a running exe's file (the process keeps its open
/// handle regardless of the name), just not deleting or overwriting it in
/// place -- so this is the same trick `restart_app` relies on, one step
/// earlier.
#[tauri::command]
pub fn apply_update(app: AppHandle, db: State<'_, Db>, pending: State<'_, PendingUpdate>) -> AppResult<()> {
    if pending.0.lock().unwrap().is_none() {
        return Err(AppError::Other("先に更新の確認を行ってください".to_string()));
    }
    let version_before = current_version();

    let exe = exe_path()?;
    let staged = staged_update_path(&exe);
    if !staged.exists() {
        return Err(AppError::Other(
            "ダウンロード済みの更新が見つかりません。もう一度ダウンロードしてください".to_string(),
        ));
    }

    // Only one level of rollback is kept -- an older backup, if any, is
    // simply discarded. It's dormant (nothing has it open), so this is a
    // plain delete rather than the rename dance the active exe needs.
    let _ = std::fs::remove_file(backup_exe_path(&exe));

    std::fs::rename(&exe, backup_exe_path(&exe))
        .map_err(|e| AppError::Other(format!("現在の実行ファイルをどけられませんでした: {e}")))?;
    std::fs::rename(&staged, &exe).map_err(|e| AppError::Other(format!("更新の適用に失敗しました: {e}")))?;
    write_backup_meta(&exe, &version_before)?;

    *pending.0.lock().unwrap() = None;

    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| AppError::Other(format!("再起動に失敗しました: {e}")))?;
    // `app.exit()` skips Drop (so `Db`'s connection is never closed
    // cleanly) and can land at any instant relative to other threads --
    // in particular the background scheduler, which writes to this same
    // connection every tick. Taking the lock here first means this can
    // only happen once nothing else is mid-write (see CLAUDE.md's note on
    // the `database disk image is malformed` incident this mirrors).
    let _guard = db.0.lock().unwrap();
    crate::diag::log(&app, "exit: apply_update");
    app.exit(0);
    Ok(())
}

/// Undoes the one kept backup: swaps `.exe.bak` back into the active slot
/// and relaunches. Deliberately a single level, not a toggle -- after this
/// runs there is no backup left, so a second rollback needs a fresh update
/// applied first. Exe-only: any SQLite migration the newer build ran stays
/// applied, so a build old enough to predate that migration may not
/// understand the schema it finds. Not automated around here -- see
/// CLAUDE.md's note on this command for why a paired DB snapshot was
/// deliberately left out of scope.
#[tauri::command]
pub fn rollback_update(app: AppHandle, db: State<'_, Db>) -> AppResult<()> {
    let exe = exe_path()?;
    let bak = backup_exe_path(&exe);
    if !bak.exists() {
        return Err(AppError::Other("戻せる以前のバージョンがありません".to_string()));
    }

    let staged = staged_update_path(&exe);
    // Reuses the download staging slot to hold the version being stepped
    // away from. Safe to discard whatever's already there: a real
    // download and a rollback are both user-triggered from Settings one
    // at a time, never concurrently.
    let _ = std::fs::remove_file(&staged);

    std::fs::rename(&exe, &staged).map_err(|e| AppError::Other(format!("現在の実行ファイルをどけられませんでした: {e}")))?;
    std::fs::rename(&bak, &exe).map_err(|e| AppError::Other(format!("巻き戻しに失敗しました: {e}")))?;
    let _ = std::fs::remove_file(backup_meta_path(&exe));

    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| AppError::Other(format!("再起動に失敗しました: {e}")))?;
    // See apply_update's identical guard above for why.
    let _guard = db.0.lock().unwrap();
    crate::diag::log(&app, "exit: rollback_update");
    app.exit(0);
    Ok(())
}
