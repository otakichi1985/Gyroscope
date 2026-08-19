//! Full-text extraction for articles whose RSS feed only carries a summary
//! (ReaderOverlay's "全文を取得して読む"). Fetches the article page, picks
//! the readable content node, strips navigation/chrome, resolves relative
//! URLs, and returns sanitizable HTML -- the frontend still runs DOMPurify
//! before rendering, same as it does for every other article body.
//!
//! Deliberately a pragmatic scorer rather than a full Readability port: the
//! common cases (a `<article>` / `.entry-content`-style container, or simply
//! the largest low-link-density text block) cover the feeds this app sees.
//! A botched extraction falls back to an error the UI shows next to the
//! existing "ブラウザで全文を読む" button, so a miss degrades to the old
//! behavior instead of showing garbage.

use ego_tree::NodeRef;
use reqwest::Client;
use scraper::{ElementRef, Html, Node, Selector};
use serde::Serialize;
use url::Url;

use crate::error::{AppError, AppResult};

use super::client::{fetch_conditional, FetchOutcome};

/// Full text of one article, ready for the reader pane.
#[derive(Debug, Clone, Serialize)]
pub struct ArticleFullText {
    pub html: String,
}

/// Below this many plain-text characters a candidate container is treated
/// as chrome rather than content (matches the summary-only heuristic the
/// reader already uses).
const MIN_CONTENT_CHARS: usize = 400;

/// Ratio of anchor text to total text above which a container is treated as
/// a link farm / nav menu, which the largest-text fallback must not mistake
/// for an article body.
const MAX_LINK_DENSITY: f32 = 0.5;

/// Content containers tried in order; the first one with enough text wins.
/// The list is deliberately short and generic -- site-specific classes live
/// in the fallback (largest text block) rather than growing this forever.
const CONTENT_SELECTORS: &[&str] = &[
    "article",
    "[role='main']",
    "main",
    ".entry-content",
    ".article-body",
    ".post-content",
    ".article-content",
    ".content-body",
    ".entry",
    ".body",
    "#main",
    "#content",
];

const VOID_TAGS: &[&str] = &[
    "area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param",
    "source", "track", "wbr",
];

const NOISE_TAGS: &[&str] = &[
    "script", "style", "nav", "aside", "header", "footer", "form", "button",
    "noscript", "svg", "template", "input", "select", "textarea",
];

/// `iframe` is deliberately NOT in NOISE_TAGS: video embeds (YouTube/Vimeo/...)
/// are real article content, so they're filtered individually in
/// `serialize_clean` (kept when they point at a known player, dropped
/// otherwise) rather than blanket-removed like the other chrome tags.
const VIDEO_EMBED_HOSTS: &[&str] = &[
    "youtube.com", "youtube-nocookie.com", "youtu.be",
    "player.vimeo.com", "vimeo.com",
    "dailymotion.com", "dmcdn.net",
    "player.bilibili.com", "bilibili.com",
    "embed.nicovideo.jp", "nicovideo.jp",
    "drive.google.com",
    "open.spotify.com", "soundcloud.com",
];

/// Attributes many lazy-image libraries use for the real URL while `src`
/// holds a transparent placeholder. When `src` is unusable the extractor
/// falls back to the first of these that carries a real URL, so below-the-
/// fold images stop silently vanishing (reported: only the hero image came
/// through).
const LAZY_SRC_ATTRS: &[&str] = &[
    "data-src", "data-original", "data-lazy-src", "data-url",
    "data-original-src", "data-srcset", "data-echo", "data-image",
];

const NOISE_CLASS_MARKERS: &[&str] = &[
    // ads & promos
    "advert", "sponsored", "affiliate", "promo", "banner",
    // social / share icons & buttons (SNS埋め込み・アイコン)
    "share", "social", "sns", "hatena", "bookmark-button", "bookmark-btn",
    "twitter", "facebook", "line-", "follow",
    // embeds of other services (note等)
    "note-embed", "note-card",
    // related / recommended / next-prev (関連記事)
    "related", "recommend", "entry-related", "p-related", "next-post",
    "prev-post", "pager",
    // generic chrome
    "sidebar", "breadcrumb", "pagination", "comment", "menu", "widget",
];

const NOISE_ID_MARKERS: &[&str] = &[
    "advert", "sidebar", "breadcrumb", "pagination", "comments", "footer", "header", "nav",
    "related", "recommend", "share", "social", "sns", "hatena",
];

