//! BOOTH shop monitoring.
//!
//! BOOTH shop pages have no RSS/Atom feed, and a plain `reqwest` GET gets an
//! unsolvable Cloudflare "Just a moment..." 403 (confirmed while
//! prototyping this feature). This app's own WebView2-backed
//! `WebviewWindow` gets past that challenge, since it's a real Chromium
//! engine rather than a bare HTTP client -- so a shop page is scraped by
//! opening one (invisible to the user) and reading the DOM back out.
//!
//! IPC (`invoke` from inside that window) is deliberately not used to get
//! the extracted data back to Rust: enabling that would mean granting
//! `booth.pm` (a third-party, remote origin) the ability to call this app's
//! commands via `dangerousRemoteDomainIpcAccess`, which is a much bigger
//! trust grant than this single-site feature is worth. Instead, the
//! injected script writes its result into the URL fragment via
//! `history.replaceState` (same-document, no reload, no IPC, and far
//! roomier than `document.title`), and Rust polls `window.url()` for it.
//!
//! Produces the same shape (`BoothItem`, converted to `NewEntry` by the
//! caller) that `parse::feed::parse_feed` produces for RSS, so
//! `commands::feeds::refresh_feed_inner` can push either through the same
//! `upsert_entries`/notification pipeline without a new abstraction layer.

use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;

use serde::Deserialize;
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindowBuilder};
use tokio::sync::Semaphore;
use tokio::time::sleep;
use url::Url;

/// Caps how many hidden scrape windows can be open at once, independent of
/// `scheduler::MAX_CONCURRENT_FETCHES` (which governs plain RSS fetches).
/// Each scrape opens a real WebView2 instance -- much heavier than an HTTP
/// request -- and running several Cloudflare challenges at once is more
/// likely to get flagged, so this stays at 1 rather than sharing the RSS
/// cap.
pub struct BoothScrapeLimiter(pub Arc<Semaphore>);

impl Default for BoothScrapeLimiter {
    fn default() -> Self {
        Self(Arc::new(Semaphore::new(1)))
    }
}

const POLL_INTERVAL: Duration = Duration::from_millis(750);
/// ~25s total, generously over the ~8s Cloudflare took to resolve during
/// prototyping.
const MAX_TICKS: u32 = 34;
/// The extraction script won't conclude "0 items, structure mismatch" until
/// it's been re-run at least this many times against the same document
/// (~12s at `POLL_INTERVAL`) -- comfortably over the ~8s Cloudflare took
/// during prototyping, so an ordinary still-loading page (Cloudflare or
/// not) gets a real chance to finish before being called broken. See
/// `window.__boothTick` in `SCRIPT_TEMPLATE`.
const MIN_TICKS_BEFORE_GIVE_UP: u32 = 16;

const CLOUDFLARE_TITLE_MARKER: &str = "Just a moment";
const RESULT_PREFIX: &str = "BOOTHDATA:";
const ERROR_PREFIX: &str = "BOOTHERR:";
const RECIPE_FILENAME: &str = "booth_recipe.json";

static NEXT_LABEL_ID: AtomicU64 = AtomicU64::new(0);

#[derive(Debug, Clone)]
pub struct BoothItem {
    pub id: String,
    pub url: String,
    pub title: String,
    pub price_text: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Default)]
pub struct BoothScrapeResult {
    pub shop_title: Option<String>,
    pub shop_icon_url: Option<String>,
    pub items: Vec<BoothItem>,
}

#[derive(Debug, thiserror::Error)]
pub enum BoothScrapeError {
    #[error("Cloudflareの確認画面を通過できませんでした。しばらくしてからもう一度お試しください。")]
    CloudflareBlocked,
    #[error("ショップページの読み込みがタイムアウトしました。")]
    Timeout,
    #[error("ショップページの構造を読み取れませんでした（サイトの仕様変更の可能性があります。設定の保存先フォルダに booth_recipe.json を置くとセレクタを上書きできます）。")]
    StructureMismatch,
    #[error("ウィンドウの作成に失敗しました: {0}")]
    WindowCreation(String),
    #[error("抽出結果の解析に失敗しました: {0}")]
    InvalidPayload(String),
}

