use tauri::State;
use url::Url;

use crate::error::AppResult;
use crate::fetch::article::{extract_article, extract_article_image, ArticleFullText};
use crate::fetch::HttpClient;

use super::feed_source::validate_url;

#[tauri::command]
pub async fn fetch_article_full_text(
    client: State<'_, HttpClient>,
    url: String,
) -> AppResult<ArticleFullText> {
    let parsed: Url = validate_url(&url)?;
    extract_article(&client.0, &parsed).await
}

#[tauri::command]
pub async fn fetch_article_image(
    client: State<'_, HttpClient>,
    url: String,
) -> AppResult<Option<String>> {
    let parsed: Url = validate_url(&url)?;
    extract_article_image(&client.0, &parsed).await
}
