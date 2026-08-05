use chrono::{DateTime, Utc};
use feed_rs::parser::Builder;

use crate::db::models::NewEntry;
use crate::error::{AppError, AppResult};

use super::{dedupe, thumbnail};

pub struct ParsedFeed {
    pub title: Option<String>,
    pub site_url: Option<String>,
    pub entries: Vec<NewEntry>,
}

/// Parses raw feed bytes (RSS 2.0 / RSS 1.0 (RDF) / Atom / JSON Feed --
/// feed-rs handles all of these uniformly). `base_uri` should be the feed's
/// own URL, used to resolve any relative links inside it.
pub fn parse_feed(bytes: &[u8], base_uri: Option<&str>) -> AppResult<ParsedFeed> {
    // The default id generator synthesizes an id whenever a real
    // <guid>/<id> is missing, which would hide that fact from us. We want
    // our own guid -> link -> title+published fallback (see `dedupe`), so
    // we force it to leave `Entry::id` empty in that case instead.
    let parser = Builder::new()
        .base_uri(base_uri)
        .id_generator(|_links, _title, _uri| String::new())
        .build();

    let feed = parser
        .parse(bytes)
        .map_err(|e| AppError::FeedParse(e.to_string()))?;

    let title = feed.title.map(|t| t.content);
    let site_url = feed.links.first().map(|l| l.href.clone());
    let entries = feed.entries.into_iter().map(convert_entry).collect();

    Ok(ParsedFeed {
        title,
        site_url,
        entries,
    })
}

fn convert_entry(entry: feed_rs::model::Entry) -> NewEntry {
    let link = entry.links.first().map(|l| l.href.clone());
    let title = entry.title.as_ref().map(|t| t.content.clone());
    let summary = entry.summary.as_ref().map(|s| s.content.clone());
    let content_html = entry
        .content
        .as_ref()
        .and_then(|c| c.body.clone())
        .or_else(|| summary.clone());
    let author = entry.authors.first().map(|p| p.name.clone());
    let published: Option<DateTime<Utc>> = entry.published;
    let published_at = published.map(|p| p.to_rfc3339());

    let guid = if entry.id.trim().is_empty() {
        None
    } else {
        Some(entry.id.as_str())
    };
    let dedupe_key = dedupe::dedupe_key(guid, link.as_deref(), title.as_deref(), published);
    let thumbnail_url = thumbnail::extract(&entry, content_html.as_deref(), link.as_deref());

    NewEntry {
        guid: dedupe_key,
        title,
        link,
        author,
        summary,
        content_html,
        thumbnail_url,
        published_at,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SAMPLE_RSS: &str = r#"<?xml version="1.0"?>
    <rss version="2.0">
      <channel>
        <title>Example Feed</title>
        <link>https://example.com/</link>
        <item>
          <title>First post</title>
          <link>https://example.com/1</link>
          <guid>urn:uuid:1</guid>
          <description>Hello &lt;b&gt;world&lt;/b&gt;</description>
          <pubDate>Mon, 02 Jan 2026 03:04:05 GMT</pubDate>
        </item>
        <item>
          <title>No guid post</title>
          <link>https://example.com/2</link>
          <description>No guid here</description>
        </item>
      </channel>
    </rss>"#;

    #[test]
    fn parses_title_and_entries() {
        let parsed = parse_feed(SAMPLE_RSS.as_bytes(), None).unwrap();
        assert_eq!(parsed.title.as_deref(), Some("Example Feed"));
        assert_eq!(parsed.entries.len(), 2);
    }

    #[test]
    fn uses_guid_when_present() {
        let parsed = parse_feed(SAMPLE_RSS.as_bytes(), None).unwrap();
        assert_eq!(parsed.entries[0].guid, "urn:uuid:1");
    }

    #[test]
    fn falls_back_to_link_when_guid_missing() {
        let parsed = parse_feed(SAMPLE_RSS.as_bytes(), None).unwrap();
        assert_eq!(parsed.entries[1].guid, "https://example.com/2");
    }

    #[test]
    fn rejects_garbage_input() {
        let result = parse_feed(b"not a feed", None);
        assert!(result.is_err());
    }
}