/// CSS selectors used by the extraction script. Field-by-field overridable
/// via `booth_recipe.json` in the data directory (see `load_recipe`) so a
/// BOOTH markup change can be worked around without a rebuild -- deliberately
/// just a flat set of strings for one site, not a general multi-site engine.
#[derive(Debug, Clone)]
struct Recipe {
    item_link_selector: String,
    card_selector: String,
    title_selector: String,
    price_selector: String,
    shop_root_selector: String,
    shop_icon_selector: String,
}

impl Default for Recipe {
    fn default() -> Self {
        Self {
            item_link_selector: "a[href*=\"/items/\"]".to_string(),
            card_selector: "[class*='item-card'], li, article".to_string(),
            title_selector: "[class*='item-card__title'], [class*='title']".to_string(),
            price_selector: "[class*='price']".to_string(),
            shop_root_selector: "#js-shop, [class*='item-shop'], [class*='shop-items'], main".to_string(),
            shop_icon_selector: "meta[property='og:image'], link[rel='icon']".to_string(),
        }
    }
}

#[derive(Debug, Default, Deserialize)]
#[serde(rename_all = "snake_case")]
struct RecipeOverride {
    item_link_selector: Option<String>,
    card_selector: Option<String>,
    title_selector: Option<String>,
    price_selector: Option<String>,
    shop_root_selector: Option<String>,
    shop_icon_selector: Option<String>,
}

fn load_recipe(app: &AppHandle) -> Recipe {
    let mut recipe = Recipe::default();
    let path = recipe_path(app);
    let Ok(text) = std::fs::read_to_string(&path) else {
        return recipe;
    };
    let Ok(over) = serde_json::from_str::<RecipeOverride>(&text) else {
        return recipe;
    };
    if let Some(v) = over.item_link_selector {
        recipe.item_link_selector = v;
    }
    if let Some(v) = over.card_selector {
        recipe.card_selector = v;
    }
    if let Some(v) = over.title_selector {
        recipe.title_selector = v;
    }
    if let Some(v) = over.price_selector {
        recipe.price_selector = v;
    }
    if let Some(v) = over.shop_root_selector {
        recipe.shop_root_selector = v;
    }
    if let Some(v) = over.shop_icon_selector {
        recipe.shop_icon_selector = v;
    }
    recipe
}

fn recipe_path(app: &AppHandle) -> PathBuf {
    PathBuf::from(crate::paths::resolve(app).path).join(RECIPE_FILENAME)
}

