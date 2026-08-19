use tauri::State;
use url::Url;

use crate::error::AppResult;
use crate::fetch::article::{extract_article, extract_article_image, ArticleFullText};
use crate::fetch::HttpClient;

use super::feed_source::validate_url;

/// Fetches the full text of an external article (its link URL) for the
/// reader's "全文を取得して読む" action -- used by feeds that only publish a
/// summary. Returns extracted HTML; the frontend still runs it through
/// DOMPurify before rendering.
#[tauri::command]
pub async fn fetch_article_full_text(
    client: State<'_, HttpClient>,
    url: String,
) -> AppResult<ArticleFullText> {
    let parsed: Url = validate_url(&url)?;
    extract_article(&client.0, &parsed).await
}

/// Best-effort thumbnail for an article whose feed didn't provide one: reads
/// the page's og:image / twitter:image / first real image. Returns `None`
/// (not an error) when the page has no usable image, so the UI falls back to
/// the favicon as it does today.
#[tauri::command]
pub async fn fetch_article_image(
    client: State<'_, HttpClient>,
    url: String,
) -> AppResult<Option<String>> {
    let parsed: Url = validate_url(&url)?;
    extract_article_image(&client.0, &parsed).await
}