//! Search-result source for `commands::search::search_sources` and
//! `commands::search::browse_category`.
//!
//! Started out as a DuckDuckGo scraper, but DuckDuckGo, SearXNG, and
//! Marginalia's own web UI all gate scraped/bot-like traffic behind a
//! CAPTCHA or a rate-limit wall (confirmed by hand against each while
//! building this) -- unlike `fetch::booth`'s Cloudflare challenge, an
//! image CAPTCHA has no automated way through, `WebviewWindow` included.
//! Hatena Bookmark's RSS endpoints (`b.hatena.ne.jp/search/text` for
//! keyword search, `b.hatena.ne.jp/hotentry/<category>.rss` for a
//! category's popular entries) sidestep that entirely: both are plain,
//! robots.txt-permitted RSS (no key, no signup, no CAPTCHA), their results
//! are already community-curated by real bookmark counts rather than SEO
//! ranking, and -- being standard feeds -- `parse::feed::parse_feed`
//! (already used for every subscribed feed) parses them directly, no
//! bespoke HTML parser needed.
//!
//! Trade-off: Japanese-web-centric results. Acceptable for this app's
//! primary audience; a second source could be added later if English-web
//! coverage turns out to matter.

use std::collections::HashMap;

use reqwest::Client;
use url::Url;

use crate::error::{AppError, AppResult};
use crate::parse::feed::parse_feed;

const SEARCH_URL: &str = "https://b.hatena.ne.jp/search/text";

/// Category slugs Hatena Bookmark's `/hotentry/<slug>.rss` accepts.
/// `browse_category` rejects anything outside this list -- the slug ends
/// up directly in a request URL path, and only known-good values from
/// Hatena's own category navigation should ever reach that, not arbitrary
/// frontend input.
// Labels match Hatena's own category titles exactly (verified by hand
// against each category's RSS `<title>`) rather than a shorter guess --
// "ゲーム" alone (an earlier version of this list) reads as game-only, but
// the slug's actual content is anime *and* game news mixed together, which
// looked like a bug ("why is manga showing up under Game?") until the real
// category name made it clear that's simply what the category is.
pub const CATEGORIES: &[(&str, &str)] = &[
    ("it", "テクノロジー"),
    ("game", "アニメ・ゲーム"),
    ("economics", "政治と経済"),
    ("life", "暮らし"),
    ("knowledge", "学び"),
    ("entertainment", "エンタメ"),
    ("fun", "おもしろ"),
    ("social", "世の中"),
];

pub struct SearchHit {
    pub title: String,
    pub url: String,
    pub snippet: String,
    pub published_at: Option<String>,
    pub thumbnail_url: Option<String>,
    /// How many Hatena users bookmarked this page -- the only popularity
    /// signal this search has, and the main lever for both quality (favor
    /// widely-bookmarked pages over one-off noise) and speed (drop
    /// low-signal hits before spending a feed-discovery request on them).
    /// `search::policy` turns this into score/reason, same as any other
    /// signal -- this module only extracts it.
    ///
    /// Not exposed by `feed_rs`'s generic `Entry` model (it only reads
    /// well-known RSS/Atom fields, not Hatena's `hatena:bookmarkcount` /
    /// `hatena:imageurl` extension elements), so both are pulled separately
    /// from the raw response body via `extract_item_meta` and merged in by
    /// URL. Tried `?sort=popular` first (documented on Hatena's own search
    /// page as the *default* sort) hoping the server would do this
    /// reordering for free -- confirmed by hand that `mode=rss` ignores
    /// `sort` entirely and always returns recency order, so it has to
    /// happen client-side.
    pub bookmark_count: u32,
}

pub async fn search(client: &Client, query: &str) -> AppResult<Vec<SearchHit>> {
    let mut url = Url::parse(SEARCH_URL).expect("SEARCH_URL is a valid URL");
    url.query_pairs_mut().append_pair("q", query).append_pair("mode", "rss");
    fetch_and_parse(client, url).await
}

/// `category` must be one of `CATEGORIES`' slugs -- checked here (not just
/// trusted from the caller) since it's interpolated into the request URL's
/// path.
pub async fn browse_category(client: &Client, category: &str) -> AppResult<Vec<SearchHit>> {
    if !CATEGORIES.iter().any(|(slug, _)| *slug == category) {
        return Err(AppError::Other(format!("不明なカテゴリです: {category}")));
    }
    let url = Url::parse(&format!("https://b.hatena.ne.jp/hotentry/{category}.rss"))
        .expect("category is a validated slug, always a valid URL segment");
    fetch_and_parse(client, url).await
}

async fn fetch_and_parse(client: &Client, url: Url) -> AppResult<Vec<SearchHit>> {
    let base = url.as_str().to_string();
    let response = client.get(url).send().await?;
    let body = response.bytes().await?;
    let meta = extract_item_meta(&String::from_utf8_lossy(&body));
    let parsed = parse_feed(&body, Some(&base))?;
    Ok(parsed.entries.into_iter().filter_map(|entry| entry_to_hit(entry, &meta)).collect())
}

#[derive(Default, Clone)]
struct ItemMeta {
    bookmark_count: u32,
    thumbnail_url: Option<String>,
}

fn entry_to_hit(entry: crate::db::models::NewEntry, meta: &HashMap<String, ItemMeta>) -> Option<SearchHit> {
    let url = entry.link?;
    let title = entry.title.unwrap_or_default();
    if title.is_empty() {
        return None;
    }
    let item_meta = meta.get(&url).cloned().unwrap_or_default();
    Some(SearchHit {
        title,
        url,
        snippet: entry.summary.unwrap_or_default(),
        published_at: entry.published_at,
        thumbnail_url: item_meta.thumbnail_url,
        bookmark_count: item_meta.bookmark_count,
    })
}

