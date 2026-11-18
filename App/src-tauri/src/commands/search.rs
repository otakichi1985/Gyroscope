use std::collections::HashMap;
use std::sync::{Arc, OnceLock, RwLock};
use std::time::{Duration, Instant};

use reqwest::Client;
use serde::Serialize;
use tauri::State;
use tokio::sync::Semaphore;
use url::Url;

use crate::db::Db;
use crate::error::{AppError, AppResult};
use crate::fetch::{discovery, HttpClient};
use crate::parse::feed::parse_feed;
use crate::search::{hatena_bookmark, policy};

const MAX_CANDIDATES: usize = 40;
const MAX_CONCURRENT_DISCOVERY: usize = 8;
const FEED_CACHE_TTL: Duration = Duration::from_secs(30 * 60);

struct CachedFeed {
    feed_url: Option<String>,
    cached_at: Instant,
}

static FEED_CACHE: OnceLock<RwLock<HashMap<String, CachedFeed>>> = OnceLock::new();

fn feed_cache() -> &'static RwLock<HashMap<String, CachedFeed>> {
    FEED_CACHE.get_or_init(|| RwLock::new(HashMap::new()))
}

fn get_cached_feed(key: &str) -> Option<Option<String>> {
    let cache = feed_cache().read().ok()?;
    let entry = cache.get(key)?;
    if entry.cached_at.elapsed() <= FEED_CACHE_TTL {
        Some(entry.feed_url.clone())
    } else {
        None
    }
}

