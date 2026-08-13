//! Search-result source for `commands::search::search_sources`.
//!
//! Started out as a DuckDuckGo scraper, but DuckDuckGo, SearXNG, and
//! Marginalia's own web UI all gate scraped/bot-like traffic behind a
//! CAPTCHA or a rate-limit wall (confirmed by hand against each while
//! building this) -- unlike `fetch::booth`'s Cloudflare challenge, an
//! image CAPTCHA has no automated way through, `WebviewWindow` included.
//! Hatena Bookmark's search RSS (`b.hatena.ne.jp/search/text`) sidesteps
//! that entirely: it's a plain, robots.txt-permitted RSS endpoint (no key,
//! no signup, no CAPTCHA), its results are already community-curated by
//! real bookmark counts rather than SEO ranking, and -- being a standard
//! feed -- `parse::feed::parse_feed` (already used for every subscribed
//! feed) parses it directly, no bespoke HTML parser needed.
//!
//! Trade-off: Japanese-web-centric results. Acceptable for this app's
//! primary audience; a second source could be added later if English-web
//! coverage turns out to matter.

use reqwest::Client;
use url::Url;

use crate::error::AppResult;
use crate::parse::feed::parse_feed;

const SEARCH_URL: &str = "https://b.hatena.ne.jp/search/text";

pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
}

pub async fn search(client: &Client, query: &str) -> AppResult<Vec<SearchHit>> {
    let mut url = Url::parse(SEARCH_URL).expect("SEARCH_URL is a valid URL");
    url.query_pairs_mut().append_pair("q", query).append_pair("mode", "rss");
    let response = client.get(url).send().await?;
    let body = response.bytes().await?;
    let parsed = parse_feed(&body, Some(SEARCH_URL))?;
    Ok(parsed.entries.into_iter().filter_map(entry_to_hit).collect())
}

fn entry_to_hit(entry: crate::db::models::NewEntry) -> Option<SearchHit> {
    let url = entry.link?;
    let title = entry.title.unwrap_or_default();
    if title.is_empty() {
        return None;
    }
    Some(SearchHit {
        title,
        url,
        snippet: entry.summary.unwrap_or_default(),
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // Trimmed to the fields parse_feed actually reads, but a genuine RSS
    // 1.0 (RDF) document as Hatena's search endpoint returns it -- verified
    // by hand against a live response while building this.
    const SAMPLE_RSS1: &str = r#"<?xml version="1.0" encoding="UTF-8"?>
    <rdf:RDF
     xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#"
     xmlns="http://purl.org/rss/1.0/"
     xmlns:dc="http://purl.org/dc/elements/1.1/">
    <channel rdf:about="https://b.hatena.ne.jp/q/rust">
    <title>rust</title>
    <link>https://b.hatena.ne.jp/q/rust</link>
    <items><rdf:Seq>
      <rdf:li rdf:resource="https://foo.hatenablog.com/entry/1" />
    </rdf:Seq></items>
    </channel>
    <item rdf:about="https://foo.hatenablog.com/entry/1">
    <title>Rustのエラー処理</title>
    <link>https://foo.hatenablog.com/entry/1</link>
    <description>エラー処理のパターンを整理した</description>
    <dc:date>2026-08-13T08:54:14Z</dc:date>
    </item>
    </rdf:RDF>"#;

    #[test]
    fn parses_rss1_search_results_into_hits() {
        let parsed = parse_feed(SAMPLE_RSS1.as_bytes(), Some(SEARCH_URL)).unwrap();
        let hits: Vec<SearchHit> = parsed.entries.into_iter().filter_map(entry_to_hit).collect();
        assert_eq!(hits.len(), 1);
        assert_eq!(hits[0].title, "Rustのエラー処理");
        assert_eq!(hits[0].url, "https://foo.hatenablog.com/entry/1");
        assert_eq!(hits[0].snippet, "エラー処理のパターンを整理した");
    }

    #[test]
    fn entry_without_a_link_is_dropped_not_panicking() {
        let hit = entry_to_hit(crate::db::models::NewEntry {
            guid: "g".to_string(),
            title: Some("no link".to_string()),
            link: None,
            author: None,
            summary: None,
            content_html: None,
            thumbnail_url: None,
            published_at: None,
        });
        assert!(hit.is_none());
    }
}
