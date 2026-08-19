use std::collections::HashMap;
use std::sync::Arc;

use reqwest::Client;
use serde::Serialize;
use tauri::State;
use tokio::sync::Semaphore;
use url::Url;

use crate::error::{AppError, AppResult};
use crate::fetch::{discovery, HttpClient};
use crate::search::{hatena_bookmark, policy};

/// Caps how many distinct domains a single search checks for a feed --
/// each check is a real network round-trip to the candidate site (see
/// `discovery::discover` below), so this bounds how long/heavy one search
/// can get, independent of how many raw hits come back. Candidates are
/// pre-sorted by bookmark count (see `rank_hits`) before this cut, so a
/// broad query loses its least-bookmarked hits first, not an arbitrary
/// subset.
const MAX_CANDIDATES: usize = 30;

/// How many feed-discovery requests (each a real network round-trip to a
/// candidate site) run at once. `discovery::discover` itself already
/// retries transient failures with backoff (`fetch::client`), so a slow or
/// unreachable candidate shouldn't be allowed to serialize behind every
/// other candidate the way an unbounded sequential loop would.
const MAX_CONCURRENT_DISCOVERY: usize = 5;

#[derive(Debug, Clone, Serialize)]
pub struct ScoredSource {
    pub title: String,
    pub url: String,
    pub domain: String,
    pub snippet: String,
    pub published_at: Option<String>,
    /// The resolved feed URL when a feed was actually found (via the article
    /// URL or the site root -- see `discover_feed_url`). The register action
    /// should subscribe to *this*, not `url`: on sites like zenn.dev the
    /// article page carries no feed link but the site root does, and feeding
    /// the article URL to add_feed would then fail after the badge already
    /// promised "RSS登録可".
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

/// The fixed category list `browse_category` accepts -- exposed so the
/// frontend doesn't hardcode its own copy of Hatena's category slugs.
#[tauri::command]
pub fn list_search_categories() -> Vec<SearchCategory> {
    hatena_bookmark::CATEGORIES
        .iter()
        .map(|(slug, label)| SearchCategory { slug: slug.to_string(), label: label.to_string() })
        .collect()
}

/// Keyword-driven counterpart to `browse_category`: searches for candidate
/// *sources* (not articles) to subscribe to matching a query, rather than
/// browsing one of Hatena's fixed categories. See `rank_hits` for the
/// shared feed-gating/scoring pipeline both go through.
#[tauri::command]
pub async fn search_sources(client: State<'_, HttpClient>, query: String) -> AppResult<Vec<ScoredSource>> {
    let query = query.trim();
    if query.is_empty() {
        return Err(AppError::Other("検索語を入力してください".to_string()));
    }
    let hits = hatena_bookmark::search(&client.0, query).await?;
    rank_hits(&client.0, hits).await
}

/// Passive counterpart to `search_sources`: browses one of Hatena
/// Bookmark's fixed categories (its cross-site "popular right now" feed)
/// instead of a keyword query -- lets a user skim a genre broadly for
/// candidate sources rather than only searching for something specific
/// they already have in mind.
#[tauri::command]
pub async fn browse_category(client: State<'_, HttpClient>, category: String) -> AppResult<Vec<ScoredSource>> {
    let hits = hatena_bookmark::browse_category(&client.0, &category).await?;
    rank_hits(&client.0, hits).await
}

/// Shared pipeline for both search modes: keeps the most-bookmarked hit per
/// domain, drops anything hard-excluded, too obscure, or without a
/// discoverable feed, scores what's left with Gyroscope's own policy, and
/// returns it sorted best-first.
///
/// Deliberately feed-gated rather than showing raw hits and letting "登録"
/// fail later -- the point of both search modes is finding sites worth
/// subscribing to, not finding individual articles (see DISCOVERY.md
/// decision for this feature).
async fn rank_hits(client: &Client, hits: Vec<hatena_bookmark::SearchHit>) -> AppResult<Vec<ScoredSource>> {
    // One representative hit per domain -- the most-bookmarked one, not
    // just whichever happened to be seen first -- since feed discovery
    // only needs to run once per site and the same domain appearing twice
    // wouldn't give the user anything new to decide on.
    let mut by_domain: HashMap<String, hatena_bookmark::SearchHit> = HashMap::new();
    for hit in hits {
        if hit.bookmark_count < policy::MIN_BOOKMARK_COUNT {
            continue;
        }
        let Ok(parsed) = Url::parse(&hit.url) else { continue };
        let Some(host) = parsed.host_str() else { continue };
        let domain = host.to_string();
        if policy::is_hard_excluded(&domain, &hit.url) {
            continue;
        }
        by_domain
            .entry(domain)
            .and_modify(|existing| {
                if hit.bookmark_count > existing.bookmark_count {
                    *existing = clone_hit(&hit);
                }
            })
            .or_insert(hit);
    }

    // Sorted by bookmark count *before* the `MAX_CANDIDATES` cut below --
    // Hatena's RSS endpoints only support recency order (`?sort=popular` is
    // silently ignored on the search endpoint, confirmed by hand), so
    // without this, capping the candidate list would drop by arbitrary
    // hash-map iteration order instead of by actual signal.
    let mut candidates: Vec<(String, hatena_bookmark::SearchHit)> = by_domain.into_iter().collect();
    candidates.sort_by_key(|(_, hit)| std::cmp::Reverse(hit.bookmark_count));
    candidates.truncate(MAX_CANDIDATES);

    let semaphore = Arc::new(Semaphore::new(MAX_CONCURRENT_DISCOVERY));
    let mut handles = Vec::with_capacity(candidates.len());
    for (domain, hit) in candidates {
        let Ok(site_url) = Url::parse(&hit.url) else { continue };
        let client = client.clone();
        let semaphore = Arc::clone(&semaphore);
        handles.push(tauri::async_runtime::spawn(async move {
            let _permit = semaphore.acquire_owned().await;
            let feed_url = discover_feed_url(&client, &site_url).await;
            (domain, hit, feed_url)
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        let Ok((domain, hit, feed_url)) = handle.await else { continue };
        let policy_result = policy::score(&domain, &hit.url);
        let (bookmark_score, bookmark_reason) = policy::bookmark_boost(hit.bookmark_count);
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
            score: policy_result.score + bookmark_score,
            reasons,
        });
    }

    results.sort_by_key(|r| std::cmp::Reverse(r.score));
    Ok(results)
}

/// Resolves a candidate's actual feed URL for the "RSS登録可" badge.
///
/// Tries the article URL first (that's what a user is looking at), then
/// falls back to the site root: many article pages don't link the feed even
/// when the site publishes one (zenn.dev's `/feed` is only exposed from the
/// root, confirmed by hand), so testing just the article page produced
/// "RSSなし" badges for sites that genuinely have a subscribable feed --
/// which also contradicted the feed tab, where entering the site URL
/// discovered the same feed fine.
async fn discover_feed_url(client: &Client, article: &Url) -> Option<String> {
    if let Ok(discovered) = discovery::discover(client, article).await {
        return Some(discovered.feed_url);
    }
    let root = site_root(article)?;
    discovery::discover(client, &root).await.ok().map(|d| d.feed_url)
}

/// The bare `scheme://host` of a URL, or None when the URL is already the
/// root / has no parseable host. Used for the site-root fallback above.
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
        // url::Url normalizes the empty path of a bare origin to "/".
        assert_eq!(site_root(&article).unwrap().as_str(), "https://zenn.dev/");
    }

    #[test]
    fn site_root_preserves_www() {
        let article = Url::parse("https://www.example.com/a/b").unwrap();
        assert_eq!(site_root(&article).unwrap().as_str(), "https://www.example.com/");
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
}