fn put_cached_feed(key: String, feed_url: Option<String>) {
    if let Ok(mut cache) = feed_cache().write() {
        cache.insert(
            key,
            CachedFeed {
                feed_url,
                cached_at: Instant::now(),
            },
        );
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct ScoredSource {
    pub title: String,
    pub url: String,
    pub domain: String,
    pub snippet: String,
    pub published_at: Option<String>,
    pub feed_url: Option<String>,
    pub feed_available: bool,
    pub thumbnail_url: Option<String>,
    pub bookmark_count: u32,
    pub score: i32,
    pub reasons: Vec<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SearchCategory {
    pub slug: String,
    pub label: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthorArticlePreview {
    pub title: String,
    pub url: String,
    pub summary: String,
    pub published_at: Option<String>,
    pub thumbnail_url: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AuthorFeedPreview {
    pub feed_url: String,
    pub feed_title: String,
    pub articles: Vec<AuthorArticlePreview>,
}

#[tauri::command]
pub async fn preview_author_feed(
    client: State<'_, HttpClient>,
    url: String,
) -> AppResult<AuthorFeedPreview> {
    let parsed_url = Url::parse(url.trim())
        .map_err(|_| AppError::Other("有効なURLではありません".to_string()))?;
    let discovered = if let Some(platform_feed) = known_platform_feed_url(&parsed_url) {
        match discovery::discover(&client.0, &platform_feed).await {
            Ok(d) => d,
            Err(_) => discovery::discover(&client.0, &parsed_url).await?,
        }
    } else if let Ok(d) = discovery::discover(&client.0, &parsed_url).await {
        d
    } else if let Some(root) = site_root(&parsed_url) {
        discovery::discover(&client.0, &root).await?
    } else {
        return Err(AppError::FeedNotFound);
    };

    let feed = parse_feed(&discovered.body, Some(&discovered.feed_url))?;
    let feed_title = feed
        .title
        .filter(|t| !t.trim().is_empty())
        .unwrap_or_else(|| source_key(&parsed_url));
    let articles = feed
        .entries
        .into_iter()
        .filter_map(|e| {
            let link = e.link?;
            let title = e.title.filter(|t| !t.trim().is_empty())?;
            Some(AuthorArticlePreview {
                title,
                url: link,
                summary: e.summary.unwrap_or_default(),
                published_at: e.published_at,
                thumbnail_url: e.thumbnail_url,
            })
        })
        .take(30)
        .collect();

    Ok(AuthorFeedPreview {
        feed_url: discovered.feed_url,
        feed_title,
        articles,
    })
}

#[tauri::command]
pub fn list_search_categories() -> Vec<SearchCategory> {
    hatena_bookmark::CATEGORIES
        .iter()
        .map(|(slug, label)| SearchCategory {
            slug: slug.to_string(),
            label: label.to_string(),
        })
        .collect()
}

#[tauri::command]
pub async fn search_sources(
    db: State<'_, Db>,
    client: State<'_, HttpClient>,
    query: String,
) -> AppResult<Vec<ScoredSource>> {
    let query = query.trim();
    if query.is_empty() {
        return Err(AppError::Other("検索語を入力してください".to_string()));
    }
    let registered = load_registered_feeds(&db);
    let hits = hatena_bookmark::search(&client.0, query).await?;
    rank_hits(&client.0, hits, Some(query), &registered).await
}

#[tauri::command]
pub async fn browse_category(
    db: State<'_, Db>,
    client: State<'_, HttpClient>,
    category: String,
) -> AppResult<Vec<ScoredSource>> {
    let registered = load_registered_feeds(&db);
    let hits = hatena_bookmark::browse_category(&client.0, &category).await?;
    rank_hits(&client.0, hits, None, &registered).await
}

fn load_registered_feeds(db: &Db) -> HashMap<String, String> {
    let mut map = HashMap::new();
    let Ok(conn) = db.0.lock() else {
        return map;
    };
    let Ok(mut stmt) = conn.prepare("SELECT url, site_url FROM feeds") else {
        return map;
    };
    let Ok(rows) = stmt.query_map([], |row| {
        Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?))
    }) else {
        return map;
    };
    for row in rows.flatten() {
        let (feed_url, site_url) = row;
        if let Some(target) = site_url.as_deref().or(Some(feed_url.as_str())) {
            if let Ok(parsed) = Url::parse(target) {
                map.entry(source_key(&parsed)).or_insert_with(|| feed_url.clone());
            }
        }
        if let Ok(parsed_feed) = Url::parse(&feed_url) {
            map.entry(source_key(&parsed_feed)).or_insert(feed_url);
        }
    }
    map
}

fn candidate_priority(
    query: Option<&str>,
    hit: &hatena_bookmark::SearchHit,
    domain: &str,
) -> (i32, u32) {
    let policy_score = policy::score(domain, &hit.url).score;
    let (bookmark_score, _) = policy::bookmark_boost(hit.bookmark_count);
    let relevance = query
        .map(|q| policy::query_relevance(q, &hit.title, &hit.snippet, domain))
        .unwrap_or(0);
    (relevance * 4 + policy_score + bookmark_score, hit.bookmark_count)
}

async fn rank_hits(
    client: &Client,
    hits: Vec<hatena_bookmark::SearchHit>,
    query: Option<&str>,
    registered_feeds: &HashMap<String, String>,
) -> AppResult<Vec<ScoredSource>> {
    struct GroupedHit {
        key: String,
        domain: String,
        hit: hatena_bookmark::SearchHit,
        priority: (i32, u32),
    }

    let mut by_source: HashMap<String, GroupedHit> = HashMap::new();
    for hit in hits {
        if hit.bookmark_count < policy::MIN_BOOKMARK_COUNT {
            continue;
        }
        let Ok(parsed) = Url::parse(&hit.url) else {
            continue;
        };
        let Some(host) = parsed.host_str() else {
            continue;
        };
        let domain = host.to_string();
        if policy::is_hard_excluded(&domain, &hit.url) {
            continue;
        }
        let key = source_key(&parsed);
        let priority = candidate_priority(query, &hit, &domain);
        by_source
            .entry(key.clone())
            .and_modify(|existing| {
                if priority > existing.priority {
                    existing.domain = domain.clone();
                    existing.hit = clone_hit(&hit);
                    existing.priority = priority;
                }
            })
            .or_insert(GroupedHit {
                key,
                domain,
                hit,
                priority,
            });
    }

    let mut candidates: Vec<GroupedHit> = by_source.into_values().collect();
    candidates.sort_by_key(|c| std::cmp::Reverse(c.priority));
    candidates.truncate(MAX_CANDIDATES);

    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_DISCOVERY));
    let mut handles = Vec::with_capacity(candidates.len());
    for candidate in candidates {
        if let Some(feed_url) = registered_feeds.get(&candidate.key).cloned() {
            handles.push(tauri::async_runtime::spawn(async move {
                (candidate.domain, candidate.hit, Some(feed_url))
            }));
            continue;
        }
        let Ok(site_url) = Url::parse(&candidate.hit.url) else {
            continue;
        };
        let client = client.clone();
        let semaphore = Arc::clone(&semaphore);
        let cache_key = candidate.key.clone();
        handles.push(tauri::async_runtime::spawn(async move {
            if let Some(cached) = get_cached_feed(&cache_key) {
                return (candidate.domain, candidate.hit, cached);
            }
            let _permit = semaphore.acquire_owned().await;
            let feed_url = discover_feed_url(&client, &site_url).await;
            put_cached_feed(cache_key, feed_url.clone());
            (candidate.domain, candidate.hit, feed_url)
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        let Ok((domain, hit, feed_url)) = handle.await else {
            continue;
        };
        let policy_result = policy::score(&domain, &hit.url);
        let (bookmark_score, bookmark_reason) = policy::bookmark_boost(hit.bookmark_count);
        let relevance_score = query
            .map(|q| policy::query_relevance(q, &hit.title, &hit.snippet, &domain))
            .unwrap_or(0);
        let feed_bonus = i32::from(feed_url.is_some());
        let mut reasons = policy_result.reasons;
        reasons.extend(bookmark_reason);
        results.push(ScoredSource {
            title: hit.title,
            url: hit.url,
            domain,
            snippet: hit.snippet,
            published_at: hit.published_at,
            feed_url: feed_url.clone(),
            feed_available: feed_url.is_some(),
            thumbnail_url: hit.thumbnail_url,
            bookmark_count: hit.bookmark_count,
            score: policy_result.score + bookmark_score + relevance_score + feed_bonus,
            reasons,
        });
    }

    results.sort_by_key(|r| std::cmp::Reverse((r.score, r.bookmark_count)));
    Ok(results)
}

fn source_key(url: &Url) -> String {
    let host = url
        .host_str()
        .unwrap_or_default()
        .trim_start_matches("www.")
        .to_ascii_lowercase();
    let segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|seg| !seg.is_empty()).collect())
        .unwrap_or_default();
    match host.as_str() {
        "zenn.dev" | "qiita.com" | "note.com" => {
            if let Some(first) = segments.first() {
                if !matches!(
                    *first,
                    "topics" | "tags" | "search" | "explore" | "about" | "settings" | "organizations"
                ) {
                    return format!("{host}/{first}");
                }
            }
            host
        }
        "github.com" => {
            if segments.len() >= 2 {
                format!("{host}/{}/{}", segments[0], segments[1])
            } else {
                host
            }
        }
        _ => host,
    }
}

pub(crate) fn known_platform_feed_url(url: &Url) -> Option<Url> {
    let host = url
        .host_str()?
        .trim_start_matches("www.")
        .to_ascii_lowercase();
    let segments: Vec<&str> = url
        .path_segments()
        .map(|s| s.filter(|seg| !seg.is_empty()).collect())
        .unwrap_or_default();
    match host.as_str() {
        "zenn.dev" | "qiita.com" => {
            let user = segments.first()?;
            if matches!(
                *user,
                "topics" | "tags" | "search" | "explore" | "about" | "settings" | "organizations"
            ) {
                return None;
            }
            Url::parse(&format!("https://{host}/{user}/feed")).ok()
        }
        "note.com" => {
            let user = segments.first()?;
            if matches!(*user, "topics" | "search" | "explore" | "about" | "settings") {
                return None;
            }
            Url::parse(&format!("https://note.com/{user}/rss")).ok()
        }
        _ if host.ends_with(".hatenablog.com")
            || host.ends_with(".hatenablog.jp")
            || host.ends_with(".hateblo.jp")
            || host.ends_with(".hatenadiary.jp")
            || host.ends_with(".hatenadiary.com") =>
        {
            Url::parse(&format!("https://{host}/rss")).ok()
        }
        _ => None,
    }
}

async fn discover_feed_url(client: &Client, article: &Url) -> Option<String> {
    if let Some(platform_feed) = known_platform_feed_url(article) {
        if let Ok(discovered) = discovery::discover(client, &platform_feed).await {
            return Some(discovered.feed_url);
        }
    }
    if let Some(root) = site_root(article) {
        if let Ok(discovered) = discovery::discover(client, &root).await {
            return Some(discovered.feed_url);
        }
    }
    discovery::discover(client, article)
        .await
        .ok()
        .map(|d| d.feed_url)
}

fn site_root(url: &Url) -> Option<Url> {
    let host = url.host_str()?;
    let root = Url::parse(&format!("{}://{}", url.scheme(), host)).ok()?;
    if root == *url {
        return None;
    }
    Some(root)
}

fn clone_hit(hit: &hatena_bookmark::SearchHit) -> hatena_bookmark::SearchHit {
    hatena_bookmark::SearchHit {
        title: hit.title.clone(),
        url: hit.url.clone(),
        snippet: hit.snippet.clone(),
        published_at: hit.published_at.clone(),
        thumbnail_url: hit.thumbnail_url.clone(),
        bookmark_count: hit.bookmark_count,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn site_root_reduces_an_article_url_to_origin() {
        let article = Url::parse("https://zenn.dev/dress_code/articles/da536c39873876").unwrap();
        assert_eq!(site_root(&article).unwrap().as_str(), "https://zenn.dev/");
    }

    #[test]
    fn site_root_preserves_www() {
        let article = Url::parse("https://www.example.com/a/b").unwrap();
        assert_eq!(
            site_root(&article).unwrap().as_str(),
            "https://www.example.com/"
        );
    }

    #[test]
    fn site_root_is_none_when_already_at_the_root() {
        let root = Url::parse("https://example.com").unwrap();
        assert!(site_root(&root).is_none());
    }

    #[test]
    fn site_root_is_none_without_a_host() {
        let no_host = Url::parse("file:///tmp/feed.xml").unwrap();
        assert!(site_root(&no_host).is_none());
    }

    #[test]
    fn source_key_separates_platform_authors_and_normalizes_www() {
        let zenn_a = Url::parse("https://zenn.dev/alice/articles/post-1").unwrap();
        let zenn_b = Url::parse("https://zenn.dev/bob/articles/post-2").unwrap();
        assert_eq!(source_key(&zenn_a), "zenn.dev/alice");
        assert_eq!(source_key(&zenn_b), "zenn.dev/bob");

        let gh = Url::parse("https://github.com/tauri-apps/tauri/issues/1").unwrap();
        assert_eq!(source_key(&gh), "github.com/tauri-apps/tauri");

        let www = Url::parse("https://www.example.com/blog/1").unwrap();
        assert_eq!(source_key(&www), "example.com");
    }

    #[test]
    fn known_platform_feed_url_resolves_direct_feed_urls() {
        let zenn = Url::parse("https://zenn.dev/alice/articles/post-1").unwrap();
        assert_eq!(
            known_platform_feed_url(&zenn).unwrap().as_str(),
            "https://zenn.dev/alice/feed"
        );
        let note = Url::parse("https://note.com/bob/n/n12345").unwrap();
        assert_eq!(
            known_platform_feed_url(&note).unwrap().as_str(),
            "https://note.com/bob/rss"
        );
        let hatena = Url::parse("https://foo.hatenablog.com/entry/2026/01/01").unwrap();
        assert_eq!(
            known_platform_feed_url(&hatena).unwrap().as_str(),
            "https://foo.hatenablog.com/rss"
        );
        let topic = Url::parse("https://zenn.dev/topics/rust").unwrap();
        assert!(known_platform_feed_url(&topic).is_none());
    }

    #[test]
    fn candidate_priority_prefers_relevant_hit_over_unrelated_high_bookmarks() {
        let relevant = hatena_bookmark::SearchHit {
            title: "Rust Async 入門".to_string(),
            url: "https://example.org/rust-async".to_string(),
            snippet: "async runtime".to_string(),
            published_at: None,
            thumbnail_url: None,
            bookmark_count: 10,
        };
        let popular_unrelated = hatena_bookmark::SearchHit {
            title: "今日のランチ".to_string(),
            url: "https://example.net/lunch".to_string(),
            snippet: "美味しい".to_string(),
            published_at: None,
            thumbnail_url: None,
            bookmark_count: 100,
        };
        assert!(
            candidate_priority(Some("rust async"), &relevant, "example.org")
                > candidate_priority(Some("rust async"), &popular_unrelated, "example.net")
        );
    }
}
