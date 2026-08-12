use reqwest::Client;
use url::Url;

use super::client::{fetch_conditional, FetchOutcome};

/// Best-effort site icon discovery, used as a thumbnail substitute for
/// articles that have none of their own (`feeds.icon_path` existed in the
/// schema from the start but was never populated -- see CLAUDE.md's known
/// pitfalls). Two-tier, same spirit as `fetch::discovery::find_feed_link`:
/// try the conventional `/favicon.ico` first (cheap, no HTML parse, works
/// for a large fraction of sites), then fall back to parsing the site's
/// `<head>` for a `<link rel="icon">`-family tag.
pub async fn discover_favicon(client: &Client, site_url: &str) -> Option<String> {
    let base = Url::parse(site_url).ok()?;
    let root = base.join("/").ok()?;

    if let Ok(favicon_url) = root.join("favicon.ico") {
        if resource_exists(client, favicon_url.as_str()).await {
            return Some(favicon_url.to_string());
        }
    }

    if let Some(html) = fetch_html(client, &base).await {
        if let Some(icon) = find_icon_link(&html, &base) {
            return Some(icon);
        }
    }

    // OPML files in the wild often put the feed URL in htmlUrl as well as
    // xmlUrl. Parsing that RSS document as HTML finds no <link rel=icon>,
    // so retry the origin homepage before giving up.
    if base != root {
        let html = fetch_html(client, &root).await?;
        return find_icon_link(&html, &root);
    }
    None
}

/// Prefer a cheap HEAD request, but retry with GET because many otherwise
/// valid sites reject HEAD with 403/405. `send()` leaves the body streaming,
/// so the successful probe does not need to buffer the icon into memory.
async fn resource_exists(client: &Client, url: &str) -> bool {
    if matches!(client.head(url).send().await, Ok(resp) if resp.status().is_success()) {
        return true;
    }
    matches!(client.get(url).send().await, Ok(resp) if resp.status().is_success())
}

async fn fetch_html(client: &Client, base: &Url) -> Option<Vec<u8>> {
    match fetch_conditional(client, base.as_str(), None, None).await {
        Ok(FetchOutcome::Fetched { body, .. }) => Some(body),
        _ => None,
    }
}

fn find_icon_link(html: &[u8], base: &Url) -> Option<String> {
    let html = String::from_utf8_lossy(html);
    let document = scraper::Html::parse_document(&html);
    let selector = scraper::Selector::parse("link[href][rel]").ok()?;

    document
        .select(&selector)
        .find(|el| {
            el.value().attr("rel").is_some_and(|rel| {
                rel.split_ascii_whitespace().any(|token| {
                    token.eq_ignore_ascii_case("icon")
                        || token.eq_ignore_ascii_case("apple-touch-icon")
                })
            })
        })
        .and_then(|el| el.value().attr("href"))
        .and_then(|href| base.join(href).ok())
        .map(|url| url.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_icon_link_and_resolves_relative_href() {
        let html = br#"<html><head>
            <link rel="icon" href="/static/favicon.png">
        </head></html>"#;
        let base = Url::parse("https://example.com/blog/").unwrap();
        let found = find_icon_link(html, &base).unwrap();
        assert_eq!(found, "https://example.com/static/favicon.png");
    }

    #[test]
    fn prefers_first_matching_rel_in_document_order() {
        let html = br#"<html><head>
            <link rel="shortcut icon" href="/old-favicon.ico">
            <link rel="icon" href="/favicon.svg">
        </head></html>"#;
        let base = Url::parse("https://example.com/").unwrap();
        let found = find_icon_link(html, &base).unwrap();
        assert_eq!(found, "https://example.com/old-favicon.ico");
    }

    #[test]
    fn returns_none_when_no_icon_link() {
        let html = b"<html><head></head></html>";
        let base = Url::parse("https://example.com/").unwrap();
        assert!(find_icon_link(html, &base).is_none());
    }

    #[test]
    fn resolves_absolute_href_as_is() {
        let html = br#"<link rel="icon" href="https://cdn.example.com/icon.png">"#;
        let base = Url::parse("https://example.com/").unwrap();
        let found = find_icon_link(html, &base).unwrap();
        assert_eq!(found, "https://cdn.example.com/icon.png");
    }

    #[test]
    fn accepts_case_insensitive_and_multi_token_rel() {
        let html = br#"<link rel="Shortcut ICON" href="/icon.png">"#;
        let base = Url::parse("https://example.com/feed.xml").unwrap();
        assert_eq!(
            find_icon_link(html, &base),
            Some("https://example.com/icon.png".to_string())
        );
    }
}
