use feed_rs::model::Entry;
use url::Url;

/// Thumbnail priority per SPEC §2.3: `media:thumbnail` -> enclosure
/// (`media:content` with an image type) -> first `<img>` in the body HTML.
/// `og:image` is a deliberately separate, opt-in tier (it needs an extra
/// HTTP request per article) and isn't implemented here.
pub fn extract(
    entry: &Entry,
    content_html: Option<&str>,
    base_url: Option<&str>,
) -> Option<String> {
    for media in &entry.media {
        if let Some(thumb) = media.thumbnails.first() {
            let uri = thumb.image.uri.trim();
            if !uri.is_empty() {
                if let Some(url) = normalize_url(uri, base_url) {
                    return Some(url);
                }
            }
        }
    }

    for media in &entry.media {
        for content in &media.content {
            let is_image = content
                .content_type
                .as_ref()
                .is_some_and(|t| t.as_ref().starts_with("image/"));
            if is_image {
                if let Some(url) = &content.url {
                    if let Some(url) = normalize_url(url.as_str(), base_url) {
                        return Some(url);
                    }
                }
            }
        }
    }

    content_html
        .and_then(first_img_src)
        .and_then(|src| normalize_url(&src, base_url))
}

fn normalize_url(candidate: &str, base_url: Option<&str>) -> Option<String> {
    let parsed = Url::parse(candidate)
        .ok()
        .or_else(|| Url::parse(base_url?).ok()?.join(candidate).ok())?;
    matches!(parsed.scheme(), "http" | "https").then(|| parsed.to_string())
}

fn first_img_src(html: &str) -> Option<String> {
    let fragment = scraper::Html::parse_fragment(html);
    let selector = scraper::Selector::parse("img[src]").ok()?;
    fragment
        .select(&selector)
        .next()
        .and_then(|el| el.value().attr("src"))
        .map(|s| s.trim().to_string())
        .filter(|s| !s.is_empty())
}

#[cfg(test)]
mod tests {
    use super::*;
    use feed_rs::model::{Image, MediaContent, MediaObject, MediaThumbnail};
    use mediatype::MediaTypeBuf;
    use std::str::FromStr;

    fn entry_with_media(media: Vec<MediaObject>) -> Entry {
        Entry {
            media,
            ..Default::default()
        }
    }

    #[test]
    fn prefers_media_thumbnail() {
        let mut media = MediaObject::default();
        media.thumbnails.push(MediaThumbnail {
            image: Image {
                uri: "https://example.com/thumb.jpg".to_string(),
                title: None,
                link: None,
                width: None,
                height: None,
                description: None,
            },
            time: None,
        });
        media.content.push(MediaContent {
            url: Some(url::Url::parse("https://example.com/enclosure.jpg").unwrap()),
            content_type: Some(MediaTypeBuf::from_str("image/jpeg").unwrap()),
            height: None,
            width: None,
            duration: None,
            size: None,
            rating: None,
        });
        let entry = entry_with_media(vec![media]);

        let thumb = extract(
            &entry,
            Some("<p><img src=\"https://example.com/body.jpg\"></p>"),
            None,
        );
        assert_eq!(thumb, Some("https://example.com/thumb.jpg".to_string()));
    }

    #[test]
    fn falls_back_to_image_enclosure() {
        let mut media = MediaObject::default();
        media.content.push(MediaContent {
            url: Some(url::Url::parse("https://example.com/enclosure.jpg").unwrap()),
            content_type: Some(MediaTypeBuf::from_str("image/jpeg").unwrap()),
            height: None,
            width: None,
            duration: None,
            size: None,
            rating: None,
        });
        let entry = entry_with_media(vec![media]);

        let thumb = extract(
            &entry,
            Some("<p><img src=\"https://example.com/body.jpg\"></p>"),
            None,
        );
        assert_eq!(thumb, Some("https://example.com/enclosure.jpg".to_string()));
    }

    #[test]
    fn ignores_non_image_enclosure() {
        let mut media = MediaObject::default();
        media.content.push(MediaContent {
            url: Some(url::Url::parse("https://example.com/podcast.mp3").unwrap()),
            content_type: Some(MediaTypeBuf::from_str("audio/mpeg").unwrap()),
            height: None,
            width: None,
            duration: None,
            size: None,
            rating: None,
        });
        let entry = entry_with_media(vec![media]);

        let thumb = extract(
            &entry,
            Some("<p><img src=\"https://example.com/body.jpg\"></p>"),
            None,
        );
        assert_eq!(thumb, Some("https://example.com/body.jpg".to_string()));
    }

    #[test]
    fn falls_back_to_first_body_image() {
        let entry = entry_with_media(vec![]);
        let thumb = extract(
            &entry,
            Some("<p>text</p><img src=\"https://example.com/body.jpg\"><img src=\"https://example.com/second.jpg\">"),
            None,
        );
        assert_eq!(thumb, Some("https://example.com/body.jpg".to_string()));
    }

    #[test]
    fn none_when_nothing_found() {
        let entry = entry_with_media(vec![]);
        assert_eq!(extract(&entry, Some("<p>no images here</p>"), None), None);
        assert_eq!(extract(&entry, None, None), None);
    }

    #[test]
    fn resolves_relative_body_image_against_article_url() {
        let entry = entry_with_media(vec![]);
        assert_eq!(
            extract(
                &entry,
                Some("<img src=\"../images/thumb.jpg\">"),
                Some("https://example.com/posts/one/")
            ),
            Some("https://example.com/posts/images/thumb.jpg".to_string())
        );
    }

    #[test]
    fn rejects_non_web_image_schemes() {
        let entry = entry_with_media(vec![]);
        assert_eq!(
            extract(&entry, Some("<img src=\"javascript:alert(1)\">"), None),
            None
        );
    }
}
