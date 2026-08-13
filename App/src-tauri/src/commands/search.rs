use std::collections::HashMap;

use reqwest::Client;
use serde::Serialize;
use tauri::State;
use url::Url;

use crate::error::{AppError, AppResult};
use crate::fetch::{discovery, HttpClient};
use crate::search::{hatena_bookmark, policy};

/// Caps how many distinct domains a single search checks for a feed --
/// each check is a real network round-trip to the candidate site (see
/// `discovery::discover` below), so this bounds how long/heavy one search
/// can get, independent of how many raw hits come back.
const MAX_CANDIDATES: usize = 15;

#[derive(Debug, Clone, Serialize)]
pub struct ScoredSource {
    pub title: String,
    pub url: String,
    pub domain: String,
    pub snippet: String,
    pub score: i32,
    pub reasons: Vec<String>,
}

/// Searches for candidate *sources* (not articles) to subscribe to: runs a
/// keyword search, keeps one hit per domain, drops anything hard-excluded
/// or without a discoverable feed, scores what's left with Gyroscope's own
/// policy, and returns it sorted best-first.
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

    // One representative hit per domain: feed discovery only needs to run
    // once per site, and the same domain appearing twice wouldn't give the
    // user anything new to decide on.
    let mut by_domain: HashMap<String, hatena_bookmark::SearchHit> = HashMap::new();
    for hit in hits {
        let Ok(parsed) = Url::parse(&hit.url) else { continue };
        let Some(host) = parsed.host_str() else { continue };
        let domain = host.to_string();
        if policy::is_hard_excluded(&domain, &hit.url) {
            continue;
        }
        by_domain.entry(domain).or_insert(hit);
    }

    let mut results = Vec::new();
    for (domain, hit) in by_domain.into_iter().take(MAX_CANDIDATES) {
        let Ok(site_url) = Url::parse(&hit.url) else { continue };
        if discovery::discover(client, &site_url).await.is_err() {
            continue;
        }
        let policy_result = policy::score(&domain, &hit.url);
        results.push(ScoredSource {
            title: hit.title,
            url: hit.url,
            domain,
            snippet: hit.snippet,
            score: policy_result.score,
            reasons: policy_result.reasons,
        });
    }

    results.sort_by_key(|r| std::cmp::Reverse(r.score));
    Ok(results)
}