/// `feed_rs` drops Hatena's `<hatena:bookmarkcount>`/`<hatena:imageurl>`
/// extension elements (outside the RSS/Atom/RDF vocabulary it
/// understands), so this does its own minimal scan of the raw body rather
/// than pulling in a general XML parser for two fields. Deliberately
/// string-scanning, not a `Selector` query like
/// `fetch::discovery`/`fetch::booth` use for HTML: `scraper` parses as
/// HTML5, which doesn't reliably round-trip arbitrary namespaced-XML tag
/// names like `hatena:bookmarkcount`.
///
/// Keyed by the item's own URL (from `rdf:about`) rather than matched by
/// position -- robust to `feed_rs` ever reordering or dropping entries
/// relative to the raw document.
fn extract_item_meta(xml: &str) -> HashMap<String, ItemMeta> {
    let mut meta = HashMap::new();
    let mut rest = xml;
    while let Some(item_start) = rest.find("<item rdf:about=\"") {
        rest = &rest[item_start + "<item rdf:about=\"".len()..];
        let Some(url_end) = rest.find('"') else { break };
        let url = unescape_xml_entities(&rest[..url_end]);

        // Bounded to this item's own block (up to the next `<item ` or
        // end of document) so a field never leaks onto the wrong URL.
        let block_end = rest.find("<item rdf:about=\"").unwrap_or(rest.len());
        let block = &rest[..block_end];

        let bookmark_count = extract_tag(block, "hatena:bookmarkcount")
            .and_then(|v| v.trim().parse().ok())
            .unwrap_or(0);
        let thumbnail_url = extract_tag(block, "hatena:imageurl").map(|v| unescape_xml_entities(v.trim()));

        meta.insert(url, ItemMeta { bookmark_count, thumbnail_url });
    }
    meta
}

fn extract_tag<'a>(block: &'a str, tag: &str) -> Option<&'a str> {
    let open = format!("<{tag}>");
    let close = format!("</{tag}>");
    let tag_start = block.find(&open)?;
    let after_tag = &block[tag_start + open.len()..];
    let tag_end = after_tag.find(&close)?;
    Some(&after_tag[..tag_end])
}

/// Hatena's XML mixes named entities (`&amp;`) and numeric character
/// references (`&#x26;` / `&#38;`) for the same character depending on the
/// field -- observed by hand: `hatena:imageurl` values came back with
/// literal `&#x26;` where a query string needed `&`, which a plain
/// `&amp;`-only replace left broken (the string `&#x26;` unchanged in the
/// URL, not a real ampersand). Only `&` itself matters here (the one
/// character that would otherwise corrupt a URL's query string); other
/// entities are left as-is since nothing this module extracts needs them
/// decoded.
fn unescape_xml_entities(s: &str) -> String {
    s.replace("&amp;", "&").replace("&#x26;", "&").replace("&#X26;", "&").replace("&#38;", "&")
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
    <hatena:imageurl>https://example.com/thumb1.png</hatena:imageurl>
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
    fn parses_rss1_search_results_into_hits_with_bookmark_counts_and_thumbnails() {
        let parsed = parse_feed(SAMPLE_RSS1.as_bytes(), Some(SEARCH_URL)).unwrap();
        let meta = extract_item_meta(SAMPLE_RSS1);
        let hits: Vec<SearchHit> = parsed.entries.into_iter().filter_map(|e| entry_to_hit(e, &meta)).collect();
        assert_eq!(hits.len(), 3);
        assert_eq!(hits[0].title, "Rustのエラー処理");
        assert_eq!(hits[0].bookmark_count, 12);
        assert_eq!(hits[0].thumbnail_url.as_deref(), Some("https://example.com/thumb1.png"));
        assert_eq!(hits[1].bookmark_count, 3);
        assert_eq!(hits[1].thumbnail_url, None);
    }

    #[test]
    fn missing_fields_default_to_zero_and_none_not_leaking_from_a_neighbor() {
        let meta = extract_item_meta(SAMPLE_RSS1);
        let baz = meta.get("https://baz.example/entry/3").unwrap();
        assert_eq!(baz.bookmark_count, 0);
        assert_eq!(baz.thumbnail_url, None);
        let parsed = parse_feed(SAMPLE_RSS1.as_bytes(), Some(SEARCH_URL)).unwrap();
        let hits: Vec<SearchHit> = parsed.entries.into_iter().filter_map(|e| entry_to_hit(e, &meta)).collect();
        assert_eq!(hits[2].bookmark_count, 0);
        assert_eq!(hits[2].thumbnail_url, None);
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
        let meta = extract_item_meta(xml);
        let entry = meta.get("https://example.com/a?x=1&y=2").unwrap();
        assert_eq!(entry.bookmark_count, 42);
    }

    #[test]
    fn decodes_numeric_ampersand_entity_in_thumbnail_url() {
        // Observed by hand against a live response: hatena:imageurl values
        // come back with `&#x26;` where a query string needs a real `&`,
        // unlike bookmarkcount/rdf:about which use `&amp;`.
        let xml = r#"<item rdf:about="https://example.com/a">
        <hatena:imageurl>https://img.example/x.png?w=1200&#x26;h=630</hatena:imageurl>
        </item>"#;
        let meta = extract_item_meta(xml);
        let entry = meta.get("https://example.com/a").unwrap();
        assert_eq!(entry.thumbnail_url.as_deref(), Some("https://img.example/x.png?w=1200&h=630"));
    }

    #[tokio::test]
    async fn browse_category_rejects_an_unknown_slug() {
        // No network involved here -- validation happens before the
        // request is built.
        let client = Client::new();
        let result = browse_category(&client, "not-a-real-category").await;
        assert!(result.is_err());
    }
}
