use reqwest::Client;
use url::Url;

use crate::error::{AppError, AppResult};
use crate::parse::feed::parse_feed;

use super::client::{fetch_conditional, FetchOutcome};

pub struct DiscoveredFeed {
    pub feed_url: String,
    pub body: Vec<u8>,
    pub etag: Option<String>,
    pub last_modified: Option<String>,
}

/// Resolves a user-supplied URL to an actual feed. If it's already a feed,
/// uses it directly; otherwise treats the response as an HTML page and
/// follows `<link rel="alternate" type="application/{rss,atom}+xml">`
/// (SPEC §2.1).
pub async fn discover(client: &Client, input_url: &Url) -> AppResult<DiscoveredFeed> {
    let (body, etag, last_modified) = fetch_once(client, input_url.as_str()).await?;

    if parse_feed(&body, Some(input_url.as_str())).is_ok() {
        return Ok(DiscoveredFeed {
            feed_url: input_url.to_string(),
            body,
            etag,
            last_modified,
        });
    }

    let feed_link = find_feed_link(&body, input_url).ok_or(AppError::FeedNotFound)?;
    let (body, etag, last_modified) = fetch_once(client, feed_link.as_str()).await?;
    parse_feed(&body, Some(feed_link.as_str())).map_err(|_| AppError::FeedNotFound)?;

    Ok(DiscoveredFeed {
        feed_url: feed_link.to_string(),
        body,
        etag,
        last_modified,
    })
}

async fn fetch_once(
    client: &Client,
    url: &str,
) -> AppResult<(Vec<u8>, Option<String>, Option<String>)> {
    match fetch_conditional(client, url, None, None).await? {
        FetchOutcome::Fetched {
            body,
            etag,
            last_modified,
        } => Ok((body, etag, last_modified)),
        // A first request never sends conditional headers, so a server
        // returning 304 here would be non-compliant; treat it as empty.
        FetchOutcome::NotModified => Ok((Vec::new(), None, None)),
    }
}

fn find_feed_link(html: &[u8], base: &Url) -> Option<Url> {
    let html = String::from_utf8_lossy(html);
    let document = scraper::Html::parse_document(&html);
    let selector = scraper::Selector::parse(
        "link[rel=alternate][type='application/rss+xml'], \
         link[rel=alternate][type='application/atom+xml'], \
         link[rel=alternate][type='application/json']",
    )
    .ok()?;

    document
        .select(&selector)
        .find_map(|el| el.value().attr("href"))
        .and_then(|href| base.join(href).ok())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn finds_rss_alternate_link_and_resolves_relative_href() {
        let html = br#"<html><head>
            <link rel="alternate" type="application/rss+xml" href="/feed.xml">
        </head></html>"#;
        let base = Url::parse("https://example.com/blog/").unwrap();
        let found = find_feed_link(html, &base).unwrap();
        assert_eq!(found.as_str(), "https://example.com/feed.xml");
    }

    #[test]
    fn returns_none_when_no_alternate_link() {
        let html = b"<html><head></head></html>";
        let base = Url::parse("https://example.com/").unwrap();
        assert!(find_feed_link(html, &base).is_none());
    }
}
