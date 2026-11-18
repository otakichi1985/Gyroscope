import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { sanitizeArticleHtml } from "../lib/sanitize";
import { getSkin } from "../lib/skins";
import { readerStyleVariables } from "../lib/readerTheme";
import { formatPublished, stripHtml } from "../lib/text";
import { useAppearanceStore } from "../stores/appearanceStore";
import { useEntriesStore } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";
import { hostOf } from "../lib/discoverRanking";
import type { Entry } from "../lib/types";
import { getSecondaryEntriesStore } from "../stores/panesStore";
import { useUiStore } from "../stores/uiStore";
import { useSmoothWheelScroll } from "../hooks/useSmoothWheelScroll";
import { useScrollTargetRef } from "../hooks/useScrollTargetRef";
import { ScreenOverlay } from "./ScreenOverlay";
import { ReaderSettingsControls } from "./ReaderSettings";
import { AuthorFeedPanel } from "./AuthorFeedPanel";
import { CopyIcon, CloseIcon, ExternalLinkIcon, RssIcon, StarIcon, TypeIcon, UserIcon } from "./icons";

const HTTP_LINK_RE = /^https?:\/\//i;
const SUMMARY_ONLY_THRESHOLD = 400;

const HEADER_CHIP_CLASS =
  "flex items-center gap-1 rounded bg-black/5 px-2 py-0.5 text-xs transition-colors duration-150 hover:bg-black/10 active:bg-black/15 disabled:opacity-40 dark:bg-white/5 dark:hover:bg-white/10 dark:active:bg-white/15";

