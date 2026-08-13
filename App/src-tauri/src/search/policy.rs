//! Gyroscope's own "which sites are worth subscribing to" heuristics,
//! applied to search results *after* `discovery::discover` has already
//! confirmed a candidate domain actually has a feed (see
//! `commands::search::search_sources`). This module never decides whether a
//! site is feed-worthy -- only how it should be ranked/labeled once it's
//! already known to be.
//!
//! Deliberately rule-based, not AI-judged: an "is this AI-generated /
//! affiliate spam" classifier needs real content analysis to be accurate,
//! which is a much bigger feature than this first cut. See
//! `IDEAS_AND_HYPOTHESES.md` for that as a future direction. Likewise,
//! "exclude corporate blogs by default" was considered and deliberately
//! dropped for v1 -- detecting "corporate-ness" from a URL alone is too
//! unreliable, so corporate domains just fall through to a neutral score
//! instead of being filtered, until real search results show whether that's
//! actually a problem.
//!
//! The domain lists below are a starting point, not a definitive
//! taxonomy -- expected to be tuned once real search results are seen.

/// Domains that are never worth showing as a subscribable "source",
/// regardless of whether they happen to expose a feed. Checked before any
/// feed-discovery network call in `commands::search::search_sources`, so
/// these never cost a discovery request either.
const SHOPPING_DOMAINS: &[&str] = &[
    "amazon.co.jp",
    "amazon.com",
    "rakuten.co.jp",
    "shopping.yahoo.co.jp",
    "mercari.com",
    "aliexpress.com",
];

const WIKI_DOMAINS: &[&str] = &["wikipedia.org", "wikia.com", "fandom.com"];

/// Path fragments that mark a URL as a shopping flow page even on a domain
/// that isn't a dedicated EC site.
const SHOPPING_URL_PATTERNS: &[&str] = &["/cart", "/checkout", "/product/", "/item/"];

/// Personal blog platforms and known high-signal sources -- a hit here adds
/// a positive reason tag. Matched against the registrable domain, e.g.
/// `foo.hatenablog.com` matches `hatenablog.com`.
const BOOST_DOMAINS: &[(&str, &str)] = &[
    ("hatenablog.com", "個人ブログ基盤"),
    ("hatenadiary.jp", "個人ブログ基盤"),
    ("note.com", "個人ブログ基盤"),
    ("zenn.dev", "技術記事プラットフォーム"),
    ("qiita.com", "技術記事プラットフォーム"),
    ("stackoverflow.com", "技術Q&A掲示板"),
    ("stackexchange.com", "技術Q&A掲示板"),
    ("github.com", "開発者一次情報"),
    ("github.io", "開発者一次情報"),
    ("arxiv.org", "論文"),
    ("news.ycombinator.com", "技術系掲示板"),
];

/// Suffixes treated as boost signals rather than exact domains (e.g. any
/// `*.ac.jp` academic site).
const BOOST_SUFFIXES: &[(&str, &str)] = &[(".ac.jp", "学術機関")];

/// URL substrings that mark a link as affiliate-flavored -- a hit here
/// subtracts from the score rather than excluding outright, since an
/// otherwise-good blog occasionally linking out through an affiliate tag
/// shouldn't sink the whole domain.
const AFFILIATE_URL_PATTERNS: &[&str] = &["utm_source=affiliate", "/pr/", "/sponsored/", "amzn.to"];

const BOOST_SCORE: i32 = 2;
const AFFILIATE_PENALTY: i32 = 1;

/// Hits with fewer bookmarks than this are dropped before feed discovery
/// even runs (see `commands::search::run_search`) -- Hatena's search RSS
/// only supports recency order (`?sort=popular` is silently ignored on
/// this endpoint, confirmed by hand), so without this cut a broad query
/// spends a feed-discovery network round-trip on every barely-bookmarked
/// hit just because it's recent. Chosen low deliberately: this is a floor
/// against near-zero-signal noise, not a quality bar -- `bookmark_boost`
/// below does the actual ranking among what's left.
pub const MIN_BOOKMARK_COUNT: u32 = 2;

/// Tiered rather than proportional (e.g. `count / 10`) so one viral post
/// doesn't swamp every domain-based signal in `score` -- being
/// "well-bookmarked" matters more as a threshold than as a magnitude once
/// a hit is clearly popular.
pub fn bookmark_boost(count: u32) -> (i32, Option<String>) {
    match count {
        0..=4 => (0, None),
        5..=19 => (1, Some(format!("{count}users以上ブックマーク"))),
        20..=49 => (2, Some(format!("{count}users以上ブックマーク"))),
        _ => (3, Some(format!("{count}users以上ブックマーク"))),
    }
}

pub struct PolicyResult {
    pub score: i32,
    pub reasons: Vec<String>,
}

