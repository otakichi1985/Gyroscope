use reqwest::Client;
use url::Url;

use crate::error::{AppError, AppResult};
use crate::fetch::client::{fetch_conditional, FetchOutcome};
use crate::fetch::discovery::DiscoveredFeed;
use crate::parse::feed::parse_feed;

/// YouTubeチャンネルURLを `videos.xml?channel_id=` へ解決する。
/// 通常のRSS発見経路とは分離し、このモジュール内に閉じる。
pub async fn resolve(client: &Client, input_url: &Url) -> AppResult<DiscoveredFeed> {
    if let Some(channel_id) = channel_id_from_feed_url(input_url) {
        return fetch_feed(client, &channel_id).await;
    }
    if let Some(channel_id) = channel_id_from_channel_path(input_url) {
        return fetch_feed(client, &channel_id).await;
    }

    let html = fetch_page_html(client, input_url.as_str()).await?;
    let channel_id = resolve_channel_id_from_html(&html).ok_or_else(|| {
        AppError::Other(
            "YouTubeチャンネルが見つかりませんでした。チャンネルトップ（/@handle または /channel/UC...）のURLをお試しください".to_string(),
        )
    })?;
    fetch_feed(client, &channel_id).await
}

pub fn is_youtube_url(url: &Url) -> bool {
    match url.host_str() {
        Some(host) => {
            let host = host.to_ascii_lowercase();
            host == "youtube.com"
                || host.ends_with(".youtube.com")
                || host == "youtu.be"
                || host == "youtube-nocookie.com"
                || host.ends_with(".youtube-nocookie.com")
        }
        None => false,
    }
}

pub fn feed_url_for_channel_id(channel_id: &str) -> String {
    format!("https://www.youtube.com/feeds/videos.xml?channel_id={channel_id}")
}

fn is_valid_channel_id(s: &str) -> bool {
    if s.len() != 24 || !s.starts_with("UC") {
        return false;
    }
    s.chars()
        .all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_')
}

fn channel_id_from_feed_url(url: &Url) -> Option<String> {
    if !url.path().ends_with("/feeds/videos.xml") {
        return None;
    }
    url.query_pairs()
        .find(|(k, _)| k == "channel_id")
        .map(|(_, v)| v.into_owned())
        .filter(|id| is_valid_channel_id(id))
}

fn channel_id_from_channel_path(url: &Url) -> Option<String> {
    let mut segments = url.path_segments()?;
    let first = segments.next()?;
    if first != "channel" {
        return None;
    }
    let id = segments.next()?;
    is_valid_channel_id(id).then(|| id.to_string())
}

fn fetch_page_html(client: &Client, url: &str) -> impl std::future::Future<Output = AppResult<String>> + Send {
    let client = client.clone();
    let url = url.to_string();
    async move {
        match fetch_conditional(&client, &url, None, None).await? {
            FetchOutcome::Fetched { body, .. } => Ok(String::from_utf8_lossy(&body).into_owned()),
            FetchOutcome::NotModified => Err(AppError::Other(
                "YouTubeチャンネルが見つかりませんでした。チャンネルトップ（/@handle または /channel/UC...）のURLをお試しください".to_string(),
            )),
        }
    }
}

async fn fetch_feed(client: &Client, channel_id: &str) -> AppResult<DiscoveredFeed> {
    let feed_url = feed_url_for_channel_id(channel_id);
    let (body, etag, last_modified) = match fetch_conditional(client, &feed_url, None, None).await? {
        FetchOutcome::Fetched {
            body,
            etag,
            last_modified,
        } => (body, etag, last_modified),
        FetchOutcome::NotModified => (Vec::new(), None, None),
    };
    parse_feed(&body, Some(&feed_url)).map_err(|_| {
        AppError::Other(
            "YouTubeチャンネルのRSSを取得できませんでした。時間をおいてお試しください".to_string(),
        )
    })?;
    Ok(DiscoveredFeed {
        feed_url,
        body,
        etag,
        last_modified,
    })
}

fn resolve_channel_id_from_html(html: &str) -> Option<String> {
    if let Some(id) = channel_id_from_canonical(html) {
        return Some(id);
    }
    if let Some(id) = channel_id_from_meta(html) {
        return Some(id);
    }
    channel_id_from_json_blob(html)
}