/// Placeholder-substitution template rather than `format!` -- the script
/// itself is full of literal `{`/`}`, which `format!` would need doubled
/// throughout, making it unreadable and easy to get wrong.
const SCRIPT_TEMPLATE: &str = r#"(function() {
  try {
    // Persists on `window` across repeated `.eval()` calls against the same
    // document (each tick re-runs this whole script), and is naturally
    // reset to undefined whenever Cloudflare's real navigation swaps in a
    // fresh document. Used below so a page that's simply still loading
    // (no Cloudflare involved at all) doesn't get misread as "broken" on
    // the very first tick, before its content has had a chance to render.
    window.__boothTick = (window.__boothTick || 0) + 1;
    if (document.title.indexOf(__CF_MARKER__) !== -1) return;
    var itemLinkSel = __ITEM_LINK_SEL__;
    var cardSel = __CARD_SEL__;
    var titleSel = __TITLE_SEL__;
    var priceSel = __PRICE_SEL__;
    var rootSel = __ROOT_SEL__;
    var iconSel = __ICON_SEL__;

    var links = Array.prototype.slice.call(document.querySelectorAll(itemLinkSel));
    var seen = {};
    var items = [];
    for (var i = 0; i < links.length; i++) {
      var a = links[i];
      var m = (a.href || '').match(/\/items\/(\d+)/);
      if (!m || seen[m[1]]) continue;
      seen[m[1]] = true;
      var card = a.closest(cardSel) || a;
      var titleEl = card.querySelector(titleSel);
      var priceEl = card.querySelector(priceSel);
      var imgEl = card.querySelector('img');
      items.push({
        id: m[1],
        url: a.href,
        title: (titleEl ? titleEl.textContent : (a.textContent || '')).trim(),
        price: priceEl ? priceEl.textContent.trim() : null,
        thumbnail: imgEl ? (imgEl.currentSrc || imgEl.src || null) : null
      });
    }
    var rootFound = !!document.querySelector(rootSel);
    // Nothing found yet -- rather than conclude "broken" immediately, give
    // the page a handful more ticks to finish loading/hydrating before
    // reporting a structure mismatch (see MIN_TICKS_BEFORE_GIVE_UP).
    if (items.length === 0 && !rootFound && window.__boothTick < __MIN_TICKS__) {
      return;
    }
    var iconEl = document.querySelector(iconSel);
    var shopIconUrl = iconEl
      ? (iconEl.getAttribute('content') || iconEl.href || iconEl.src || null)
      : null;
    var payload = JSON.stringify({
      items: items,
      root_found: rootFound,
      shop_title: document.title || null,
      shop_icon_url: shopIconUrl
    });
    history.replaceState(null, '', '#__RESULT_PREFIX__' + encodeURIComponent(payload));
  } catch (e) {
    history.replaceState(null, '', '#__ERROR_PREFIX__' + encodeURIComponent(String(e)));
  }
})();"#;

/// Every selector is embedded via `serde_json::to_string` (i.e. as a JSON
/// string literal, which is also valid as a JS string literal) rather than
/// hand-quoted, so a selector containing a quote or backslash can't break
/// out of the script.
fn build_extraction_script(recipe: &Recipe) -> String {
    let j = |s: &str| serde_json::to_string(s).expect("string always serializes");
    SCRIPT_TEMPLATE
        .replace("__CF_MARKER__", &j(CLOUDFLARE_TITLE_MARKER))
        .replace("__MIN_TICKS__", &MIN_TICKS_BEFORE_GIVE_UP.to_string())
        .replace("__ITEM_LINK_SEL__", &j(&recipe.item_link_selector))
        .replace("__CARD_SEL__", &j(&recipe.card_selector))
        .replace("__TITLE_SEL__", &j(&recipe.title_selector))
        .replace("__PRICE_SEL__", &j(&recipe.price_selector))
        .replace("__ROOT_SEL__", &j(&recipe.shop_root_selector))
        .replace("__ICON_SEL__", &j(&recipe.shop_icon_selector))
        .replace("__RESULT_PREFIX__", RESULT_PREFIX)
        .replace("__ERROR_PREFIX__", ERROR_PREFIX)
}

#[derive(Debug, Deserialize)]
struct RawPayload {
    items: Vec<RawItem>,
    root_found: bool,
    shop_title: Option<String>,
    shop_icon_url: Option<String>,
}

#[derive(Debug, Deserialize)]
struct RawItem {
    id: String,
    url: String,
    title: String,
    price: Option<String>,
    thumbnail: Option<String>,
}

/// `0 items AND no shop-root element found` is treated as "the page
/// structure doesn't match our selectors" rather than "an empty shop" --
/// deliberately not silently reporting a broken scrape as zero updates (see
/// `commands::feeds::refresh_feed_inner`, which surfaces this via
/// `feeds.last_error` the same way a parse failure does for RSS).
fn decode_payload(encoded: &str) -> Result<BoothScrapeResult, BoothScrapeError> {
    let decoded = percent_encoding::percent_decode_str(encoded)
        .decode_utf8()
        .map_err(|e| BoothScrapeError::InvalidPayload(e.to_string()))?;
    let raw: RawPayload = serde_json::from_str(&decoded)
        .map_err(|e| BoothScrapeError::InvalidPayload(e.to_string()))?;

    if raw.items.is_empty() && !raw.root_found {
        return Err(BoothScrapeError::StructureMismatch);
    }

    Ok(BoothScrapeResult {
        shop_title: raw.shop_title,
        shop_icon_url: raw.shop_icon_url,
        items: raw
            .items
            .into_iter()
            .map(|i| BoothItem {
                id: i.id,
                url: i.url,
                title: i.title,
                price_text: i.price,
                thumbnail_url: i.thumbnail,
            })
            .collect(),
    })
}

