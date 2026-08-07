use std::collections::BTreeMap;

use quick_xml::escape::escape;
use quick_xml::events::attributes::Attribute;
use quick_xml::events::{BytesEnd, BytesStart, Event};
use quick_xml::Reader;

use crate::db::models::Feed;
use crate::error::{AppError, AppResult};

pub struct OpmlFeed {
    pub title: Option<String>,
    pub xml_url: String,
    pub html_url: Option<String>,
    pub folder: Option<String>,
}

enum StackEntry {
    Folder(String),
    Other,
}

/// Parses an OPML document into a flat list of feeds with their (innermost)
/// folder, if any. Only one level of folder nesting is modeled -- our
/// `feeds.folder` column is a single string, not a hierarchy -- so nested
/// `<outline>` groups collapse to their innermost enclosing folder name.
pub fn parse_opml(xml: &str) -> AppResult<Vec<OpmlFeed>> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);

    let mut feeds = Vec::new();
    let mut stack: Vec<StackEntry> = Vec::new();
    let mut buf = Vec::new();

    loop {
        let event = reader
            .read_event_into(&mut buf)
            .map_err(|e| AppError::Other(format!("invalid OPML: {e}")))?;

        let decoder = reader.decoder();
        match event {
            Event::Eof => break,
            Event::Start(ref e) if is_outline(e) => {
                let attrs = read_attrs(e, decoder)?;
                if let Some(entry) = push_outline(&attrs, &stack, &mut feeds) {
                    stack.push(entry);
                } else {
                    stack.push(StackEntry::Other);
                }
            }
            Event::Empty(ref e) if is_outline(e) => {
                let attrs = read_attrs(e, decoder)?;
                push_outline(&attrs, &stack, &mut feeds);
            }
            Event::End(ref e) if is_outline_end(e) => {
                stack.pop();
            }
            _ => {}
        }
        buf.clear();
    }

    Ok(feeds)
}

/// If `attrs` describes a feed, records it and returns `None` (nothing to
/// push for a self-contained feed outline). If it describes a folder
/// grouping (no `xmlUrl`), returns the stack entry to push for its children.
fn push_outline(
    attrs: &BTreeMap<String, String>,
    stack: &[StackEntry],
    feeds: &mut Vec<OpmlFeed>,
) -> Option<StackEntry> {
    let current_folder = || {
        stack.iter().rev().find_map(|e| match e {
            StackEntry::Folder(name) => Some(name.clone()),
            StackEntry::Other => None,
        })
    };

    if let Some(xml_url) = attrs.get("xmlUrl").filter(|s| !s.is_empty()) {
        feeds.push(OpmlFeed {
            title: attrs.get("title").or_else(|| attrs.get("text")).cloned(),
            xml_url: xml_url.clone(),
            html_url: attrs.get("htmlUrl").cloned(),
            folder: current_folder(),
        });
        None
    } else {
        let name = attrs.get("text").or_else(|| attrs.get("title")).cloned();
        name.map(StackEntry::Folder)
    }
}

fn is_outline(e: &BytesStart) -> bool {
    e.local_name().as_ref() == b"outline"
}

fn is_outline_end(e: &BytesEnd) -> bool {
    e.local_name().as_ref() == b"outline"
}

fn read_attrs(e: &BytesStart, decoder: quick_xml::Decoder) -> AppResult<BTreeMap<String, String>> {
    let mut map = BTreeMap::new();
    for attr in e.attributes() {
        let attr: Attribute = attr.map_err(|e| AppError::Other(format!("invalid OPML attribute: {e}")))?;
        let key = String::from_utf8_lossy(attr.key.as_ref()).to_string();
        let value = attr
            .decoded_and_normalized_value(quick_xml::XmlVersion::Implicit1_0, decoder)
            .map_err(|e| AppError::Other(format!("invalid OPML attribute value: {e}")))?
            .to_string();
        map.insert(key, value);
    }
    Ok(map)
}

