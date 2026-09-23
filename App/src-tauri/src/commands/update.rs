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

#[derive(Default)]
pub struct PendingUpdate(pub Mutex<Option<ReadyUpdate>>);

#[derive(Clone)]
pub struct ReadyUpdate {
    asset_url: String,
}

#[derive(Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum UpdateStatus {
    Unsupported,
    UpToDate,
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
    std::env::current_exe()
        .map_err(|e| AppError::Other(format!("実行ファイルを特定できませんでした: {e}")))
}

fn staged_update_path(exe: &Path) -> PathBuf {
    exe.with_extension("exe.update")
}

fn backup_exe_path(exe: &Path) -> PathBuf {
    exe.with_extension("exe.bak")
}

fn backup_meta_path(exe: &Path) -> PathBuf {
    exe.parent()
        .expect("exe path has a parent directory")
        .join(BACKUP_META_FILENAME)
}

fn write_backup_meta(exe: &Path, version: &str) -> AppResult<()> {
    let json = serde_json::to_string(&BackupMeta {
        version: version.to_string(),
    })
    .map_err(|e| AppError::Other(e.to_string()))?;
    std::fs::write(backup_meta_path(exe), json)
        .map_err(|e| AppError::Other(format!("更新履歴の保存に失敗しました: {e}")))
}

#[tauri::command]
pub fn get_app_version() -> String {
    current_version()
}

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
        return Err(AppError::Other(format!(
            "更新の確認に失敗しました（HTTP {}）",
            response.status()
        )));
    }
    let release: GithubRelease = response.json().await.map_err(AppError::Network)?;
    let latest_tag = release.tag_name.trim_start_matches('v').to_string();

    let latest = semver::Version::parse(&latest_tag).map_err(|e| {
        AppError::Other(format!(
            "リリースのバージョン表記を解釈できませんでした: {e}"
        ))
    })?;
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
        .ok_or_else(|| {
            AppError::Other("最新リリースに更新用の実行ファイルが添付されていません".to_string())
        })?;

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

#[tauri::command]
pub async fn download_update(
    http: State<'_, HttpClient>,
    pending: State<'_, PendingUpdate>,
) -> AppResult<()> {
    let ready = pending
        .0
        .lock()
        .unwrap()
        .clone()
        .ok_or_else(|| AppError::Other("先に更新の確認を行ってください".to_string()))?;

    let response = http
        .0
        .get(&ready.asset_url)
        .send()
        .await
        .map_err(AppError::Network)?;

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

#[tauri::command]
pub fn apply_update(
    app: AppHandle,
    db: State<'_, Db>,
    pending: State<'_, PendingUpdate>,
) -> AppResult<()> {
    if pending.0.lock().unwrap().is_none() {
        return Err(AppError::Other(
            "先に更新の確認を行ってください".to_string(),
        ));
    }
    let version_before = current_version();

    let exe = exe_path()?;
    let staged = staged_update_path(&exe);
    if !staged.exists() {
        return Err(AppError::Other(
            "ダウンロード済みの更新が見つかりません。もう一度ダウンロードしてください".to_string(),
        ));
    }

    let _ = std::fs::remove_file(backup_exe_path(&exe));

    std::fs::rename(&exe, backup_exe_path(&exe))
        .map_err(|e| AppError::Other(format!("現在の実行ファイルをどけられませんでした: {e}")))?;
    std::fs::rename(&staged, &exe)
        .map_err(|e| AppError::Other(format!("更新の適用に失敗しました: {e}")))?;
    write_backup_meta(&exe, &version_before)?;

    *pending.0.lock().unwrap() = None;

    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| AppError::Other(format!("再起動に失敗しました: {e}")))?;
    let _guard = db.0.lock().unwrap();
    crate::diag::log(&app, "exit: apply_update");
    app.exit(0);
    Ok(())
}

#[tauri::command]
pub fn rollback_update(app: AppHandle, db: State<'_, Db>) -> AppResult<()> {
    let exe = exe_path()?;
    let bak = backup_exe_path(&exe);
    if !bak.exists() {
        return Err(AppError::Other(
            "戻せる以前のバージョンがありません".to_string(),
        ));
    }

    let staged = staged_update_path(&exe);
    let _ = std::fs::remove_file(&staged);

    std::fs::rename(&exe, &staged)
        .map_err(|e| AppError::Other(format!("現在の実行ファイルをどけられませんでした: {e}")))?;
    std::fs::rename(&bak, &exe)
        .map_err(|e| AppError::Other(format!("巻き戻しに失敗しました: {e}")))?;
    let _ = std::fs::remove_file(backup_meta_path(&exe));

    std::process::Command::new(&exe)
        .spawn()
        .map_err(|e| AppError::Other(format!("再起動に失敗しました: {e}")))?;
    let _guard = db.0.lock().unwrap();
    crate::diag::log(&app, "exit: rollback_update");
    app.exit(0);
    Ok(())
}