pub async fn extract_article(client: &Client, url: &Url) -> AppResult<ArticleFullText> {
    let (body, _, _) = match fetch_conditional(client, url.as_str(), None, None).await? {
        FetchOutcome::Fetched { body, etag, last_modified } => (body, etag, last_modified),
        FetchOutcome::NotModified => {
            return Err(AppError::Other("記事ページを取得できませんでした".to_string()))
        }
    };
    let document = Html::parse_document(&String::from_utf8_lossy(&body));

    // JS-heavy / non-semantic pages often ship the full text in a
    // `<script type="application/ld+json">` `articleBody` (for SEO) even when
    // the DOM heuristics below can't find a container -- try that before
    // giving up. The frontend runs DOMPurify on whatever we return, so a
    // publisher that embeds real HTML there is still sanitized.
    if let Some(text) = extract_json_ld_article_body(&document) {
        let html = json_ld_to_html(&text);
        if !html.trim().is_empty() {
            return Ok(ArticleFullText { html });
        }
    }

    let Some(content) = find_content(&document) else {
        return Err(AppError::Other("記事本文を抽出できませんでした。ブラウザで開いてください".to_string()));
    };
    let inner: String = content
        .children()
        .map(|child| serialize_clean(child, url))
        .collect();
    if inner.trim().is_empty() {
        return Err(AppError::Other("記事本文を抽出できませんでした。ブラウザで開いてください".to_string()));
    }
    Ok(ArticleFullText { html: inner })
}

/// Recursively collects every `articleBody` string found in a parsed JSON-LD
/// document (handles the single-object, `@graph`, and array shapes publishers
/// use). Callers pick the longest one, since pages sometimes carry a short
/// teaser articleBody alongside the real body.
fn collect_article_bodies(value: &serde_json::Value, out: &mut Vec<String>) {
    match value {
        serde_json::Value::Object(map) => {
            if let Some(text) = map.get("articleBody").and_then(serde_json::Value::as_str) {
                let text = text.trim();
                if !text.is_empty() {
                    out.push(text.to_string());
                }
            }
            for child in map.values() {
                collect_article_bodies(child, out);
            }
        }
        serde_json::Value::Array(items) => {
            for child in items {
                collect_article_bodies(child, out);
            }
        }
        _ => {}
    }
}

fn extract_json_ld_article_body(document: &Html) -> Option<String> {
    let Ok(selector) = Selector::parse("script[type='application/ld+json']") else {
        return None;
    };
    let mut candidates: Vec<String> = Vec::new();
    for element in document.select(&selector) {
        let raw: String = element.text().collect();
        if let Ok(value) = serde_json::from_str::<serde_json::Value>(&raw) {
            collect_article_bodies(&value, &mut candidates);
        }
    }
    candidates.into_iter().max_by_key(|s| s.chars().count())
}

fn escape_html(text: &str) -> String {
    text.replace('&', "&amp;")
        .replace('<', "&lt;")
        .replace('>', "&gt;")
        .replace('"', "&quot;")
}

/// Turns a JSON-LD `articleBody` into displayable HTML. Publishers that embed
/// real HTML there get it passed through unchanged (DOMPurify cleans it on the
/// frontend); plain-text bodies get each newline-separated paragraph wrapped
/// in `<p>`.
fn json_ld_to_html(text: &str) -> String {
    if text.contains("<p") || text.contains("<br") || text.contains("<div") || text.contains("<li") {
        text.to_string()
    } else {
        text.split('\n')
            .map(str::trim)
            .filter(|s| !s.is_empty())
            .map(|paragraph| format!("<p>{}</p>", escape_html(paragraph)))
            .collect()
    }
}