/// Opens a hidden `WebviewWindow` on the shop URL, waits out Cloudflare's
/// challenge, and returns the extracted product list.
///
/// Called from an async Tauri command (a tokio worker thread, not the main
/// thread) -- unlike the raw `tray-icon`/`muda` APIs used in `tray.rs`
/// (which require the calling thread to pump a Win32 message loop itself,
/// see that module's notes), Tauri's own `WebviewWindowBuilder` dispatches
/// the actual window/webview creation onto the main event-loop thread
/// internally, so it's safe to call from here.
pub async fn scrape_shop(app: &AppHandle, shop_url: &str) -> Result<BoothScrapeResult, BoothScrapeError> {
    let limiter = app.state::<BoothScrapeLimiter>();
    let _permit = limiter
        .0
        .clone()
        .acquire_owned()
        .await
        .map_err(|_| BoothScrapeError::WindowCreation("実行枠を確保できませんでした".to_string()))?;

    let url: Url = shop_url
        .parse()
        .map_err(|_| BoothScrapeError::WindowCreation("不正なURLです".to_string()))?;
    let recipe = load_recipe(app);
    let script = build_extraction_script(&recipe);

    let label = format!("booth-scrape-{}", NEXT_LABEL_ID.fetch_add(1, Ordering::Relaxed));
    let window = WebviewWindowBuilder::new(app, &label, WebviewUrl::External(url))
        // Built hidden and shown explicitly below, *after* the off-screen
        // position is set -- building with `.visible(true)` directly (the
        // first version of this) let the window briefly flash on-screen at
        // its default position before the `.position()` from the builder
        // took effect, visible to the user as a browser window popping open
        // and closing (real report). Still ends up genuinely visible (not
        // `.visible(false)` for good) by the time any page JS runs and
        // could check `document.visibilityState` -- the Cloudflare bypass
        // was only confirmed with a visible window, so that property is
        // preserved, just with the flash-causing race closed.
        .visible(false)
        .position(-32000.0, -32000.0)
        .inner_size(1024.0, 800.0)
        .decorations(false)
        .skip_taskbar(true)
        .build()
        .map_err(|e| BoothScrapeError::WindowCreation(e.to_string()))?;
    window
        .set_position(tauri::PhysicalPosition::new(-32000, -32000))
        .map_err(|e| BoothScrapeError::WindowCreation(e.to_string()))?;
    window.show().map_err(|e| BoothScrapeError::WindowCreation(e.to_string()))?;

    let outcome = poll_for_result(&window, &script).await;
    let _ = window.close();
    outcome
}

