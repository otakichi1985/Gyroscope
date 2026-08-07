//! Throwaway experiment -- not part of the shipped feature set.
//!
//! Question being answered: can a real Tauri webview window (backed by the
//! same WebView2/Chromium engine this app's own UI runs on) get past
//! BOOTH's Cloudflare JS challenge, where a plain `reqwest` GET cannot
//! (confirmed separately: a bare HTTP client gets an unsolvable "Just a
//! moment..." 403 every time)? If yes, this becomes the fetch mechanism
//! for BOOTH shop monitoring; if no, that feature needs a different plan
//! entirely. Delete this file once the question is answered either way.

use tauri::{AppHandle, WebviewUrl, WebviewWindowBuilder};

#[tauri::command]
pub async fn test_booth_fetch(app: AppHandle) -> Result<String, String> {
    let url = "https://m-hayabusa.booth.pm/"
        .parse()
        .map_err(|e| format!("invalid url: {e}"))?;

    // Visible (not hidden) for this test specifically, so it can be
    // watched happen -- the real feature would use `.visible(false)`.
    let window = WebviewWindowBuilder::new(&app, "booth-test", WebviewUrl::External(url))
        .visible(true)
        .inner_size(900.0, 700.0)
        .title("BOOTH test (temporary, safe to close)")
        .build()
        .map_err(|e| format!("failed to open test window: {e}"))?;

    // Cloudflare's challenge needs a few seconds to run its JS and redirect
    // to the real page.
    tokio::time::sleep(std::time::Duration::from_secs(8)).await;

    window
        .eval(
            r#"document.title = document.title.includes('Just a moment')
                ? 'CF_BLOCKED'
                : ('OK items=' + document.querySelectorAll('a[href*="/items/"]').length);"#,
        )
        .map_err(|e| format!("eval failed: {e}"))?;

    tokio::time::sleep(std::time::Duration::from_millis(500)).await;
    let result = window.title().map_err(|e| format!("failed to read result: {e}"))?;

    Ok(result)
}