/// Pulls the article's thumbnail from its page metadata -- `og:image` first,
/// then `twitter:image`, then `link[rel=image_src]`, then the first real
/// `<img>` in the document. Used to give entries a thumbnail even when their
/// feed didn't provide one (previously those rows fell back to the favicon
/// or an image-off placeholder).
pub async fn extract_article_image(client: &Client, url: &Url) -> AppResult<Option<String>> {
    let body = match fetch_conditional(client, url.as_str(), None, None).await? {
        FetchOutcome::Fetched { body, .. } => body,
        FetchOutcome::NotModified => return Ok(None),
    };
    let document = Html::parse_document(&String::from_utf8_lossy(&body));

    // Explicit metadata, in preference order.
    let meta_selectors = [
        "meta[property='og:image']",
        "meta[name='twitter:image']",
        "meta[property='twitter:image']",
        "link[rel='image_src']",
    ];
    for sel in meta_selectors {
        let Ok(selector) = Selector::parse(sel) else { continue };
        for element in document.select(&selector) {
            let raw = element
                .value()
                .attr("content")
                .or_else(|| element.value().attr("href"))
                .map(str::trim)
                .unwrap_or("");
            if !raw.is_empty() && !is_lazy_placeholder(raw) {
                let resolved = resolve_url(url, raw);
                if !resolved.is_empty() {
                    return Ok(Some(resolved));
                }
            }
        }
    }

    // Fallback: the first `<img>` that carries a real URL (skip lazy
    // placeholders / data: URIs). This is a best-effort hero pick -- it can
    // catch a logo before the real image on rare pages, but it beats showing
    // the favicon for every thumbnail-less entry.
    if let Ok(selector) = Selector::parse("img") {
        for element in document.select(&selector) {
            let src = element.value().attr("src").unwrap_or("");
            let src = if is_lazy_placeholder(src) {
                lazy_src(element.value())
            } else {
                Some(src.to_string())
            };
            if let Some(src) = src {
                let resolved = resolve_url(url, &src);
                if !resolved.is_empty() && !is_lazy_placeholder(&resolved) {
                    return Ok(Some(resolved));
                }
            }
        }
    }

    Ok(None)
}

fn find_content(document: &Html) -> Option<ElementRef<'_>> {
    for raw in CONTENT_SELECTORS {
        let Ok(selector) = Selector::parse(raw) else { continue };
        let mut best: Option<ElementRef<'_>> = None;
        for element in document.select(&selector) {
            if element_text_len(element) >= MIN_CONTENT_CHARS && best.is_none() {
                best = Some(element);
                break;
            }
        }
        if let Some(element) = best {
            if link_density(element) <= MAX_LINK_DENSITY {
                return Some(element);
            }
        }
    }

    // No known container matched: take the largest block that reads like a
    // body (enough text, few links). `div`/`section`/`article`/`main` only --
    // `td`-heavy table layouts and `li`-heavy lists are structural chrome.
    let mut best: Option<(ElementRef<'_>, usize)> = None;
    for tag in ["main", "article", "section", "div"] {
        let Ok(selector) = Selector::parse(tag) else { continue };
        for element in document.select(&selector) {
            let len = element_text_len(element);
            if len < MIN_CONTENT_CHARS {
                continue;
            }
            if link_density(element) > MAX_LINK_DENSITY {
                continue;
            }
            if len > best.as_ref().map(|(_, l)| *l).unwrap_or(0) {
                best = Some((element, len));
            }
        }
    }
    best.map(|(element, _)| element)
}

fn element_text_len(element: ElementRef<'_>) -> usize {
    element
        .text()
        .map(str::trim)
        .filter(|s| !s.is_empty())
        .map(|s| s.chars().count())
        .sum()
}

fn link_density(element: ElementRef<'_>) -> f32 {
    let total = element_text_len(element);
    if total == 0 {
        return 1.0;
    }
    let Ok(anchor_selector) = Selector::parse("a") else {
        return 1.0;
    };
    let link_text: usize = element.select(&anchor_selector).map(element_text_len).sum();
    link_text as f32 / total as f32
}

fn is_noise(element: &scraper::node::Element) -> bool {
    if NOISE_TAGS.contains(&element.name.local.as_ref()) {
        return true;
    }
    if element.attr("aria-hidden").is_some_and(|v| v == "true") {
        return true;
    }
    let id = element.id().unwrap_or("").to_ascii_lowercase();
    if NOISE_ID_MARKERS.iter().any(|marker| id.contains(marker)) {
        return true;
    }
    element
        .classes()
        .map(|class| class.to_ascii_lowercase())
        .any(|class| NOISE_CLASS_MARKERS.iter().any(|marker| class.contains(marker)))
}

fn is_void(tag: &str) -> bool {
    VOID_TAGS.contains(&tag)
}