async fn poll_for_result(
    window: &tauri::WebviewWindow,
    script: &str,
) -> Result<BoothScrapeResult, BoothScrapeError> {
    let mut last_title = String::new();

    for _ in 0..MAX_TICKS {
        // Re-evaluated every tick rather than injected once: Cloudflare's
        // challenge resolves via a real navigation that replaces the whole
        // document, which would tear down any JS-side timer left running
        // from a previous tick. Each tick instead freshly inspects whatever
        // document currently exists.
        let _ = window.eval(script);
        sleep(POLL_INTERVAL).await;

        if let Ok(url) = window.url() {
            if let Some(fragment) = url.fragment() {
                if let Some(encoded) = fragment.strip_prefix(RESULT_PREFIX) {
                    return decode_payload(encoded);
                }
                if let Some(encoded) = fragment.strip_prefix(ERROR_PREFIX) {
                    let msg = percent_encoding::percent_decode_str(encoded)
                        .decode_utf8_lossy()
                        .into_owned();
                    return Err(BoothScrapeError::InvalidPayload(msg));
                }
            }
        }
        if let Ok(title) = window.title() {
            last_title = title;
        }
    }

    if last_title.contains(CLOUDFLARE_TITLE_MARKER) {
        Err(BoothScrapeError::CloudflareBlocked)
    } else {
        Err(BoothScrapeError::Timeout)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn encode(payload: &str) -> String {
        percent_encoding::utf8_percent_encode(payload, percent_encoding::NON_ALPHANUMERIC).to_string()
    }

    #[test]
    fn decodes_a_valid_payload() {
        let json = r#"{"items":[{"id":"123","url":"https://x.booth.pm/items/123","title":"Foo","price":"¥500","thumbnail":"https://x/img.png"}],"root_found":true,"shop_title":"My Shop","shop_icon_url":null}"#;
        let result = decode_payload(&encode(json)).unwrap();
        assert_eq!(result.shop_title.as_deref(), Some("My Shop"));
        assert_eq!(result.items.len(), 1);
        assert_eq!(result.items[0].id, "123");
        assert_eq!(result.items[0].price_text.as_deref(), Some("¥500"));
    }

    #[test]
    fn empty_items_with_root_found_is_a_legitimately_empty_shop() {
        let json = r#"{"items":[],"root_found":true,"shop_title":"Empty Shop","shop_icon_url":null}"#;
        let result = decode_payload(&encode(json)).unwrap();
        assert!(result.items.is_empty());
    }

    #[test]
    fn empty_items_without_root_found_is_a_structure_mismatch() {
        let json = r#"{"items":[],"root_found":false,"shop_title":"?","shop_icon_url":null}"#;
        let err = decode_payload(&encode(json)).unwrap_err();
        assert!(matches!(err, BoothScrapeError::StructureMismatch));
    }

    #[test]
    fn garbage_payload_is_invalid_payload_error() {
        let err = decode_payload(&encode("not json")).unwrap_err();
        assert!(matches!(err, BoothScrapeError::InvalidPayload(_)));
    }

    #[test]
    fn extraction_script_embeds_selectors_as_safe_json_string_literals() {
        let mut recipe = Recipe::default();
        recipe.title_selector = r#"weird"selector\with'quotes"#.to_string();
        let script = build_extraction_script(&recipe);
        // A selector containing a double-quote must not be able to
        // terminate the surrounding JS string literal early.
        assert!(script.contains(r#"var titleSel = "weird\"selector\\with'quotes""#));
    }

    /// Regression test: a placeholder added to `SCRIPT_TEMPLATE` without a
    /// matching `.replace()` call in `build_extraction_script` compiles fine
    /// (it's just a Rust string literal) but silently ships a JS
    /// `ReferenceError` at runtime, caught by the script's own `catch` and
    /// misreported as `InvalidPayload` -- exactly what happened with
    /// `__MIN_TICKS__` before this test existed.
    #[test]
    fn extraction_script_has_no_unreplaced_placeholders() {
        let script = build_extraction_script(&Recipe::default());
        // Deliberately not a generic "__" scan -- legitimate JS in the
        // template (e.g. `window.__boothTick`) contains that substring too.
        for placeholder in [
            "__CF_MARKER__",
            "__MIN_TICKS__",
            "__ITEM_LINK_SEL__",
            "__CARD_SEL__",
            "__TITLE_SEL__",
            "__PRICE_SEL__",
            "__ROOT_SEL__",
            "__ICON_SEL__",
            "__RESULT_PREFIX__",
            "__ERROR_PREFIX__",
        ] {
            assert!(!script.contains(placeholder), "unreplaced placeholder: {placeholder}");
        }
    }

    #[test]
    fn recipe_override_merges_partial_fields_onto_defaults() {
        let default_price_selector = Recipe::default().price_selector;
        let over = RecipeOverride {
            title_selector: Some(".custom-title".to_string()),
            ..Default::default()
        };
        let mut recipe = Recipe::default();
        if let Some(v) = over.title_selector {
            recipe.title_selector = v;
        }
        assert_eq!(recipe.title_selector, ".custom-title");
        assert_eq!(recipe.price_selector, default_price_selector);
    }
}
