import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { sanitizeArticleHtml } from "../lib/sanitize";
import { getSkin } from "../lib/skins";
import { readerPresetVar } from "../lib/readerTheme";
import { formatPublished, stripHtml } from "../lib/text";
import {
  useAppearanceStore,
  type ReaderColumnWidth,
  type ReaderElementKey,
  type ReaderFontFamily,
  type ReaderFontSize,
  type ReaderLineHeight,
} from "../stores/appearanceStore";
import { useEntriesStore } from "../stores/entriesStore";
import { useUiStore } from "../stores/uiStore";
import { ScreenOverlay } from "./ScreenOverlay";
import { ReaderSettingsControls } from "./ReaderSettings";
import { CopyIcon, ExternalLinkIcon, TypeIcon } from "./icons";

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

// The three 文字設定 axes map straight onto CSS custom properties consumed by
// `.reader-content` / `.reader-column` in index.css (see those rules for the
// reading-typography rationale). Defaults match the store's defaults.
const FONT_SIZE_MAP: Record<ReaderFontSize, string> = {
  small: "13px",
  medium: "15px",
  large: "17px",
  xlarge: "19px",
};
const LINE_HEIGHT_MAP: Record<ReaderLineHeight, string> = {
  tight: "1.5",
  normal: "1.75",
  loose: "2.05",
};
const COLUMN_WIDTH_MAP: Record<ReaderColumnWidth, string> = {
  narrow: "32em",
  normal: "40em",
  wide: "50em",
};

// 本文/見出しの書体: the app/global font by default, or an explicit gothic
// (sans) / mincho (serif) stack. "app" resolves to `inherit` so the article
// follows the global font setting until the user picks a reader-specific face.
const FONT_FAMILY_MAP: Record<ReaderFontFamily, string> = {
  app: "inherit",
  sans: `system-ui, -apple-system, "Segoe UI", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`,
  serif: `"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", "MS PMincho", serif`,
};
const CODE_FONT_MONO =
  "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

// The element colors map onto `--reader-color-*` CSS variables consumed by
// `.reader-content` (index.css). Only overridden elements are set -- anything
// null stays unset so the `var(--reader-color-X, fallback)` in CSS falls back
// to the current theme.
const ELEMENT_COLOR_KEYS: Record<ReaderElementKey, string> = {
  body: "--reader-color-body",
  heading: "--reader-color-heading",
  quote: "--reader-color-quote",
  code: "--reader-color-code",
  link: "--reader-color-link",
};

// Header actions sit next to the (visibly boxed) close button, so the quiet
// text-only style that worked for plain labels made 文字設定 / ブラウザで開く look
// like passive header text instead of buttons. They get the same chip shape
// the rest of the app uses for secondary actions (rounded fill, hover),
// plus an icon, so they read as "buttons you can press" before hovering.
const HEADER_CHIP_CLASS =
  "flex items-center gap-1 rounded bg-black/5 px-2 py-0.5 text-xs transition-colors duration-150 hover:bg-black/10 active:bg-black/15 disabled:opacity-40 dark:bg-white/5 dark:hover:bg-white/10 dark:active:bg-white/15";