export function ReaderOverlay() {
  const readerEntryId = useUiStore((s) => s.readerEntryId);
  const activeScreen = useUiStore((s) => s.activeScreen);
  const entries = useEntriesStore((s) => s.entries);
  const secondaryEntries = getSecondaryEntriesStore()((s) => s.entries);
  const blockImages = useAppearanceStore((s) => s.blockImages);
  const readerFontSize = useAppearanceStore((s) => s.readerFontSize);
  const readerLineHeight = useAppearanceStore((s) => s.readerLineHeight);
  const readerColumnWidth = useAppearanceStore((s) => s.readerColumnWidth);
  const readerKeepOpacity = useAppearanceStore((s) => s.readerKeepOpacity);
  const readerFontFamily = useAppearanceStore((s) => s.readerFontFamily);
  const readerCodeFont = useAppearanceStore((s) => s.readerCodeFont);
  const readerColors = useAppearanceStore((s) => s.readerColors);
  const skinId = useAppearanceStore((s) => s.skinId);

  const scrollRef = useRef<HTMLDivElement>(null);
  const smoothScroll = useAppearanceStore((s) => s.smoothScroll);
  const wheelRef = useSmoothWheelScroll(smoothScroll, scrollRef);
  const targetRef = useScrollTargetRef<HTMLDivElement>();
  const scrollRefFn = useCallback(
    (el: HTMLDivElement | null) => {
      wheelRef(el);
      targetRef(el);
    },
    [wheelRef, targetRef],
  );
  const isReaderActive = activeScreen === "reader";
  useLayoutEffect(() => {
    if (isReaderActive) scrollRef.current?.scrollTo({ top: 0 });
  }, [isReaderActive, readerEntryId]);

  const storedEntry =
    entries.find((e) => e.id === readerEntryId) ?? secondaryEntries.find((e) => e.id === readerEntryId) ?? null;

  // 一覧に無い記事（ダイジェストなど）は DB から1件だけ取って開く。
  const [fetchedEntry, setFetchedEntry] = useState<Entry | null>(null);
  const [overrideArticle, setOverrideArticle] = useState<{
    url: string;
    title: string;
    summary: string;
    published_at: string | null;
    thumbnail_url: string | null;
    feedTitle: string;
  } | null>(null);
  const [overrideSaved, setOverrideSaved] = useState(false);
  const [authorFeedOpen, setAuthorFeedOpen] = useState(false);
  useEffect(() => {
    if (storedEntry || readerEntryId === null) {
      setFetchedEntry(null);
      return;
    }
    let cancelled = false;
    setFetchedEntry(null);
    void invoke<Entry | null>("get_entry", { id: readerEntryId })
      .then((fetched) => {
        if (!cancelled) setFetchedEntry(fetched);
      })
      .catch(() => {
        if (!cancelled) setFetchedEntry(null);
      });
    return () => {
      cancelled = true;
    };
  }, [readerEntryId, storedEntry]);

  const baseEntry = storedEntry ?? fetchedEntry;
  const entry = overrideArticle
    ? ({
        ...(baseEntry ?? {
          id: -1,
          feed_id: 0,
          guid: overrideArticle.url,
          author: null,
          content_html: null,
          is_read: true,
          fetched_at: "",
          deleted_at: null,
        }),
        title: overrideArticle.title,
        link: overrideArticle.url,
        summary: overrideArticle.summary,
        content_html: null,
        published_at: overrideArticle.published_at,
        thumbnail_url: overrideArticle.thumbnail_url,
        is_starred: overrideSaved,
      } satisfies Entry)
    : baseEntry;

  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchTargetRef = useRef<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copyState, setCopyState] = useState<"idle" | "copied" | "error">("idle");
  const [feedAdding, setFeedAdding] = useState(false);
  const [feedAddState, setFeedAddState] = useState<"idle" | "added" | "error">("idle");
  const copyResetTimer = useRef<number | null>(null);
  const feeds = useFeedsStore((s) => s.feeds);
  const addFeed = useFeedsStore((s) => s.addFeed);
  useLayoutEffect(() => {
    setFetchedHtml(null);
    setFetching(false);
    setFetchError(null);
    setSettingsOpen(false);
    setCopyState("idle");
    setFeedAdding(false);
    setFeedAddState("idle");
    setOverrideArticle(null);
    setOverrideSaved(false);
    setAuthorFeedOpen(false);
    fetchTargetRef.current = null;
    if (copyResetTimer.current) window.clearTimeout(copyResetTimer.current);
  }, [readerEntryId]);

  const html = useMemo(() => {
    const raw = entry?.content_html || entry?.summary || "";
    if (!raw) return "";
    return sanitizeArticleHtml(raw, blockImages);
  }, [entry?.content_html, entry?.summary, blockImages]);

  const fullHtml = useMemo(() => {
    if (!fetchedHtml) return null;
    return sanitizeArticleHtml(fetchedHtml, blockImages);
  }, [fetchedHtml, blockImages]);
  const displayHtml = fullHtml ?? html;

  const plainTextLength = useMemo(() => stripHtml(html).length, [html]);
  const looksSummaryOnly = plainTextLength < SUMMARY_ONLY_THRESHOLD;

  const readerVars = readerStyleVariables({
    fontSize: readerFontSize,
    lineHeight: readerLineHeight,
    columnWidth: readerColumnWidth,
    fontFamily: readerFontFamily,
    codeFont: readerCodeFont,
    colors: readerColors,
  }) as React.CSSProperties;

  const floating = getSkin(skinId).floating === true;
  const keepOpacityActive = floating && readerKeepOpacity && isReaderActive;
  const overlayStyle = keepOpacityActive ? ({ "--float-alpha": "1" } as React.CSSProperties) : undefined;

  const runFullTextFetch = useCallback(async () => {
    if (!entry?.link) return;
    const link = entry.link;
    const entryId = readerEntryId;
    fetchTargetRef.current = entryId;
    setFetching(true);
    setFetchError(null);
    try {
      const result = await invoke<{ html: string }>("fetch_article_full_text", { url: link });
      if (fetchTargetRef.current !== entryId) return;
      setFetchedHtml(result.html);
    } catch (err) {
      if (fetchTargetRef.current !== entryId) return;
      setFetchError(String(err));
    } finally {
      if (fetchTargetRef.current === entryId) setFetching(false);
    }
  }, [entry?.link, readerEntryId]);

  useEffect(() => {
    if (!isReaderActive) return;
    if (!entry?.link || !looksSummaryOnly) return;
    if (fetching || fetchedHtml || fetchError) return;
    void runFullTextFetch();
  }, [isReaderActive, entry?.link, looksSummaryOnly, fetching, fetchedHtml, fetchError, runFullTextFetch]);

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

  const entryHost = entry?.link ? hostOf(entry.link) : "";
  const isFeedRegistered =
    (entry?.feed_id ?? 0) > 0 ||
    feedAddState === "added" ||
    (!!entryHost &&
      feeds.some((f) => hostOf(f.url) === entryHost || (f.site_url ? hostOf(f.site_url) === entryHost : false)));

  function handleToggleStar() {
    if (!entry) return;
    if (overrideArticle) {
      const next = !overrideSaved;
      setOverrideSaved(next);
      if (next) {
        void invoke("save_article", {
          url: overrideArticle.url,
          title: overrideArticle.title,
          domain: hostOf(overrideArticle.url) || overrideArticle.feedTitle,
          snippet: overrideArticle.summary,
          thumbnailUrl: overrideArticle.thumbnail_url,
        });
      } else {
        void invoke("unsave_article", { url: overrideArticle.url });
      }
      return;
    }
    if (entry.id < 0) {
      void useEntriesStore.getState().deleteEntry(entry.id);
      return;
    }
    const next = !entry.is_starred;
    void useEntriesStore.getState().toggleStar(entry.id, next);
    if (fetchedEntry && fetchedEntry.id === entry.id) {
      setFetchedEntry({ ...fetchedEntry, is_starred: next });
    }
  }

  async function handleAddFeedFromEntry() {
    if (!entry?.link || feedAdding || isFeedRegistered) return;
    setFeedAdding(true);
    setFeedAddState("idle");
    try {
      try {
        await addFeed(entry.link);
      } catch {
        const origin = new URL(entry.link).origin;
        if (origin !== entry.link) {
          await addFeed(origin);
        } else {
          throw new Error("feed not found");
        }
      }
      setFeedAddState("added");
    } catch {
      setFeedAddState("error");
    } finally {
      setFeedAdding(false);
    }
  }

  return (
    <ScreenOverlay
      screen="reader"
      title={entry?.title ?? "記事"}
      style={overlayStyle}
      headerActions={
        <>
          {overrideArticle && (
            <button
              type="button"
              onClick={() => {
                setOverrideArticle(null);
                setOverrideSaved(false);
                setFetchedHtml(null);
                setFetchError(null);
              }}
              aria-label="元の記事に戻る"
              title="元の記事に戻る"
              className={HEADER_CHIP_CLASS}
            >
              ←<span className="hidden min-[480px]:inline"> 元の記事</span>
            </button>
          )}
          {entry?.link && (
            <button
              type="button"
              onClick={() => setAuthorFeedOpen(true)}
              aria-label="著者の記事一覧を開く"
              title="この著者・サイトの他の記事を読む"
              className={HEADER_CHIP_CLASS}
            >
              <UserIcon className="h-3.5 w-3.5" />
              <span className="hidden min-[480px]:inline">著者の記事</span>
            </button>
          )}
          <button
            type="button"
            onClick={handleToggleStar}
            disabled={!entry}
            aria-pressed={Boolean(entry?.is_starred)}
            aria-label={entry?.is_starred ? "ブックマークを外す" : "ブックマークする"}
            title={entry?.is_starred ? "ブックマークを外す" : "ブックマークする"}
            className={`${HEADER_CHIP_CLASS} ${
              entry?.is_starred ? "accent-bg-soft accent-text font-medium" : "opacity-90"
            }`}
          >
            <StarIcon filled={Boolean(entry?.is_starred)} className="h-3.5 w-3.5" />
            <span className="hidden min-[480px]:inline">{entry?.is_starred ? "ブクマ済み" : "ブクマ"}</span>
          </button>
          {entry?.link && !isFeedRegistered && (
            <button
              type="button"
              onClick={() => void handleAddFeedFromEntry()}
              disabled={feedAdding}
              aria-label="この記事のサイトのRSSを登録"
              title="この記事のサイトのRSSを登録"
              className={HEADER_CHIP_CLASS}
            >
              <RssIcon className="h-3.5 w-3.5" />
              <span className="hidden min-[480px]:inline">
                {feedAdding ? "登録中..." : feedAddState === "error" ? "RSS未検出" : "RSS登録"}
              </span>
            </button>
          )}
          <button
            type="button"
            onClick={() => setSettingsOpen((v) => !v)}
            aria-pressed={settingsOpen}
            aria-label="文字設定"
            title="文字の大きさ・行間・列幅の設定"
            className={`${HEADER_CHIP_CLASS} ${
              settingsOpen ? "accent-bg-soft accent-text font-medium" : "opacity-90"
            }`}
          >
            <TypeIcon className="h-3.5 w-3.5" />
            <span className="hidden min-[480px]:inline">文字設定</span>
          </button>
          <button
            type="button"
            data-testid="reader-copy-link"
            onClick={() => void handleCopyLink()}
            disabled={!entry?.link}
            aria-label="リンクをコピー"
            title="記事のURLをクリップボードにコピー"
            aria-live="polite"
            className={HEADER_CHIP_CLASS}
          >
            <CopyIcon className="h-3.5 w-3.5" />
            <span className="hidden min-[480px]:inline">
              {copyState === "copied" ? "コピーしました" : copyState === "error" ? "コピー失敗" : "リンクをコピー"}
            </span>
          </button>
          <button
            type="button"
            onClick={handleOpenInBrowser}
            disabled={!entry?.link}
            aria-label="ブラウザで開く"
            title="既定のブラウザで開く"
            className={HEADER_CHIP_CLASS}
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            <span className="hidden min-[480px]:inline">ブラウザで開く</span>
          </button>
        </>
      }
    >
      {settingsOpen && (
        <div className="shrink-0 border-b border-black/10 bg-black/[0.03] px-3 py-2 dark:border-white/10 dark:bg-white/[0.03]">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-[10px] font-medium opacity-70">文字設定</span>
            <button
              type="button"
              onClick={() => setSettingsOpen(false)}
              aria-label="文字設定を閉じる"
              className="flex items-center gap-1 rounded bg-black/5 px-1.5 py-0.5 text-[10px] opacity-70 transition-colors duration-150 hover:bg-black/10 hover:opacity-100 active:bg-black/15 dark:bg-white/5 dark:hover:bg-white/10 dark:active:bg-white/15"
            >
              <CloseIcon className="h-3 w-3" />
              閉じる
            </button>
          </div>
          <ReaderSettingsControls />
        </div>
      )}

      <div
        key={entry?.id ?? "none"}
        ref={scrollRefFn}
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
      {authorFeedOpen && entry?.link && (
        <AuthorFeedPanel
          articleUrl={entry.link}
          currentUrl={entry.link}
          onClose={() => setAuthorFeedOpen(false)}
          onSelectArticle={(article, feedTitle) => {
            setAuthorFeedOpen(false);
            setFetchedHtml(null);
            setFetchError(null);
            setFetching(false);
            setOverrideSaved(false);
            setOverrideArticle({
              url: article.url,
              title: article.title,
              summary: article.summary,
              published_at: article.published_at,
              thumbnail_url: article.thumbnail_url,
              feedTitle,
            });
            scrollRef.current?.scrollTo({ top: 0 });
          }}
        />
      )}
    </ScreenOverlay>
  );
}