fn channel_id_from_canonical(html: &str) -> Option<String> {
    let document = scraper::Html::parse_document(html);
    let selector = scraper::Selector::parse(r#"link[rel="canonical"]"#).ok()?;
    let href = document
        .select(&selector)
        .find_map(|el| el.value().attr("href"))?;
    let url = Url::parse(href).ok()?;
    channel_id_from_channel_path(&url)
}

fn channel_id_from_meta(html: &str) -> Option<String> {
    let document = scraper::Html::parse_document(html);
    let selector = scraper::Selector::parse(r#"meta[itemprop="channelId"]"#).ok()?;
    let content = document
        .select(&selector)
        .find_map(|el| el.value().attr("content"))?;
    is_valid_channel_id(content).then(|| content.to_string())
}

/// `"channelId":"UC..."` 形式の埋め込みJSONと、文中の `/channel/UC...` を順に探す。
/// 正規表現クレートを増やさないため、素朴な文字列走査に留める。
fn channel_id_from_json_blob(html: &str) -> Option<String> {
    for key in [r#""channelId":""#, r#""channelId": ""#] {
        let mut rest = html;
        while let Some(pos) = rest.find(key) {
            let candidate = &rest[pos + key.len()..];
            let id: String = candidate.chars().take(24).collect();
            if is_valid_channel_id(&id) {
                return Some(id);
            }
            rest = &rest[pos + key.len()..];
        }
    }
    let mut rest = html;
    while let Some(pos) = rest.find("/channel/UC") {
        let candidate: String = rest[pos + "/channel/".len()..].chars().take(24).collect();
        if is_valid_channel_id(&candidate) {
            return Some(candidate);
        }
        rest = &rest[pos + 1..];
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    const CHANNEL_ID: &str = "UC_x5XG1OV2P6uZZ5FSM9Ttw";

    #[test]
    fn detects_youtube_hosts() {
        for raw in [
            "https://www.youtube.com/@example",
            "https://youtube.com/channel/UC_x5XG1OV2P6uZZ5FSM9Ttw",
            "https://m.youtube.com/watch?v=abc",
            "https://youtu.be/abc",
        ] {
            assert!(is_youtube_url(&Url::parse(raw).unwrap()), "{raw}");
        }
        assert!(!is_youtube_url(&Url::parse("https://example.com/").unwrap()));
    }

    #[test]
    fn takes_feed_url_directly() {
        let url = Url::parse(&feed_url_for_channel_id(CHANNEL_ID)).unwrap();
        assert_eq!(channel_id_from_feed_url(&url).as_deref(), Some(CHANNEL_ID));
    }

    #[test]
    fn takes_channel_path_directly() {
        let url = Url::parse(&format!("https://www.youtube.com/channel/{CHANNEL_ID}")).unwrap();
        assert_eq!(
            channel_id_from_channel_path(&url).as_deref(),
            Some(CHANNEL_ID)
        );
    }

    #[test]
    fn resolves_canonical_link() {
        let html = format!(
            r#"<html><head><link rel="canonical" href="https://www.youtube.com/channel/{CHANNEL_ID}"></head></html>"#
        );
        assert_eq!(
            resolve_channel_id_from_html(&html).as_deref(),
            Some(CHANNEL_ID)
        );
    }

    #[test]
    fn resolves_meta_channel_id() {
        let html = format!(r#"<html><head><meta itemprop="channelId" content="{CHANNEL_ID}"></head></html>"#);
        assert_eq!(
            resolve_channel_id_from_html(&html).as_deref(),
            Some(CHANNEL_ID)
        );
    }

    #[test]
    fn resolves_embedded_json_channel_id() {
        let html = format!(r#"{{"responseContext":{{"x":1}},"channelId":"{CHANNEL_ID}","rest":2}}"#);
        assert_eq!(
            resolve_channel_id_from_html(&html).as_deref(),
            Some(CHANNEL_ID)
        );
    }

    #[test]
    fn rejects_invalid_channel_ids() {
        assert!(!is_valid_channel_id("UCshort"));
        assert!(!is_valid_channel_id("XX_x5XG1OV2P6uZZ5FSM9Ttw"));
        assert!(is_valid_channel_id(CHANNEL_ID));
    }

    #[test]
    fn parses_youtube_atom_sample() {
        let sample = format!(
            r#"<?xml version="1.0" encoding="UTF-8"?>
            <feed xmlns:yt="http://www.youtube.com/xml/schemas/2015" xmlns:media="http://search.yahoo.com/mrss/" xmlns="http://www.w3.org/2005/Atom">
              <title>Example Channel</title>
              <link rel="alternate" href="https://www.youtube.com/channel/{CHANNEL_ID}"/>
              <entry>
                <id>yt:video:abc123</id>
                <yt:videoId>abc123</yt:videoId>
                <title>Hello video</title>
                <link rel="alternate" href="https://www.youtube.com/watch?v=abc123"/>
                <author><name>Example</name></author>
                <published>2026-09-01T00:00:00+00:00</published>
                <media:group>
                  <media:title>Hello video</media:title>
                  <media:thumbnail url="https://i.ytimg.com/vi/abc123/hqdefault.jpg" width="480" height="360"/>
                </media:group>
              </entry>
            </feed>"#
        );
        let parsed = parse_feed(sample.as_bytes(), Some(&feed_url_for_channel_id(CHANNEL_ID))).unwrap();
        assert_eq!(parsed.title.as_deref(), Some("Example Channel"));
        assert_eq!(parsed.entries.len(), 1);
        assert_eq!(
            parsed.entries[0].thumbnail_url.as_deref(),
            Some("https://i.ytimg.com/vi/abc123/hqdefault.jpg")
        );
    }
}
