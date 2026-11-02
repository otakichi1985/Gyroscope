use std::fs;
use std::path::PathBuf;

use tauri::AppHandle;

use crate::error::{AppError, AppResult};
use crate::paths;

/// ダイジェストはデータフォルダーの `digest` に置く。読むだけで、DB には触らない。
fn digest_dir(app: &AppHandle) -> PathBuf {
    PathBuf::from(paths::resolve(app).path).join("digest")
}

fn is_date(text: &str) -> bool {
    text.len() == 10 && text.bytes().all(|b| b.is_ascii_digit() || b == b'-')
}

#[tauri::command]
pub fn list_digests(app: AppHandle) -> AppResult<Vec<String>> {
    let dir = digest_dir(&app);
    let mut dates: Vec<String> = Vec::new();
    let Ok(entries) = fs::read_dir(&dir) else {
        return Ok(dates);
    };
    for entry in entries.flatten() {
        let name = entry.file_name().to_string_lossy().to_string();
        if let Some(stem) = name.strip_suffix(".json") {
            if is_date(stem) {
                dates.push(stem.to_string());
            }
        }
    }
    dates.sort();
    dates.reverse();
    Ok(dates)
}

#[tauri::command]
pub fn read_digest(app: AppHandle, date: String) -> AppResult<String> {
    if !is_date(&date) {
        return Err(AppError::Other("日付の形式が正しくありません".to_string()));
    }
    let path = digest_dir(&app).join(format!("{date}.json"));
    fs::read_to_string(&path)
        .map_err(|e| AppError::Other(format!("ダイジェストを読めません: {e}")))
}

/// 画面に「どこを開けばよいか」を出すためだけの情報。
#[tauri::command]
pub fn digest_dir_path(app: AppHandle) -> String {
    digest_dir(&app).display().to_string()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn date_accepts_dashed_iso_day() {
        assert!(is_date("2026-11-02"));
    }

    #[test]
    fn date_rejects_traversal_and_other_names() {
        assert!(!is_date("../secret"));
        assert!(!is_date("2026-11-02.json"));
        assert!(!is_date("2026-1-2"));
    }
}
