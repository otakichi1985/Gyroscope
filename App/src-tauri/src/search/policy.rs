const SHOPPING_DOMAINS: &[&str] = &[
    "amazon.co.jp",
    "amazon.com",
    "rakuten.co.jp",
    "shopping.yahoo.co.jp",
    "mercari.com",
    "aliexpress.com",
];

const WIKI_DOMAINS: &[&str] = &["wikipedia.org", "wikia.com", "fandom.com"];

const SHOPPING_URL_PATTERNS: &[&str] = &["/cart", "/checkout", "/product/", "/item/"];

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

const BOOST_SUFFIXES: &[(&str, &str)] = &[(".ac.jp", "学術機関")];

const AFFILIATE_URL_PATTERNS: &[&str] = &["utm_source=affiliate", "/pr/", "/sponsored/", "amzn.to"];

const BOOST_SCORE: i32 = 2;
const AFFILIATE_PENALTY: i32 = 1;

pub const MIN_BOOKMARK_COUNT: u32 = 2;

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

pub fn is_hard_excluded(domain: &str, url: &str) -> bool {
    if suffix_matches(domain, SHOPPING_DOMAINS) || suffix_matches(domain, WIKI_DOMAINS) {
        return true;
    }
    let lower = url.to_ascii_lowercase();
    SHOPPING_URL_PATTERNS.iter().any(|p| lower.contains(p))
}

pub fn score(domain: &str, url: &str) -> PolicyResult {
    let mut score = 0;
    let mut reasons = Vec::new();

    if let Some((_, label)) = BOOST_DOMAINS
        .iter()
        .find(|(d, _)| domain_matches(domain, d))
    {
        score += BOOST_SCORE;
        reasons.push((*label).to_string());
    } else if let Some((_, label)) = BOOST_SUFFIXES
        .iter()
        .find(|(suf, _)| domain.ends_with(*suf))
    {
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
        assert!(is_hard_excluded(
            "amazon.co.jp",
            "https://amazon.co.jp/dp/123"
        ));
        assert!(is_hard_excluded(
            "www.amazon.co.jp",
            "https://www.amazon.co.jp/dp/123"
        ));
    }

    #[test]
    fn excludes_wiki_domain() {
        assert!(is_hard_excluded(
            "en.wikipedia.org",
            "https://en.wikipedia.org/wiki/Rust"
        ));
    }

    #[test]
    fn excludes_by_shopping_url_pattern_on_an_otherwise_unknown_domain() {
        assert!(is_hard_excluded(
            "example-shop.example",
            "https://example-shop.example/item/42"
        ));
    }

    #[test]
    fn does_not_exclude_an_ordinary_blog() {
        assert!(!is_hard_excluded(
            "foo.hatenablog.com",
            "https://foo.hatenablog.com/entry/2026/01/01/post"
        ));
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
        let result = score(
            "example.com",
            "https://example.com/post?utm_source=affiliate",
        );
        assert_eq!(result.score, -AFFILIATE_PENALTY);
        assert_eq!(
            result.reasons,
            vec!["アフィリエイトURLパターン".to_string()]
        );
    }

    #[test]
    fn neutral_for_an_unrecognized_domain_with_no_penalty_signal() {
        let result = score(
            "some-random-blog.example",
            "https://some-random-blog.example/post/1",
        );
        assert_eq!(result.score, 0);
        assert!(result.reasons.is_empty());
    }

    #[test]
    fn boost_domain_match_does_not_false_positive_on_lookalike_suffix() {
        assert_eq!(
            score("notehatenablog.com", "https://notehatenablog.com/x").score,
            0
        );
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
