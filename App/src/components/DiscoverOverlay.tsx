import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useFeedsStore } from "../stores/feedsStore";
import { useUiStore } from "../stores/uiStore";
import {
  useAppearanceStore,
} from "../stores/appearanceStore";
import { sanitizeArticleHtml } from "../lib/sanitize";
import { getSkin } from "../lib/skins";
import { formatPublished } from "../lib/text";
import { hostOf, relevanceOf } from "../lib/discoverRanking";
import { useSmoothWheelScroll } from "../hooks/useSmoothWheelScroll";
import { useScrollTargetRef } from "../hooks/useScrollTargetRef";
import { readerStyleVariables } from "../lib/readerTheme";
import type { ScoredSource, SearchCategory } from "../lib/types";
import { MarqueeTitle } from "./MarqueeTitle";
import { ScreenOverlay } from "./ScreenOverlay";
import { ClearableInput } from "./ClearableInput";
import { ExternalLinkIcon, ImageOffIcon, StarIcon } from "./icons";

const HTTP_LINK_RE = /^https?:\/\//i;

type ResultSort = "relevance" | "recommended" | "newest" | "oldest";
type ResultSize = "compact" | "standard" | "large";
type ResultKind = "all" | "personal" | "technical" | "academic" | "qa" | "developer";
type ResultAvailability = "all" | "feed" | "noFeed";

const SORTS: [ResultSort, string][] = [
  ["relevance", "関連度"],
  ["recommended", "おすすめ"],
  ["newest", "新着"],
  ["oldest", "古い"],
];

const SIZES: [ResultSize, string][] = [
  ["compact", "小"],
  ["standard", "標準"],
  ["large", "大"],
];

const KINDS: [ResultKind, string][] = [
  ["all", "すべて"],
  ["personal", "個人ブログ基盤"],
  ["technical", "技術記事"],
  ["academic", "学術・論文"],
  ["qa", "技術Q&A"],
  ["developer", "開発者一次情報"],
];

const AVAILABILITIES: [ResultAvailability, string][] = [
  ["all", "すべて"],
  ["feed", "RSS登録可"],
  ["noFeed", "RSSなし"],
];

const NOISE_REASON = /users以上ブックマーク$/;

