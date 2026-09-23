import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { sanitizeArticleHtml } from "../lib/sanitize";
import { getSkin } from "../lib/skins";
import { readerStyleVariables } from "../lib/readerTheme";
import { formatPublished, stripHtml } from "../lib/text";
import {
  useAppearanceStore,
} from "../stores/appearanceStore";
import { useEntriesStore } from "../stores/entriesStore";
import { getSecondaryEntriesStore } from "../stores/panesStore";
import { useUiStore } from "../stores/uiStore";
import { useSmoothWheelScroll } from "../hooks/useSmoothWheelScroll";
import { useScrollTargetRef } from "../hooks/useScrollTargetRef";
import { ScreenOverlay } from "./ScreenOverlay";
import { ReaderSettingsControls } from "./ReaderSettings";
import { CopyIcon, CloseIcon, ExternalLinkIcon, TypeIcon } from "./icons";

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

  const entry = entries.find((e) => e.id === readerEntryId) ?? secondaryEntries.find((e) => e.id === readerEntryId) ?? null;

  const [fetchedHtml, setFetchedHtml] = useState<string | null>(null);
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const fetchTargetRef = useRef<number | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
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
    </ScreenOverlay>
  );
}
