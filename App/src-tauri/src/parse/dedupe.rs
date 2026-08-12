use chrono::{DateTime, Utc};

/// Effective dedup key stored in `entries.guid`, per SPEC §2.2:
/// guid -> link -> title+published fallback.
///
/// `guid` must already be `None` when the source feed had no real
/// `<guid>`/`<id>` element -- see `parse::feed`, which configures feed-rs's
/// id generator to leave `Entry::id` empty in that case instead of letting
/// the crate synthesize one, so this function (not feed-rs) owns the
/// fallback behaviour the spec asks for.
pub fn dedupe_key(
    guid: Option<&str>,
    link: Option<&str>,
    title: Option<&str>,
    published: Option<DateTime<Utc>>,
) -> String {
    if let Some(guid) = non_empty(guid) {
        return guid.to_string();
    }
    if let Some(link) = non_empty(link) {
        return link.to_string();
    }
    let title = non_empty(title).unwrap_or("");
    let published = published.map(|p| p.to_rfc3339()).unwrap_or_default();
    format!("title:{title}|published:{published}")
}

fn non_empty(value: Option<&str>) -> Option<&str> {
    value.map(str::trim).filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::TimeZone;

    #[test]
    fn prefers_guid() {
        let key = dedupe_key(Some("guid-1"), Some("https://example.com/a"), Some("A"), None);
        assert_eq!(key, "guid-1");
    }

    #[test]
    fn falls_back_to_link_when_guid_missing() {
        let key = dedupe_key(None, Some("https://example.com/a"), Some("A"), None);
        assert_eq!(key, "https://example.com/a");
    }

    #[test]
    fn falls_back_to_link_when_guid_blank() {
        let key = dedupe_key(Some("   "), Some("https://example.com/a"), Some("A"), None);
        assert_eq!(key, "https://example.com/a");
    }

    #[test]
    fn falls_back_to_title_and_published_when_guid_and_link_missing() {
        let published = Utc.with_ymd_and_hms(2026, 1, 2, 3, 4, 5).unwrap();
        let key = dedupe_key(None, None, Some("Hello"), Some(published));
        assert_eq!(key, "title:Hello|published:2026-01-02T03:04:05+00:00");
    }

    #[test]
    fn stable_even_with_nothing_at_all() {
        let key = dedupe_key(None, None, None, None);
        assert_eq!(key, "title:|published:");
    }
}