/// Recursively re-serializes a node, dropping noise elements, resolving
/// relative `href`/`src` against the article URL, and escaping attribute
/// values. Namespaced attributes are dropped (article bodies almost never
/// carry them, and serializing them back without their prefix is worse than
/// omitting them).
fn serialize_clean(node: NodeRef<'_, Node>, base: &Url) -> String {
    match node.value() {
        Node::Element(element) => {
            let tag = element.name.local.as_ref();
            if is_noise(element) {
                return String::new();
            }
            // Video embeds: keep only <iframe>s that point at a known player
            // (YouTube/Vimeo/Bilibili/...); every other iframe (ads, social
            // widgets, maps) is chrome and gets dropped.
            if tag == "iframe" {
                let src = element.attr("src").unwrap_or("");
                let resolved = resolve_url(base, src);
                if !is_video_embed(&resolved) {
                    return String::new();
                }
                return format!(
                    r#"<iframe src="{}" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share" allowfullscreen frameborder="0"></iframe>"#,
                    escape_attr(&resolved)
                );
            }
            let mut attrs = String::new();
            for (name, value) in element.attrs.iter() {
                let local = name.local.as_ref();
                // Library-only lazy-load attributes are meaningless once the
                // resolved src below already carries the real URL -- drop
                // them so the output stays clean and small.
                if local.starts_with("data-") {
                    continue;
                }
                let value = if local == "src" && tag == "img" && is_lazy_placeholder(value) {
                    resolve_url(base, &lazy_src(element).unwrap_or_else(|| value.to_string()))
                } else if local == "href" || local == "src" || local == "poster" {
                    resolve_url(base, value)
                } else if local == "srcset" {
                    resolve_srcset(base, value)
                } else {
                    value.to_string()
                };
                attrs.push_str(&format!(" {local}=\"{}\"", escape_attr(&value)));
            }
            if is_void(tag) {
                return format!("<{tag}{attrs}>");
            }
            let children: String = node.children().map(|child| serialize_clean(child, base)).collect();
            format!("<{tag}{attrs}>{children}</{tag}>")
        }
        Node::Text(text) => text.text.to_string(),
        _ => String::new(),
    }
}

fn is_video_embed(url: &str) -> bool {
    let Some(host) = Url::parse(url).ok().and_then(|u| u.host_str().map(str::to_ascii_lowercase)) else {
        return false;
    };
    VIDEO_EMBED_HOSTS.iter().any(|h| host.contains(h))
}

fn is_lazy_placeholder(value: &str) -> bool {
    let v = value.trim();
    v.is_empty() || v.starts_with("data:")
}

fn lazy_src(element: &scraper::node::Element) -> Option<String> {
    LAZY_SRC_ATTRS
        .iter()
        .find_map(|attr| {
            let raw = element.attr(attr)?.trim();
            (!raw.is_empty() && !raw.starts_with("data:")).then(|| raw.to_string())
        })
}

/// Resolves every candidate URL in a `srcset` value, keeping the density
/// descriptors ("1x", "2x") attached to each.
fn resolve_srcset(base: &Url, value: &str) -> String {
    value
        .split(',')
        .filter_map(|part| {
            let part = part.trim();
            if part.is_empty() {
                return None;
            }
            let mut tokens = part.split_whitespace();
            let url = tokens.next()?;
            let rest = tokens.collect::<Vec<_>>().join(" ");
            let resolved = resolve_url(base, url);
            Some(if rest.is_empty() { resolved } else { format!("{resolved} {rest}") })
        })
        .collect::<Vec<_>>()
        .join(", ")
}

fn resolve_url(base: &Url, raw: &str) -> String {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return raw.to_string();
    }
    base.join(trimmed).map(|url| url.to_string()).unwrap_or_else(|_| raw.to_string())
}

