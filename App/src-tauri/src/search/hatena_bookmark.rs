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

use std::collections::HashMap;

use reqwest::Client;
use url::Url;

use crate::error::AppResult;
use crate::parse::feed::parse_feed;

const SEARCH_URL: &str = "https://b.hatena.ne.jp/search/text";

pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
    /// How many Hatena users bookmarked this page -- the only popularity
    /// signal this search has, and the main lever for both quality (favor
    /// widely-bookmarked pages over one-off noise) and speed (drop
    /// low-signal hits before spending a feed-discovery request on them).
    /// `search::policy` turns this into score/reason, same as any other
    /// signal -- this module only extracts it.
    ///
    /// Not exposed by `feed_rs`'s generic `Entry` model (it only reads
    /// well-known RSS/Atom fields, not Hatena's `hatena:bookmarkcount`
    /// extension element), so it's pulled separately from the raw response
    /// body via `extract_bookmark_counts` and merged in by URL. Tried
    /// `?sort=popular` first (documented on Hatena's own search page as
    /// the *default* sort) hoping the server would do this reordering for
    /// free -- confirmed by hand that `mode=rss` ignores `sort` entirely
    /// and always returns recency order, so it has to happen client-side.
    pub bookmark_count: u32,
}

pub async fn search(client: &Client, query: &str) -> AppResult<Vec<SearchHit>> {
    let mut url = Url::parse(SEARCH_URL).expect("SEARCH_URL is a valid URL");
    url.query_pairs_mut().append_pair("q", query).append_pair("mode", "rss");
    let response = client.get(url).send().await?;
    let body = response.bytes().await?;
    let counts = extract_bookmark_counts(&String::from_utf8_lossy(&body));
    let parsed = parse_feed(&body, Some(SEARCH_URL))?;
    Ok(parsed
        .entries
        .into_iter()
        .filter_map(|entry| entry_to_hit(entry, &counts))
        .collect())
}

fn entry_to_hit(entry: crate::db::models::NewEntry, counts: &HashMap<String, u32>) -> Option<SearchHit> {
    let url = entry.link?;
    let title = entry.title.unwrap_or_default();
    if title.is_empty() {
        return None;
    }
    let bookmark_count = counts.get(&url).copied().unwrap_or(0);
    Some(SearchHit {
        title,
        url,
        snippet: entry.summary.unwrap_or_default(),
        bookmark_count,
    })
}

/// `feed_rs` drops Hatena's `<hatena:bookmarkcount>` extension element
/// (outside the RSS/Atom/RDF vocabulary it understands), so this does its
/// own minimal scan of the raw body rather than pulling in a general XML
/// parser for one field. Deliberately string-scanning, not a `Selector`
/// query like `fetch::discovery`/`fetch::booth` use for HTML: `scraper`
/// parses as HTML5, which doesn't reliably round-trip arbitrary
/// namespaced-XML tag names like `hatena:bookmarkcount`.
///
/// Keyed by the item's own URL (from `rdf:about`) rather than matched by
/// position -- robust to `feed_rs` ever reordering or dropping entries
/// relative to the raw document.
fn extract_bookmark_counts(xml: &str) -> HashMap<String, u32> {
    let mut counts = HashMap::new();
    let mut rest = xml;
    while let Some(item_start) = rest.find("<item rdf:about=\"") {
        rest = &rest[item_start + "<item rdf:about=\"".len()..];
        let Some(url_end) = rest.find('"') else { break };
        let url = rest[..url_end].replace("&amp;", "&");

        // Bounded to this item's own block (up to the next `<item ` or
        // end of document) so a count never leaks onto the wrong URL.
        let block_end = rest.find("<item rdf:about=\"").unwrap_or(rest.len());
        let block = &rest[..block_end];
        if let Some(tag_start) = block.find("<hatena:bookmarkcount>") {
            let after_tag = &block[tag_start + "<hatena:bookmarkcount>".len()..];
            if let Some(tag_end) = after_tag.find("</hatena:bookmarkcount>") {
                if let Ok(count) = after_tag[..tag_end].trim().parse() {
                    counts.insert(url, count);
                }
            }
        }
    }
    counts
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
    <hatena:bookmarkcount>12</hatena:bookmarkcount>
    </item>
    <item rdf:about="https://bar.example/entry/2">
    <title>別の記事</title>
    <link>https://bar.example/entry/2</link>
    <description>別の記事の要約</description>
    <dc:date>2026-08-12T08:54:14Z</dc:date>
    <hatena:bookmarkcount>3</hatena:bookmarkcount>
    </item>
    <item rdf:about="https://baz.example/entry/3">
    <title>ブックマーク数フィールドがない記事</title>
    <link>https://baz.example/entry/3</link>
    <description>要約</description>
    <dc:date>2026-08-11T08:54:14Z</dc:date>
    </item>
    </rdf:RDF>"#;

    #[test]
    fn parses_rss1_search_results_into_hits_with_bookmark_counts() {
        let parsed = parse_feed(SAMPLE_RSS1.as_bytes(), Some(SEARCH_URL)).unwrap();
        let counts = extract_bookmark_counts(SAMPLE_RSS1);
        let hits: Vec<SearchHit> = parsed
            .entries
            .into_iter()
            .filter_map(|e| entry_to_hit(e, &counts))
            .collect();
        assert_eq!(hits.len(), 3);
        assert_eq!(hits[0].title, "Rustのエラー処理");
        assert_eq!(hits[0].bookmark_count, 12);
        assert_eq!(hits[1].bookmark_count, 3);
    }

    #[test]
    fn missing_bookmarkcount_tag_defaults_to_zero_not_leaking_from_a_neighbor() {
        let counts = extract_bookmark_counts(SAMPLE_RSS1);
        assert_eq!(counts.get("https://baz.example/entry/3"), None);
        let parsed = parse_feed(SAMPLE_RSS1.as_bytes(), Some(SEARCH_URL)).unwrap();
        let hits: Vec<SearchHit> = parsed
            .entries
            .into_iter()
            .filter_map(|e| entry_to_hit(e, &counts))
            .collect();
        assert_eq!(hits[2].bookmark_count, 0);
    }

    #[test]
    fn entry_without_a_link_is_dropped_not_panicking() {
        let hit = entry_to_hit(
            crate::db::models::NewEntry {
                guid: "g".to_string(),
                title: Some("no link".to_string()),
                link: None,
                author: None,
                summary: None,
                content_html: None,
                thumbnail_url: None,
                published_at: None,
            },
            &HashMap::new(),
        );
        assert!(hit.is_none());
    }

    #[test]
    fn extracts_bookmark_count_and_decodes_ampersand_in_url() {
        let xml = r#"<item rdf:about="https://example.com/a?x=1&amp;y=2">
        <hatena:bookmarkcount>42</hatena:bookmarkcount>
        </item>"#;
        let counts = extract_bookmark_counts(xml);
        assert_eq!(counts.get("https://example.com/a?x=1&y=2"), Some(&42));
    }
}
