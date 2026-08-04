/// Strips HTML tags down to plain text for the search index (`body_text` in
/// `entries`, see db/migrations.rs v3) -- SQLite has no built-in HTML
/// stripping, so this has to happen in Rust before the value is stored.
/// Same `scraper::Html::parse_fragment` approach `parse::thumbnail` already
/// uses for the same reason (well-formed-HTML assumptions aside, this is a
/// best-effort text extraction, not a renderer).
pub fn strip_html(html: &str) -> String {
    let fragment = scraper::Html::parse_fragment(html);
    fragment
        .root_element()
        .text()
        .collect::<Vec<_>>()
        .join(" ")
        .split_whitespace()
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn strips_tags_and_collapses_whitespace() {
        let html = "<p>Hello <b>world</b></p>\n<div>  second   line  </div>";
        assert_eq!(strip_html(html), "Hello world second line");
    }

    #[test]
    fn keeps_japanese_text_intact() {
        let html = "<p>日本語の<strong>本文</strong>です</p>";
        assert_eq!(strip_html(html), "日本語の 本文 です");
    }

    #[test]
    fn empty_input_yields_empty_string() {
        assert_eq!(strip_html(""), "");
    }

    #[test]
    fn drops_script_tag_content_markers_but_keeps_it_best_effort() {
        // Not a security boundary (this text only ever feeds FTS5 indexing,
        // never rendered as HTML) -- just confirming it doesn't panic on
        // tags with no visible text.
        let html = "<script>alert(1)</script><p>visible</p>";
        assert_eq!(strip_html(html), "alert(1) visible");
    }
}