fn escape_attr(value: &str) -> String {
    value
        .replace('&', "&amp;")
        .replace('"', "&quot;")
        .replace('<', "&lt;")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn serializes_text_and_resolves_relative_src() {
        let node = Html::parse_document(
            r#"<html><body><article><p>hello</p><img src="/img/a.png"><a href="../top">top</a></article></body></html>"#,
        );
        let base = Url::parse("https://example.com/blog/2026/entry").unwrap();
        let article = node
            .select(&Selector::parse("article").unwrap())
            .next()
            .unwrap();
        let html: String = article.children().map(|c| serialize_clean(c, &base)).collect();
        assert!(html.contains("<p>hello</p>"));
        assert!(html.contains("<img src=\"https://example.com/img/a.png\""));
        assert!(html.contains("href=\"https://example.com/blog/top\""));
    }

    #[test]
    fn strips_noise_elements_and_attrs() {
        let node = Html::parse_document(
            r#"<html><body><div><p>main text</p><script>bad()</script><nav>links</nav><div class="ad-banner">ad</div></div></body></html>"#,
        );
        let base = Url::parse("https://example.com/").unwrap();
        let container = node
            .select(&Selector::parse("div").unwrap())
            .next()
            .unwrap();
        let html: String = container.children().map(|c| serialize_clean(c, &base)).collect();
        assert!(html.contains("<p>main text</p>"));
        assert!(!html.contains("script"));
        assert!(!html.contains("nav"));
        assert!(!html.contains("ad-banner"));
    }

    #[test]
    fn extracts_og_image_and_first_real_img() {
        let doc = Html::parse_document(
            r#"<html><head>
                <meta property="og:image" content="/og.png">
                <meta name="twitter:image" content="https://cdn.example.com/tw.png">
            </head><body><img src="data:image/gif;base64,R0lGOD"><img src="/hero.jpg"></body></html>"#,
        );
        let base = Url::parse("https://example.com/blog/entry").unwrap();

        // og:image wins, and is resolved to an absolute URL.
        let og = doc
            .select(&Selector::parse("meta[property='og:image']").unwrap())
            .next()
            .unwrap();
        let raw = og.value().attr("content").unwrap_or("");
        assert_eq!(resolve_url(&base, raw), "https://example.com/og.png");

        // When no metadata exists, the first real <img> (skipping the lazy
        // placeholder) is picked.
        let doc2 = Html::parse_document(
            r#"<html><body><img src="data:image/gif;base64,R0lGOD"><img src="/hero.jpg"></body></html>"#,
        );
        let picked = doc2
            .select(&Selector::parse("img").unwrap())
            .find(|el| {
                let s = el.value().attr("src").unwrap_or("");
                !is_lazy_placeholder(s)
            })
            .map(|el| resolve_url(&base, el.value().attr("src").unwrap()))
            .unwrap();
        assert_eq!(picked, "https://example.com/hero.jpg");
    }

    #[test]
    fn extracts_json_ld_article_body_when_no_dom_container() {
        // A JS-rendered page with no recognizable container but an SEO
        // articleBody in JSON-LD (the common case that previously failed).
        let doc = Html::parse_document(
            r#"<html><head><script type="application/ld+json">{
                "@context": "https://schema.org",
                "@type": "NewsArticle",
                "headline": "Test",
                "articleBody": "これは最初の段落です。\n\nこれは二つ目の段落で、十分に長い本文になります。"
            }</script></head><body><div id="app"></div></body></html>"#,
        );
        let body = extract_json_ld_article_body(&doc).unwrap();
        let html = json_ld_to_html(&body);
        assert!(html.contains("<p>これは最初の段落です。</p>"));
        assert!(html.contains("<p>これは二つ目の段落で、十分に長い本文になります。</p>"));
        // Nothing dangerous should slip through as raw text.
        assert!(!html.contains("<script"));

        // `@graph` / array shapes are also walked.
        let doc2 = Html::parse_document(
            r#"<html><head><script type="application/ld+json">{
                "@context": "https://schema.org",
                "@graph": [{ "@type": "Article", "articleBody": "graph body text" }]
            }</script></head><body></body></html>"#,
        );
        let body2 = extract_json_ld_article_body(&doc2).unwrap();
        assert!(body2.contains("graph body text"));

        // No articleBody anywhere -> None.
        let doc3 = Html::parse_document(r#"<html><head></head><body><div>no ld+json</div></body></html>"#);
        assert!(extract_json_ld_article_body(&doc3).is_none());
    }

    #[test]
    fn strips_sns_embed_and_related_noise() {
        let node = Html::parse_document(
            r#"<html><body><article>
                <p>実際の本文です</p>
                <div class="hatena-bookmark-button"><a href="https://b.hatena.ne.jp/entry/s/example.com">はてブ</a></div>
                <div class="note-embed"><a href="https://note.com/foo">note</a></div>
                <div class="share"><a href="https://twitter.com/intent/tweet">tweet</a></div>
                <ul class="sns"><li><a>fb</a></li></ul>
                <section id="related-entries"><a href="/r1">関連記事1</a></section>
                <div class="pager"><a href="/next">次へ</a></div>
                <p>本文の続き</p>
            </article></body></html>"#,
        );
        let base = Url::parse("https://example.com/entry").unwrap();
        let article = node
            .select(&Selector::parse("article").unwrap())
            .next()
            .unwrap();
        let html: String = article.children().map(|c| serialize_clean(c, &base)).collect();
        assert!(html.contains("実際の本文です"), "body kept");
        assert!(html.contains("本文の続き"), "body kept");
        assert!(!html.contains("hatena"), "hatena embed stripped");
        assert!(!html.contains("note-embed") && !html.contains("note.com"), "note embed stripped");
        assert!(!html.contains("twitter.com"), "SNS share stripped");
        assert!(!html.contains("関連記事1"), "related stripped");
        assert!(!html.contains("次へ"), "pager stripped");
    }

    #[test]
    fn escapes_attribute_values() {
        assert_eq!(escape_attr("a\"&<b"), "a&quot;&amp;&lt;b");
    }

    #[test]
    fn keeps_video_embed_iframes_but_strips_other_iframes() {
        let node = Html::parse_document(
            r#"<html><body><article>
                <iframe src="https://www.youtube.com/embed/abc123" width="560" height="315"></iframe>
                <iframe src="https://maps.example.com/embed"></iframe>
                <p>text</p>
            </article></body></html>"#,
        );
        let base = Url::parse("https://example.com/entry").unwrap();
        let article = node
            .select(&Selector::parse("article").unwrap())
            .next()
            .unwrap();
        let html: String = article.children().map(|c| serialize_clean(c, &base)).collect();
        assert!(html.contains("youtube.com/embed/abc123"), "youtube iframe kept: {html}");
        assert!(html.contains("allowfullscreen"));
        assert!(!html.contains("maps.example.com"), "non-video iframe stripped");
    }

    #[test]
    fn resolves_lazy_loaded_image_src_and_srcset() {
        let node = Html::parse_document(
            r#"<html><body><article>
                <img src="data:image/gif;base64,R0lGOD" data-src="/img/a.png">
                <img src="/img/top.png">
                <img srcset="/img/s.png 1x, https://cdn.example.com/b.png 2x">
            </article></body></html>"#,
        );
        let base = Url::parse("https://example.com/blog/2026/entry").unwrap();
        let article = node
            .select(&Selector::parse("article").unwrap())
            .next()
            .unwrap();
        let html: String = article.children().map(|c| serialize_clean(c, &base)).collect();
        assert!(
            html.contains("<img src=\"https://example.com/img/a.png\""),
            "lazy src resolved: {html}"
        );
        assert!(html.contains("<img src=\"https://example.com/img/top.png\""));
        assert!(
            html.contains("https://example.com/img/s.png 1x"),
            "srcset resolved: {html}"
        );
        assert!(html.contains("https://cdn.example.com/b.png 2x"));
    }

    #[test]
    fn link_density_recognizes_a_link_farm() {
        let node = Html::parse_document(
            r#"<html><body><div><a href="/1">one</a><a href="/2">two</a><a href="/3">three</a></div></body></html>"#,
        );
        let container = node
            .select(&Selector::parse("div").unwrap())
            .next()
            .unwrap();
        assert!(link_density(container) > MAX_LINK_DENSITY);
    }

    // Manual network probe (run with `cargo test -- --ignored --nocapture`):
    // confirms the extractor returns real readable content for live pages,
    // since the E2E webview can't invoke the command directly.
    #[tokio::test]
    #[ignore = "network-dependent manual check"]
    async fn extracts_live_pages() {
        use std::time::Duration;

        let client = reqwest::Client::builder()
            .user_agent("Gyroscope-test/1.0")
            .timeout(Duration::from_secs(25))
            .build()
            .unwrap();
        for url in [
            "https://zenn.dev/dress_code/articles/da536c39873876",
            "https://gihyo.jp/article/2026/08/zed-delta",
            "https://www.publickey1.jp/blog/26/zeddeltaai.html",
        ] {
            let parsed = Url::parse(url).unwrap();
            match extract_article(&client, &parsed).await {
                Ok(article) => {
                    eprintln!("OK  {url} len={}", article.html.len());
                    assert!(article.html.len() > 400, "extracted HTML too short for {url}");
                }
                Err(err) => {
                    eprintln!("ERR {url} -> {err}");
                    panic!("extraction failed for {url}: {err}");
                }
            }
        }
    }
}