/// True if this domain/URL should never be offered as a search result at
/// all -- checked ahead of feed discovery, not just ranking.
pub fn is_hard_excluded(domain: &str, url: &str) -> bool {
    if suffix_matches(domain, SHOPPING_DOMAINS) || suffix_matches(domain, WIKI_DOMAINS) {
        return true;
    }
    let lower = url.to_ascii_lowercase();
    SHOPPING_URL_PATTERNS.iter().any(|p| lower.contains(p))
}

/// Scores a candidate that has already passed `is_hard_excluded` (false)
/// and feed discovery (found). Higher is better; 0 is neutral.
pub fn score(domain: &str, url: &str) -> PolicyResult {
    let mut score = 0;
    let mut reasons = Vec::new();

    if let Some((_, label)) = BOOST_DOMAINS.iter().find(|(d, _)| domain_matches(domain, d)) {
        score += BOOST_SCORE;
        reasons.push((*label).to_string());
    } else if let Some((_, label)) = BOOST_SUFFIXES.iter().find(|(suf, _)| domain.ends_with(*suf)) {
        score += BOOST_SCORE;
        reasons.push((*label).to_string());
    }

    let lower_url = url.to_ascii_lowercase();
    if AFFILIATE_URL_PATTERNS.iter().any(|p| lower_url.contains(p)) {
        score -= AFFILIATE_PENALTY;
        reasons.push("アフィリエイトURLパターン".to_string());
    }

    PolicyResult { score, reasons }
}

/// `domain` matches `registrable` if it's exactly that domain or a
/// subdomain of it (`foo.hatenablog.com` matches `hatenablog.com`, but
/// `hatenablog.com.evil.example` does not).
fn domain_matches(domain: &str, registrable: &str) -> bool {
    domain == registrable || domain.ends_with(&format!(".{registrable}"))
}

fn suffix_matches(domain: &str, list: &[&str]) -> bool {
    list.iter().any(|d| domain_matches(domain, d))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn excludes_known_shopping_domain_and_its_subdomains() {
        assert!(is_hard_excluded("amazon.co.jp", "https://amazon.co.jp/dp/123"));
        assert!(is_hard_excluded("www.amazon.co.jp", "https://www.amazon.co.jp/dp/123"));
    }

    #[test]
    fn excludes_wiki_domain() {
        assert!(is_hard_excluded("en.wikipedia.org", "https://en.wikipedia.org/wiki/Rust"));
    }

    #[test]
    fn excludes_by_shopping_url_pattern_on_an_otherwise_unknown_domain() {
        assert!(is_hard_excluded("example-shop.example", "https://example-shop.example/item/42"));
    }

    #[test]
    fn does_not_exclude_an_ordinary_blog() {
        assert!(!is_hard_excluded("foo.hatenablog.com", "https://foo.hatenablog.com/entry/2026/01/01/post"));
    }

    #[test]
    fn boosts_known_blog_platform_subdomain() {
        let result = score("foo.hatenablog.com", "https://foo.hatenablog.com/entry/1");
        assert_eq!(result.score, BOOST_SCORE);
        assert_eq!(result.reasons, vec!["個人ブログ基盤".to_string()]);
    }

    #[test]
    fn boosts_academic_suffix() {
        let result = score("lab.example.ac.jp", "https://lab.example.ac.jp/paper.html");
        assert_eq!(result.score, BOOST_SCORE);
        assert_eq!(result.reasons, vec!["学術機関".to_string()]);
    }

    #[test]
    fn penalizes_affiliate_url_pattern() {
        let result = score("example.com", "https://example.com/post?utm_source=affiliate");
        assert_eq!(result.score, -AFFILIATE_PENALTY);
        assert_eq!(result.reasons, vec!["アフィリエイトURLパターン".to_string()]);
    }

    #[test]
    fn neutral_for_an_unrecognized_domain_with_no_penalty_signal() {
        let result = score("some-random-blog.example", "https://some-random-blog.example/post/1");
        assert_eq!(result.score, 0);
        assert!(result.reasons.is_empty());
    }

    #[test]
    fn boost_domain_match_does_not_false_positive_on_lookalike_suffix() {
        // "notehatenablog.com" ends with "hatenablog.com" as a raw string
        // suffix but is not a subdomain of it -- domain_matches must reject
        // this via the leading dot, not a bare `ends_with`.
        assert_eq!(score("notehatenablog.com", "https://notehatenablog.com/x").score, 0);
    }

    #[test]
    fn bookmark_boost_is_zero_below_the_lowest_tier() {
        assert_eq!(bookmark_boost(4), (0, None));
    }

    #[test]
    fn bookmark_boost_increases_through_tiers() {
        assert_eq!(bookmark_boost(5).0, 1);
        assert_eq!(bookmark_boost(20).0, 2);
        assert_eq!(bookmark_boost(50).0, 3);
        assert!(bookmark_boost(5).1.is_some());
    }
}
