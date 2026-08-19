import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { sanitizeArticleHtml } from "../lib/sanitize";
import { formatPublished, stripHtml } from "../lib/text";
import { useAppearanceStore } from "../stores/appearanceStore";
import { useEntriesStore } from "../stores/entriesStore";
import { useUiStore } from "../stores/uiStore";
import { ScreenOverlay } from "./ScreenOverlay";

const HTTP_LINK_RE = /^https?:\/\//i;
// Below this many plain-text characters, treat the article as "probably
// summary-only" and auto-fetch the full text from the article page on open
// -- some feeds (confirmed via a real user report: 窓の杜 vs メタカル
// 最前線) publish only a short teaser in content_html itself, not just an
// empty content_html falling back to summary, so there is no reliable signal
// beyond "this ended up short". Not a hard guarantee -- a genuinely short
// post can still trip this -- but it's a reasonable heuristic, and the
// feed content stays visible as a fallback either way.
const SUMMARY_ONLY_THRESHOLD = 400;

export function ReaderOverlay() {
  const readerEntryId = useUiStore((s) => s.readerEntryId);
  const activeScreen = useUiStore((s) => s.activeScreen);
  const entries = useEntriesStore((s) => s.entries);
  const blockImages = useAppearanceStore((s) => s.blockImages);

  // The scroll container below stays mounted across article switches (the
  // overlay is always rendered, see App.tsx), so its scrollTop carried over
  // from the previous article -- opening a different entry resumed the old
  // scroll position instead of starting at the top. Reset it whenever the
  // reader opens or the shown entry changes (layout effect so the corrected
  // position lands in the same paint as the new content).
  const scrollRef = useRef<HTMLDivElement>(null);
  const isReaderActive = activeScreen === "reader";
  useLayoutEffect(() => {
    if (isReaderActive) scrollRef.current?.scrollTo({ top: 0 });
  }, [isReaderActive, readerEntryId]);

  const entry = entries.find((e) => e.id === readerEntryId) ?? null;

  // Full-text fetch for summary-only feeds (commands::article). Lives in
  // component state so it survives the scroll pane's per-entry remount
  // below, and is cleared whenever the shown entry changes.
  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  useLayoutEffect(() => {
    setFetchedHtml(null);
    setFetching(false);
    setFetchError(null);
  }, [readerEntryId]);

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
    return sanitizeArticleHtml(raw, blockImages);
  }, [entry?.content_html, entry?.summary, blockImages]);

  // The fetched full text gets the exact same sanitization path as the feed
  // content above, and replaces it once available.
  const fullHtml = useMemo(() => {
    if (!fetchedHtml) return null;
    return sanitizeArticleHtml(fetchedHtml, blockImages);
  }, [fetchedHtml, blockImages]);
  const displayHtml = fullHtml ?? html;

  const plainTextLength = useMemo(() => stripHtml(html).length, [html]);
  const looksSummaryOnly = plainTextLength < SUMMARY_ONLY_THRESHOLD;

  // Full-text fetch for summary-only feeds (commands::article). Shared by the
  // auto-fetch below and the retry button shown when a fetch fails.
  const runFullTextFetch = useCallback(async () => {
    if (!entry?.link) return;
    setFetching(true);
    setFetchError(null);
    try {
      const result = await invoke<{ html: string }>("fetch_article_full_text", { url: entry.link });
      setFetchedHtml(result.html);
    } catch (err) {
      setFetchError(String(err));
    } finally {
      setFetching(false);
    }
  }, [entry?.link]);

  // The "全文を取得して読む" button is gone -- summary-only articles now
  // fetch their full text automatically on open. The feed content stays
  // visible while the page is being fetched (reader-first), then gets
  // replaced by the extracted article once it arrives. Runs only while the
  // reader is actually showing, and only once per entry (guarded by
  // fetching/fetchedHtml, which the per-entry reset above clears).
  useEffect(() => {
    if (!isReaderActive) return;
    if (!entry?.link || !looksSummaryOnly) return;
    // fetching/fetchedHtml stop it re-triggering while in flight or after a
    // success; fetchError stops it auto-retrying forever on failure (the 再取得
    // button handles that explicitly instead).
    if (fetching || fetchedHtml || fetchError) return;
    void runFullTextFetch();
  }, [isReaderActive, entry?.link, looksSummaryOnly, fetching, fetchedHtml, fetchError, runFullTextFetch]);

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
      {/* `key` remounts the whole scroll pane per article: without it the
          same div just re-renders in place, so the previous article's
          scrollTop carried over and the new content (images still loading,
          GIFs decoding) was composed into that stale viewport -- read as
          flicker on open, and left embedded images/GIFs not animating or
          showing correctly until another scroll forced a repaint. A fresh
          pane per entry starts at scrollTop 0 by construction. */}
      <div key={entry?.id ?? "none"} ref={scrollRef} className="allow-text-selection min-h-0 flex-1 overflow-y-auto p-3 text-sm">
        {!entry ? (
          <p className="p-1 text-xs opacity-60">記事を読み込めませんでした</p>
        ) : (
          <>
            <h1 className="text-base font-semibold">{entry.title ?? "(無題)"}</h1>
            <p className="mt-1 text-xs opacity-60">{formatPublished(entry.published_at)}</p>
            {looksSummaryOnly && !fetchedHtml && entry.link && (
              <div className="mt-3 flex flex-col gap-2 rounded border border-black/10 bg-black/5 p-3 text-xs dark:border-white/10 dark:bg-white/5">
                {fetching ? (
                  <p className="opacity-80" role="status">
                    全文を取得中...
                  </p>
                ) : fetchError ? (
                  <>
                    <p className="opacity-80">全文の取得に失敗しました。ブラウザで開いてください</p>
                    <div className="flex flex-wrap gap-1">
                      <button
                        type="button"
                        onClick={() => void runFullTextFetch()}
                        disabled={!entry.link || fetching}
                        className="accent-bg rounded px-3 py-1.5 text-xs font-medium text-white transition-colors duration-150 disabled:opacity-40"
                      >
                        再取得
                      </button>
                      <button
                        type="button"
                        onClick={handleOpenInBrowser}
                        disabled={!entry.link}
                        className="rounded bg-black/10 px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
                      >
                        ブラウザで開く
                      </button>
                    </div>
                    <p className="text-xs text-red-500">{fetchError}</p>
                  </>
                ) : (
                  <p className="opacity-80">全文を取得しています...</p>
                )}
              </div>
            )}
            {displayHtml ? (
              <div
                className="reader-content mt-3 max-w-none"
                onClick={handleContentClick}
                dangerouslySetInnerHTML={{ __html: displayHtml }}
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