export function ReaderOverlay() {
  const readerEntryId = useUiStore((s) => s.readerEntryId);
  const activeScreen = useUiStore((s) => s.activeScreen);
  const entries = useEntriesStore((s) => s.entries);
  const blockImages = useAppearanceStore((s) => s.blockImages);
  const readerFontSize = useAppearanceStore((s) => s.readerFontSize);
  const readerLineHeight = useAppearanceStore((s) => s.readerLineHeight);
  const readerColumnWidth = useAppearanceStore((s) => s.readerColumnWidth);
  const readerKeepOpacity = useAppearanceStore((s) => s.readerKeepOpacity);
  const readerFontFamily = useAppearanceStore((s) => s.readerFontFamily);
  const readerCodeFont = useAppearanceStore((s) => s.readerCodeFont);
  const readerColors = useAppearanceStore((s) => s.readerColors);
  const skinId = useAppearanceStore((s) => s.skinId);

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
  // Which entry the in-flight full-text fetch (if any) belongs to. Cleared
  // when the shown entry changes so a late reply from the previous article is
  // dropped instead of silently overwriting the current one (user report:
  // opened a summary-only article, moved to another, and the old article's
  // fetch landing late replaced the new article's content).
  const fetchTargetRef = useRef<number | null>(null);
  // Whether the "文字設定" panel is open. Kept in component state and reset
  // on entry change so it doesn't linger over the next article.
  const [settingsOpen, setSettingsOpen] = useState(false);
  // Feedback for the リンクをコピー header button: "idle" -> "copied"/"error"
  // for a moment after pressing, so the action doesn't happen silently.
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const copyResetTimer = useRef<number | null>(null);
  useLayoutEffect(() => {
    setFetchedHtml(null);
    setFetching(false);
    setFetchError(null);
    setSettingsOpen(false);
    setCopyState("idle");
    fetchTargetRef.current = null;
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
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

  // The 文字設定 axes drive CSS custom properties consumed by `.reader-content`
  // and `.reader-column` (index.css) -- see the maps above. Colors are preset
  // tints resolved through `var(--reader-preset-*)` so they adapt to the
  // current theme; only overridden elements are set, the rest fall back.
  const readerColorVars = {} as Record<string, string>;
  for (const key of Object.keys(ELEMENT_COLOR_KEYS) as ReaderElementKey[]) {
    const preset = readerColors[key];
    if (preset) readerColorVars[ELEMENT_COLOR_KEYS[key]] = readerPresetVar(preset);
  }
  const readerVars = {
    "--reader-font-size": FONT_SIZE_MAP[readerFontSize],
    "--reader-line-height": LINE_HEIGHT_MAP[readerLineHeight],
    "--reader-max-width": COLUMN_WIDTH_MAP[readerColumnWidth],
    "--reader-font-family": FONT_FAMILY_MAP[readerFontFamily],
    "--reader-code-font-family":
      readerCodeFont === "mono" ? CODE_FONT_MONO : "var(--reader-font-family)",
    ...readerColorVars,
  } as React.CSSProperties;

  // "記事を開いている間は不透明度を保つ": floating skins drive their opacity
  // entirely through `--float-alpha` (see App.tsx / .skin-floating in
  // index.css), so raising it to 1 here makes the whole reading surface
  // effectively opaque -- the desktop behind the window stops showing through
  // while an article is open. Opaque skins use native window alpha instead,
  // which can't be raised per-screen, so this only fires for floating skins.
  const floating = getSkin(skinId).floating === true;
  const keepOpacityActive = floating && readerKeepOpacity && isReaderActive;
  const overlayStyle = keepOpacityActive ? ({ "--float-alpha": "1" } as React.CSSProperties) : undefined;

  // Full-text fetch for summary-only feeds (commands::article). Shared by the
  // auto-fetch below and the retry button shown when a fetch fails.
  const runFullTextFetch = useCallback(async () => {
    if (!entry?.link) return;
    const link = entry.link;
    const entryId = readerEntryId;
    fetchTargetRef.current = entryId;
    setFetching(true);
    setFetchError(null);
    try {
      const result = await invoke<{ html: string }>("fetch_article_full_text", { url: link });
      // The reader may have moved to another entry while this was in flight;
      // a stale reply must not overwrite the currently-viewed article.
      if (fetchTargetRef.current !== entryId) return;
      setFetchedHtml(result.html);
    } catch (err) {
      if (fetchTargetRef.current !== entryId) return;
      setFetchError(String(err));
    } finally {
      if (fetchTargetRef.current === entryId) setFetching(false);
    }
  }, [entry?.link, readerEntryId]);

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

  // Copy the article link to the clipboard. WebView2's navigator.clipboard is
  // preferred; the hidden-textarea execCommand path is the fallback for
  // environments where the async clipboard API is unavailable/denied. Either
  // way the button shows a brief コピーしました so the copy doesn't happen
  // silently.
  async function handleCopyLink() {
    if (!entry?.link) return;
    const text = entry.link;
    let ok = false;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        ok = true;
      }
    } catch {
      // fall through to the legacy path
    }
    if (!ok) {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.focus();
        ta.select();
        ok = document.execCommand("copy");
        ta.remove();
      } catch {
        ok = false;
      }
    }
    setCopyState(ok ? "copied" : "error");
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
    copyResetTimer.current = window.setTimeout(() => setCopyState("idle"), 1600);
  }

  return (
    <ScreenOverlay
      screen="reader"
      title={entry?.title ?? "記事"}
      style={overlayStyle}
      headerActions={
        <>
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-pressed={settingsOpen}
            title="文字の大きさ・行間・列幅の設定"
            className={`${HEADER_CHIP_CLASS} ${
              settingsOpen ? "accent-bg-soft accent-text font-medium" : "opacity-90"
            }`}
          >
            <TypeIcon className="h-3.5 w-3.5" />
            文字設定
          </button>
          <button
            type="button"
            data-testid="reader-copy-link"
            onClick={() => void handleCopyLink()}
            disabled={!entry?.link}
            title="記事のURLをクリップボードにコピー"
            aria-live="polite"
            className={HEADER_CHIP_CLASS}
          >
            <CopyIcon className="h-3.5 w-3.5" />
            {copyState === "copied" ? "コピーしました" : copyState === "error" ? "コピー失敗" : "リンクをコピー"}
          </button>
          <button
            type="button"
            onClick={handleOpenInBrowser}
            disabled={!entry?.link}
            title="既定のブラウザで開く"
            className={HEADER_CHIP_CLASS}
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            ブラウザで開く
          </button>
        </>
      }
    >
      {settingsOpen && (
        <div className="shrink-0 border-b border-black/10 bg-black/[0.03] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
          <ReaderSettingsControls />
        </div>
      )}
      {/* `key` remounts the whole scroll pane per article: without it the
          same div just re-renders in place, so the previous article's
          scrollTop carried over and the new content (images still loading,
          GIFs decoding) was composed into that stale viewport -- read as
          flicker on open, and left embedded images/GIFs not animating or
          showing correctly until another scroll forced a repaint. A fresh
          pane per entry starts at scrollTop 0 by construction. */}
      <div
        key={entry?.id ?? "none"}
        ref={scrollRef}
        style={readerVars}
        className="allow-text-selection min-h-0 flex-1 overflow-y-auto p-3 text-sm"
      >
        {!entry ? (
          <p className="p-1 text-xs opacity-60">記事を読み込めませんでした</p>
        ) : (
          <div className="reader-column">
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
          </div>
        )}
      </div>
    </ScreenOverlay>
  );
}