/// Builds an OPML 2.0 document from the current feed list, grouping by
/// folder (SPEC §2.1 export requirement).
pub fn build_opml(feeds: &[Feed]) -> String {
    let mut ungrouped = Vec::new();
    let mut grouped: BTreeMap<String, Vec<&Feed>> = BTreeMap::new();

    for feed in feeds {
        match feed.folder.as_deref().map(str::trim) {
            Some(folder) if !folder.is_empty() => {
                grouped.entry(folder.to_string()).or_default().push(feed);
            }
            _ => ungrouped.push(feed),
        }
    }

    let mut body = String::new();
    for feed in &ungrouped {
        body.push_str(&outline_line(feed, 4));
    }
    for (folder, feeds) in &grouped {
        body.push_str(&format!("    <outline text=\"{}\">\n", escape(folder.as_str())));
        for feed in feeds {
            body.push_str(&outline_line(feed, 6));
        }
        body.push_str("    </outline>\n");
    }

    format!(
        "<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n\
         <opml version=\"2.0\">\n  \
         <head><title>Gyroscope</title></head>\n  \
         <body>\n{body}  </body>\n\
         </opml>\n"
    )
}

fn outline_line(feed: &Feed, indent: usize) -> String {
    let title = feed
        .custom_title
        .as_deref()
        .or(feed.title.as_deref())
        .unwrap_or(feed.url.as_str());

    let mut line = format!(
        "{:indent$}<outline type=\"rss\" text=\"{}\" title=\"{}\" xmlUrl=\"{}\"",
        "",
        escape(title),
        escape(title),
        escape(feed.url.as_str()),
        indent = indent,
    );
    if let Some(site_url) = &feed.site_url {
        line.push_str(&format!(" htmlUrl=\"{}\"", escape(site_url.as_str())));
    }
    line.push_str("/>\n");
    line
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parses_flat_feeds() {
        let xml = r#"<opml version="2.0"><body>
            <outline type="rss" text="Example" xmlUrl="https://example.com/feed.xml" htmlUrl="https://example.com/"/>
        </body></opml>"#;
        let feeds = parse_opml(xml).unwrap();
        assert_eq!(feeds.len(), 1);
        assert_eq!(feeds[0].xml_url, "https://example.com/feed.xml");
        assert_eq!(feeds[0].title.as_deref(), Some("Example"));
        assert_eq!(feeds[0].folder, None);
    }

    #[test]
    fn parses_folder_grouped_feeds() {
        let xml = r#"<opml version="2.0"><body>
            <outline text="Tech">
                <outline type="rss" text="A" xmlUrl="https://a.example.com/feed.xml"/>
                <outline type="rss" text="B" xmlUrl="https://b.example.com/feed.xml"/>
            </outline>
            <outline type="rss" text="Standalone" xmlUrl="https://c.example.com/feed.xml"/>
        </body></opml>"#;
        let feeds = parse_opml(xml).unwrap();
        assert_eq!(feeds.len(), 3);
        assert_eq!(feeds[0].folder.as_deref(), Some("Tech"));
        assert_eq!(feeds[1].folder.as_deref(), Some("Tech"));
        assert_eq!(feeds[2].folder, None);
    }

    #[test]
    fn rejects_invalid_xml() {
        assert!(parse_opml("<opml><body></foo></body></opml>").is_err());
    }

    #[test]
    fn export_then_import_round_trips() {
        let feeds = vec![
            Feed {
                id: 1,
                url: "https://example.com/feed.xml".to_string(),
                site_url: Some("https://example.com/".to_string()),
                title: Some("Example & Co".to_string()),
                custom_title: None,
                icon_path: None,
                folder: Some("Tech News".to_string()),
                interval_min: None,
                notify_enabled: false,
                sort_order: 0,
                last_fetched_at: None,
                last_error: None,
                created_at: "2026-01-01T00:00:00Z".to_string(),
                tags: vec![],
                unread_count: 0,
            },
            Feed {
                id: 2,
                url: "https://other.example.com/feed.xml".to_string(),
                site_url: None,
                title: Some("Other".to_string()),
                custom_title: None,
                icon_path: None,
                folder: None,
                interval_min: None,
                notify_enabled: false,
                sort_order: 1,
                last_fetched_at: None,
                last_error: None,
                created_at: "2026-01-01T00:00:00Z".to_string(),
                tags: vec![],
                unread_count: 0,
            },
        ];

        let xml = build_opml(&feeds);
        let parsed = parse_opml(&xml).unwrap();

        assert_eq!(parsed.len(), 2);
        let example = parsed.iter().find(|f| f.xml_url == feeds[0].url).unwrap();
        assert_eq!(example.folder.as_deref(), Some("Tech News"));
        assert_eq!(example.title.as_deref(), Some("Example & Co"));

        let other = parsed.iter().find(|f| f.xml_url == feeds[1].url).unwrap();
        assert_eq!(other.folder, None);
    }
}
