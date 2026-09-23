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
        let html = "<script>alert(1)</script><p>visible</p>";
        assert_eq!(strip_html(html), "alert(1) visible");
    }
}
