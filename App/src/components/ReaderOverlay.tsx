import { useMemo } from "react";
import DOMPurify from "dompurify";
import { openUrl } from "@tauri-apps/plugin-opener";
import { formatPublished, stripHtml } from "../lib/text";
import { useAppearanceStore } from "../stores/appearanceStore";
import { useEntriesStore } from "../stores/entriesStore";
import { useUiStore } from "../stores/uiStore";
import { ScreenOverlay } from "./ScreenOverlay";

const HTTP_LINK_RE = /^https?:\/\//i;
// Below this many plain-text characters, treat the article as "probably
// summary-only" (see the banner below) -- some feeds (confirmed via a real
// user report: 窓の杜 vs メタカル最前線) publish only a short teaser in
// content_html itself, not just an empty content_html falling back to
// summary, so there is no reliable signal beyond "this ended up short".
// Not a hard guarantee -- a genuinely short post can still trip this -- but
// it's a reasonable heuristic and the banner's wording is hedged
// accordingly ("かもしれません", not "できません").
const SUMMARY_ONLY_THRESHOLD = 400;

export function ReaderOverlay() {
  const readerEntryId = useUiStore((s) => s.readerEntryId);
  const entries = useEntriesStore((s) => s.entries);
  const blockImages = useAppearanceStore((s) => s.blockImages);

  const entry = entries.find((e) => e.id === readerEntryId) ?? null;

  // DOMPurify's default profile already strips <script>, on* attributes and
  // <iframe> (SPEC §2.3's sanitization requirement) -- the only thing this
  // needs to add on top is optionally forbidding <img>, to keep this pane
  // consistent with EntryRow's "外部画像を読み込まない" setting (D).
  const html = useMemo(() => {
    // `||`, not `??`: some feeds populate content_html as an empty string
    // (not null/undefined) when a <content:encoded>-style tag is present but
    // empty, and `??` only falls through on null/undefined -- with `??` an
    // empty content_html permanently masked a perfectly good summary,
    // showing "本文がありません" even when there was real text to show.
    const raw = entry?.content_html || entry?.summary || "";
    if (!raw) return "";
    return DOMPurify.sanitize(raw, { FORBID_TAGS: blockImages ? ["img"] : [] });
  }, [entry?.content_html, entry?.summary, blockImages]);

  const plainTextLength = useMemo(() => stripHtml(html).length, [html]);
  const looksSummaryOnly = plainTextLength < SUMMARY_ONLY_THRESHOLD;

  // A real <a href> inside dangerouslySetInnerHTML would otherwise navigate
  // this app's own webview (there's nowhere for it to go -- CSP's
  // frame-src/connect-src are locked to 'self') -- intercept clicks and
  // route through the same openUrl() every other link in this app uses.
  function handleContentClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    e.preventDefault();
    const href = anchor.getAttribute("href");
    if (href && HTTP_LINK_RE.test(href)) {
      void openUrl(href);
    }
  }

  async function handleOpenInBrowser() {
    if (entry?.link && HTTP_LINK_RE.test(entry.link)) {
      await openUrl(entry.link);
    }
  }

  return (
    <ScreenOverlay
      screen="reader"
      title={entry?.title ?? "記事"}
      headerActions={
        <button
          type="button"
          onClick={handleOpenInBrowser}
          disabled={!entry?.link}
          className="rounded px-1.5 py-0.5 text-xs font-normal opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 disabled:opacity-30 dark:active:bg-white/10"
        >
          ブラウザで開く
        </button>
      }
    >
      <div className="allow-text-selection min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {!entry ? (
          <p className="p-1 text-xs opacity-60">記事を読み込めませんでした</p>
        ) : (
          <>
            <h1 className="text-base font-semibold">{entry.title ?? "(無題)"}</h1>
            <p className="mt-1 text-xs opacity-60">{formatPublished(entry.published_at)}</p>
            {looksSummaryOnly && (
              <div className="mt-3 flex flex-col gap-2 rounded border border-black/10 bg-black/5 p-3 text-xs dark:border-white/10 dark:bg-white/5">
                <p className="opacity-80">
                  この配信元は要約のみをRSSで配信しているかもしれません。全文はブラウザでご確認ください
                </p>
                <button
                  type="button"
                  onClick={handleOpenInBrowser}
                  disabled={!entry.link}
                  className="accent-bg self-start rounded px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 disabled:opacity-40"
                >
                  ブラウザで全文を読む
                </button>
              </div>
            )}
            {html ? (
              <div
                className="reader-content mt-3 max-w-none"
                onClick={handleContentClick}
                dangerouslySetInnerHTML={{ __html: html }}
              />
            ) : (
              <p className="mt-3 text-xs opacity-60">本文がありません</p>
            )}
          </>
        )}
      </div>
    </ScreenOverlay>
  );
}