export function DiscoverOverlay() {
  const { addFeed, feeds } = useFeedsStore();
  const blockImages = useAppearanceStore((s) => s.blockImages);
  const readerFontSize = useAppearanceStore((s) => s.readerFontSize);
  const readerLineHeight = useAppearanceStore((s) => s.readerLineHeight);
  const readerColumnWidth = useAppearanceStore((s) => s.readerColumnWidth);
  const readerKeepOpacity = useAppearanceStore((s) => s.readerKeepOpacity);
  const readerFontFamily = useAppearanceStore((s) => s.readerFontFamily);
  const readerCodeFont = useAppearanceStore((s) => s.readerCodeFont);
  const readerColors = useAppearanceStore((s) => s.readerColors);
  const skinId = useAppearanceStore((s) => s.skinId);
  const smoothScroll = useAppearanceStore((s) => s.smoothScroll);
  const resultsWheel = useSmoothWheelScroll<HTMLDivElement>(smoothScroll);
  const readerWheel = useSmoothWheelScroll<HTMLDivElement>(smoothScroll);
  const resultsTarget = useScrollTargetRef<HTMLDivElement>();
  const readerTarget = useScrollTargetRef<HTMLDivElement>();
  const resultsScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      resultsWheel(el);
      resultsTarget(el);
    },
    [resultsWheel, resultsTarget],
  );
  const readerScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      readerWheel(el);
      readerTarget(el);
    },
    [readerWheel, readerTarget],
  );

  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<SearchCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [results, setResults] = useState<ScoredSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [registeredHosts, setRegisteredHosts] = useState<Set<string>>(new Set());
  const [savedUrls, setSavedUrls] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const noticeTimer = useRef<number | null>(null);
  const executedQuery = useRef<string | null>(null);
  const [resultSort, setResultSort] = useState<ResultSort>("newest");
  const [hideRegistered, setHideRegistered] = useState(true);
  const [resultSize, setResultSize] = useState<ResultSize>("standard");
  const [resultKind, setResultKind] = useState<ResultKind>("all");
  const [resultAvailability, setResultAvailability] = useState<ResultAvailability>("all");

  const [reader, setReader] = useState<{
    url: string;
    title: string;
    snippet: string;
    domain: string;
    publishedAt: string | null;
  } | null>(null);
  const [readerHtml, setReaderHtml] = useState<string | null>(null);
  const [readerFetching, setReaderFetching] = useState(false);
  const [readerError, setReaderError] = useState<string | null>(null);
  const fullTextFetchRef = useRef<string | null>(null);

  const existingHosts = new Set(
    feeds.flatMap((f) => [f.url, f.site_url ?? ""]).map(hostOf).filter(Boolean),
  );

  const isRegistered = (source: ScoredSource) => {
    const host = hostOf(source.url);
    return existingHosts.has(host) || registeredHosts.has(host);
  };

  const visibleResults = useMemo(() => {
    if (!results) return null;
    const q = query.trim().toLocaleLowerCase();
    const executed = executedQuery.current?.toLocaleLowerCase() ?? null;
    const liveFiltering = executed === null || q !== executed;
    const filtered = results.filter((source) => {
      if (hideRegistered && isRegistered(source)) return false;
      if (liveFiltering && q && !`${source.title} ${source.snippet} ${source.domain}`.toLocaleLowerCase().includes(q))
        return false;
      if (resultAvailability === "feed" && !source.feed_available) return false;
      if (resultAvailability === "noFeed" && source.feed_available) return false;
      if (resultKind !== "all") {
        const kindMatch =
          (resultKind === "personal" && source.reasons.includes("個人ブログ基盤")) ||
          (resultKind === "technical" && source.reasons.includes("技術記事プラットフォーム")) ||
          (resultKind === "academic" &&
            (source.reasons.includes("学術機関") || source.reasons.includes("論文"))) ||
          (resultKind === "qa" && source.reasons.includes("技術Q&A掲示板")) ||
          (resultKind === "developer" && source.reasons.includes("開発者一次情報"));
        if (!kindMatch) return false;
      }
      return true;
    });
    return [...filtered].sort((a, b) => {
      if (resultSort === "relevance") {
        return (
          relevanceOf(b, query) - relevanceOf(a, query) ||
          b.score - a.score ||
          b.bookmark_count - a.bookmark_count
        );
      }
      if (resultSort === "newest" || resultSort === "oldest") {
        const direction = resultSort === "newest" ? -1 : 1;
        const dateOrder = (b.published_at ?? "").localeCompare(a.published_at ?? "");
        if (dateOrder !== 0) return direction * dateOrder;
        return results.indexOf(a) - results.indexOf(b);
      }
      return b.score - a.score || b.bookmark_count - a.bookmark_count;
    });
  }, [results, query, resultSort, hideRegistered, resultKind, resultAvailability, feeds, registeredHosts]);

  useEffect(() => {
    if (categories.length > 0) return;
    invoke<SearchCategory[]>("list_search_categories")
      .then(setCategories)
      .catch(() => {
      });
  }, [categories.length]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setActiveCategory(null);
    executedQuery.current = query.trim();
    setResultSort("relevance");
    await runSearch(() => invoke<ScoredSource[]>("search_sources", { query: query.trim() }));
  }

  async function handleBrowseCategory(slug: string) {
    if (loading) return;
    setActiveCategory(slug);
    executedQuery.current = null;
    setResultSort("newest");
    await runSearch(() => invoke<ScoredSource[]>("browse_category", { category: slug }));
  }

  function handleReset() {
    setActiveCategory(null);
    executedQuery.current = null;
    setQuery("");
    setResults(null);
    setExpandedUrl(null);
    setError(null);
  }

  async function runSearch(run: () => Promise<ScoredSource[]>) {
    setLoading(true);
    setError(null);
    setResults(null);
    setExpandedUrl(null);
    try {
      setResults(await run());
    } catch (err) {
      setError(String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(source: ScoredSource) {
    if (!source.feed_available) return;
    setRegistering(source.url);
    setError(null);
    try {
      await addFeed(source.feed_url ?? source.url);
      setRegisteredHosts((prev) => new Set(prev).add(hostOf(source.url)));
      setNotice(`「${source.title}」をフィードに追加しました`);
      if (noticeTimer.current) window.clearTimeout(noticeTimer.current);
      noticeTimer.current = window.setTimeout(() => setNotice(null), 3000);
    } catch (err) {
      setError(String(err));
    } finally {
      setRegistering(null);
    }
  }

  async function loadSavedUrls() {
    try {
      const urls = await invoke<string[]>("list_saved_article_urls");
      setSavedUrls(new Set(urls));
    } catch {
    }
  }

  const activeScreen = useUiStore((s) => s.activeScreen);
  useEffect(() => {
    if (activeScreen === "discover") {
      loadSavedUrls();
    }
  }, [activeScreen]);

  useEffect(() => {
    if (activeScreen !== "discover") return;
    function onAuxClick(e: MouseEvent) {
      if (e.button === 3 && reader) {
        e.preventDefault();
        e.stopImmediatePropagation();
        fullTextFetchRef.current = null;
        setReader(null);
      }
    }
    window.addEventListener("auxclick", onAuxClick, true);
    return () => window.removeEventListener("auxclick", onAuxClick, true);
  }, [activeScreen, reader]);

  const legacyMigrated = useRef(false);
  useEffect(() => {
    if (legacyMigrated.current) return;
    legacyMigrated.current = true;
    const legacy: { url: string; title: string; domain: string }[] = [];
    for (const key of ["gyroscope:discovered-bookmarks", "gyroscope:discovered-stars"]) {
      try {
        const raw = JSON.parse(localStorage.getItem(key) ?? "[]");
        if (!Array.isArray(raw)) continue;
        for (const item of raw) {
          const url = typeof item === "string" ? item : item?.url;
          if (!url || legacy.some((l) => l.url === url)) continue;
          legacy.push({
            url,
            title: typeof item === "object" && item ? item.title ?? "" : "",
            domain: typeof item === "object" && item ? item.domain ?? "" : "",
          });
        }
      } catch {
      }
      localStorage.removeItem(key);
    }
    (async () => {
      for (const save of legacy) {
        try {
          await invoke("save_article", {
            url: save.url,
            title: save.title,
            domain: save.domain,
            snippet: "",
            thumbnailUrl: null,
          });
        } catch {
        }
      }
      if (legacy.length > 0) await loadSavedUrls();
    })();
  }, []);

  async function handleSaveArticle(source: ScoredSource) {
    const isSaved = savedUrls.has(source.url);
    const next = new Set(savedUrls);
    if (isSaved) next.delete(source.url);
    else next.add(source.url);
    setSavedUrls(next);
    try {
      if (isSaved) {
        await invoke("unsave_article", { url: source.url });
      } else {
        await invoke("save_article", {
          url: source.url,
          title: source.title,
          domain: source.domain,
          snippet: source.snippet ?? "",
          thumbnailUrl: source.thumbnail_url ?? null,
        });
      }
    } catch (err) {
      setSavedUrls(savedUrls);
      setError(String(err));
    }
  }

  async function handleReadFullText(source: ScoredSource) {
    setReader({
      url: source.url,
      title: source.title,
      snippet: source.snippet ?? "",
      domain: source.domain,
      publishedAt: source.published_at,
    });
    setReaderHtml(null);
    setReaderError(null);
    setReaderFetching(true);
    fullTextFetchRef.current = source.url;
    try {
      const result = await invoke<{ html: string }>("fetch_article_full_text", { url: source.url });
      if (fullTextFetchRef.current !== source.url) return;
      setReaderHtml(result.html);
    } catch (err) {
      if (fullTextFetchRef.current !== source.url) return;
      setReaderError(String(err));
    } finally {
      if (fullTextFetchRef.current === source.url) setReaderFetching(false);
    }
  }

  function handleReaderClick(e: React.MouseEvent<HTMLDivElement>) {
    const anchor = (e.target as HTMLElement).closest("a");
    if (!anchor) return;
    e.preventDefault();
    const href = anchor.getAttribute("href");
    if (href && HTTP_LINK_RE.test(href)) void openUrl(href);
  }

  const readerVars = readerStyleVariables({
    fontSize: readerFontSize,
    lineHeight: readerLineHeight,
    columnWidth: readerColumnWidth,
    fontFamily: readerFontFamily,
    codeFont: readerCodeFont,
    colors: readerColors,
  }) as React.CSSProperties;
  const keepOpacityStyle =
    reader && getSkin(skinId).floating && readerKeepOpacity ? ({ "--float-alpha": "1" } as React.CSSProperties) : undefined;

  return (
    <ScreenOverlay screen="discover" title="サイトを探す">
      <div ref={resultsScrollRef} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm">

        <section className="flex flex-col gap-1.5">
          <form onSubmit={handleSearch} className="flex min-w-0 gap-1">
            <ClearableInput
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="キーワードで検索"
              aria-label="キーワードで検索"
              clearLabel="検索をクリア"
              onClear={() => setQuery("")}
              wrapperClassName="min-w-0 flex-1"
              className="w-full rounded border border-black/10 bg-black/5 px-2 py-1.5 text-xs outline-none placeholder:opacity-50 dark:border-white/10 dark:bg-white/5"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="accent-bg rounded px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90 active:opacity-80 disabled:opacity-50"
            >
              {loading ? "検索中..." : "検索"}
            </button>
          </form>
          <div className="flex flex-wrap items-center gap-1">
            <button
              type="button"
              onClick={handleReset}
              className={`rounded-full px-2.5 py-1 text-xs transition-colors duration-150 ${
                activeCategory === null
                  ? "accent-bg-soft accent-text font-medium"
                  : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
              }`}
            >
              すべて
            </button>
            {categories.map((c) => (
              <button
                key={c.slug}
                type="button"
                onClick={() => handleBrowseCategory(c.slug)}
                disabled={loading}
                className={`rounded-full px-2.5 py-1 text-xs transition-colors duration-150 disabled:opacity-50 ${
                  activeCategory === c.slug
                    ? "accent-bg-soft accent-text font-medium"
                    : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                }`}
              >
                {c.label}
              </button>
            ))}
          </div>
        </section>

        {/* 結果ツールバー */}
        {results !== null && !loading && (
          <section className="flex flex-col gap-1.5 rounded bg-black/[0.025] p-2 dark:bg-white/[0.025]">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              <span className="text-[10px] opacity-60">並び順</span>
              <div className="segmented flex gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
                {SORTS.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setResultSort(value)}
                    aria-pressed={resultSort === value}
                    className={`rounded px-1.5 py-0.5 text-xs transition-colors duration-150 ${
                      resultSort === value ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="text-[10px] opacity-60">サイズ</span>
              <div className="segmented flex gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
                {SIZES.map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => setResultSize(value)}
                    aria-pressed={resultSize === value}
                    className={`rounded px-1.5 py-0.5 text-xs transition-colors duration-150 ${
                      resultSize === value ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <label className="flex shrink-0 items-center gap-1 text-[10px] opacity-70">
                <input
                  type="checkbox"
                  checked={hideRegistered}
                  onChange={(e) => setHideRegistered(e.target.checked)}
                  className="checkbox-input h-3 w-3"
                />
                登録済みを隠す
              </label>
              <span className="ml-auto shrink-0 text-[10px] opacity-60">
                {visibleResults?.length ?? 0}件 / 全{results.length}件
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] opacity-60">記事の種類</span>
              {KINDS.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setResultKind(value)}
                  aria-pressed={resultKind === value}
                  className={`rounded-full px-2 py-1 text-xs transition-colors ${
                    resultKind === value
                      ? "accent-bg-soft accent-text font-medium"
                      : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-1">
              <span className="text-[10px] opacity-60">候補の状態</span>
              {AVAILABILITIES.map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setResultAvailability(value)}
                  aria-pressed={resultAvailability === value}
                  className={`rounded-full px-2 py-1 text-xs transition-colors ${
                    resultAvailability === value
                      ? "accent-bg-soft accent-text font-medium"
                      : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                  }`}
                >
                  {label}
                </button>
              ))}
            </div>
          </section>
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
        {notice && (
          <p
            className="rounded bg-emerald-500/15 px-3 py-2 text-xs font-medium text-emerald-800 dark:text-emerald-300"
            role="status"
          >
            {notice}
          </p>
        )}
        {loading && <p className="text-xs opacity-60">読み込み中...</p>}

        {results === null && !loading && (
          <p className="rounded border border-dashed border-black/15 px-3 py-8 text-center text-xs opacity-50 dark:border-white/15">
            キーワードを入力するか、ジャンルを選ぶとサイトを探せます
          </p>
        )}

        {results !== null &&
          !loading &&
          ((visibleResults?.length ?? 0) === 0 ? (
            <p className="rounded border border-dashed border-black/15 px-3 py-6 text-center text-xs opacity-50 dark:border-white/15">
              {results.length === 0
                ? "フィードを持つサイトが見つかりませんでした"
                : "条件に合うサイトがありません。絞り込み条件を変えてください"}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visibleResults?.map((source) => {
                const already = isRegistered(source);
                const expanded = expandedUrl === source.url;
                const thumbSize =
                  resultSize === "compact" ? "h-8 w-8" : resultSize === "large" ? "h-14 w-14" : "h-10 w-10";
  async function handleOpenArticle(source: ScoredSource) {
    await openUrl(source.url);
    try {
      await invoke("record_external_read", {
        url: source.url,
        title: source.title,
        feedTitle: source.domain,
      });
    } catch {
    }
  }

  return (
                  <li
                    key={source.url}
                    className="entry-card flex flex-col overflow-hidden rounded-lg border border-black/5 bg-black/[0.03] transition duration-150 hover:bg-black/[0.06] active:scale-[0.98] active:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] dark:active:bg-white/10"
                  >

                    <div className="flex w-full items-start gap-2">
                      <button
                        type="button"
                        aria-expanded={expanded}
                        onClick={() => setExpandedUrl(expanded ? null : source.url)}
                        className={`flex min-w-0 flex-1 cursor-pointer items-start gap-2 rounded px-2 text-left ${
                          resultSize === "compact" ? "py-1" : resultSize === "large" ? "py-2.5" : "py-1.5"
                        }`}
                      >
                      {source.thumbnail_url ? (
                        <img
                          src={source.thumbnail_url}
                          alt=""
                          className={`${thumbSize} shrink-0 rounded object-cover`}
                        />
                      ) : (
                        <div className={`${thumbSize} flex shrink-0 items-center justify-center rounded bg-black/5 dark:bg-white/5`}>
                          <ImageOffIcon className="h-1/2 w-1/2 opacity-40" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <MarqueeTitle
                          text={source.title}
                          textClassName={`font-medium leading-snug ${
                            resultSize === "compact" ? "text-xs" : resultSize === "large" ? "text-base" : "text-sm"
                          }`}
                        />

                        <div className="accent-text mt-0.5 truncate text-xs">{source.domain}</div>
                        <div className="mt-1 flex flex-wrap items-center gap-1">
                          <span
                            className={`rounded px-1 text-[10px] font-medium ${
                              source.feed_available
                                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300"
                                : "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300"
                            }`}
                          >
                            {source.feed_available ? "RSS登録可" : "RSSなし"}
                          </span>
                          {already && <span className="text-[10px] opacity-50">登録済み</span>}
                        </div>
                        {source.reasons.filter((reason) => !NOISE_REASON.test(reason)).length > 0 && (
                          <div className="mt-1 flex flex-wrap gap-1">
                            {source.reasons
                              .filter((reason) => !NOISE_REASON.test(reason))
                              .map((reason) => (
                                <span
                                  key={reason}
                                  className="accent-bg-soft accent-text rounded px-1 text-[10px] font-medium opacity-80"
                                >
                                  {reason}
                                </span>
                              ))}
                          </div>
                        )}
                      </div>
                      </button>
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleSaveArticle(source);
                        }}
                        className={`shrink-0 rounded p-1 transition-colors duration-150 active:bg-black/10 dark:active:bg-white/10 ${
                          savedUrls.has(source.url)
                            ? "accent-text"
                            : "opacity-50 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
                        }`}
                        aria-label={savedUrls.has(source.url) ? "ブックマークを外す" : "ブックマークする"}
                        aria-pressed={savedUrls.has(source.url)}
                      >
                        <StarIcon filled={savedUrls.has(source.url)} className="h-4 w-4" />
                      </button>
                    </div>

                    {expanded && (
                      <div className="flex flex-col gap-2 border-t border-black/10 px-2 py-2 dark:border-white/10">
                        {source.thumbnail_url && (
                          <img
                            src={source.thumbnail_url}
                            alt=""
                            className="max-h-40 w-full rounded object-cover"
                          />
                        )}
                        {source.snippet && <p className="text-xs opacity-80">{source.snippet}</p>}

                        <button
                          type="button"
                          onClick={() => handleReadFullText(source)}
                          className="accent-bg w-full rounded px-2 py-1 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90 active:opacity-80"
                        >
                          この記事の全文を読む
                        </button>
                        <div className="flex gap-1">
<button
            type="button"
            onClick={() => handleOpenArticle(source)}
            title="既定のブラウザで開く"
            className="flex flex-1 items-center justify-center gap-1 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
          >
            <ExternalLinkIcon className="h-3.5 w-3.5" />
            ブラウザで開く
          </button>
                          <button
                            type="button"
                            onClick={() => handleRegister(source)}
                            disabled={!source.feed_available || already || registering === source.url}
                            className="flex-1 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
                          >
                            {!source.feed_available
                              ? "RSSなし"
                              : already
                                ? "登録済み"
                                : registering === source.url
                                  ? "..."
                                  : "フィード登録"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveArticle(source)}
                            className="accent-bg-soft accent-text flex-1 rounded px-2 py-1 text-xs transition-opacity duration-150 hover:opacity-80 active:opacity-60"
                          >
                            {savedUrls.has(source.url) ? "保存を解除" : "記事を保存"}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}

        <p className="text-center text-[10px] opacity-40">
          検索結果は「はてなブックマーク」のデータを使用しています
        </p>
      </div>


      {reader && (
        <div style={keepOpacityStyle} className="panel-bg absolute inset-0 z-20 flex flex-col p-3">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                fullTextFetchRef.current = null;
                setReader(null);
              }}
              aria-label="全文表示を閉じる"
              className="shrink-0 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
            >
              ← 結果に戻る
            </button>
            <div className="min-w-0 flex-1">
              <MarqueeTitle text={reader.title} textClassName="text-sm font-semibold" />
              <div className="accent-text mt-0.5 truncate text-xs">{reader.domain}</div>
            </div>

            <button
              type="button"
              onClick={() => void openUrl(reader.url)}
              title="既定のブラウザで開く"
              className="flex shrink-0 items-center gap-1 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
            >
              <ExternalLinkIcon className="h-3.5 w-3.5" />
              ブラウザで開く
            </button>
          </div>
          <div ref={readerScrollRef} style={readerVars} className="mt-3 min-h-0 flex-1 overflow-y-auto">
            {readerFetching && (
              <p className="mb-2 text-xs opacity-60" role="status">
                全文を取得中...
              </p>
            )}
            {readerError && (
              <div className="flex flex-col gap-2">
                <p className="text-xs text-red-500">{readerError}</p>
                <button
                  type="button"
                  onClick={() => void openUrl(reader.url)}
                  title="既定のブラウザで開く"
                  className="flex w-fit items-center gap-1 rounded bg-black/10 px-3 py-1.5 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
                >
                  <ExternalLinkIcon className="h-3.5 w-3.5" />
                  ブラウザで開く
                </button>
              </div>
            )}
            {readerHtml ? (
              <div className="reader-column">
                <h1 className="text-base font-semibold">{reader.title}</h1>
                <p className="mt-1 text-xs opacity-60">{formatPublished(reader.publishedAt)}</p>
                <div
                  className="reader-content mt-3 max-w-none text-sm"
                  onClick={handleReaderClick}
                  dangerouslySetInnerHTML={{ __html: sanitizeArticleHtml(readerHtml, blockImages) }}
                />
              </div>
            ) : (
              !readerError &&
              reader.snippet && (
                <div className="reader-column">
                  <h1 className="text-base font-semibold">{reader.title}</h1>
                  <p className="mt-1 text-xs opacity-60">{formatPublished(reader.publishedAt)}</p>
                  <div className="reader-content mt-3 max-w-none text-sm">
                    <p className="whitespace-pre-wrap">{reader.snippet}</p>
                  </div>
                </div>
              )
            )}
          </div>
        </div>
      )}
    </ScreenOverlay>
  );
}
