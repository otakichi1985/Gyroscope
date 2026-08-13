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
/// pre-sorted by bookmark count (see `run_search`) before this cut, so a
/// broad query loses its least-bookmarked hits first, not an arbitrary
/// subset.
const MAX_CANDIDATES: usize = 15;

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
    pub bookmark_count: u32,
    pub score: i32,
    pub reasons: Vec<String>,
}

/// Searches for candidate *sources* (not articles) to subscribe to: runs a
/// keyword search, keeps the most-bookmarked hit per domain, drops
/// anything hard-excluded, too obscure, or without a discoverable feed,
/// scores what's left with Gyroscope's own policy, and returns it sorted
/// best-first.
///
/// Deliberately feed-gated rather than showing raw search hits and letting
/// "登録" fail later -- the point of this search is finding sites worth
/// subscribing to, not finding individual articles (see DISCOVERY.md
/// decision for this feature).
#[tauri::command]
pub async fn search_sources(client: State<'_, HttpClient>, query: String) -> AppResult<Vec<ScoredSource>> {
    run_search(&client.0, &query).await
}

/// Plain-`Client` core of `search_sources`, split out from the Tauri
/// command wrapper above so it can be exercised directly (manual probing
/// against the real network, or a future test) without needing a Tauri
/// `State` to construct.
async fn run_search(client: &Client, query: &str) -> AppResult<Vec<ScoredSource>> {
    let query = query.trim();
    if query.is_empty() {
        return Err(AppError::Other("検索語を入力してください".to_string()));
    }

    let hits = hatena_bookmark::search(client, query).await?;

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
    // Hatena's search RSS only supports recency order (`?sort=popular` is
    // silently ignored on this endpoint, confirmed by hand), so without
    // this, capping the candidate list would drop by arbitrary hash-map
    // iteration order instead of by actual signal.
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
            let found = discovery::discover(&client, &site_url).await.is_ok();
            (domain, hit, found)
        }));
    }

    let mut results = Vec::with_capacity(handles.len());
    for handle in handles {
        let Ok((domain, hit, found)) = handle.await else { continue };
        if !found {
            continue;
        }
        let policy_result = policy::score(&domain, &hit.url);
        let (bookmark_score, bookmark_reason) = policy::bookmark_boost(hit.bookmark_count);
        let mut reasons = policy_result.reasons;
        reasons.extend(bookmark_reason);
        results.push(ScoredSource {
            title: hit.title,
            url: hit.url,
            domain,
            snippet: hit.snippet,
            bookmark_count: hit.bookmark_count,
            score: policy_result.score + bookmark_score,
            reasons,
        });
    }

    results.sort_by_key(|r| std::cmp::Reverse(r.score));
    Ok(results)
}

fn clone_hit(hit: &hatena_bookmark::SearchHit) -> hatena_bookmark::SearchHit {
    hatena_bookmark::SearchHit {
        title: hit.title.clone(),
        url: hit.url.clone(),
        snippet: hit.snippet.clone(),
        bookmark_count: hit.bookmark_count,
    }
}
