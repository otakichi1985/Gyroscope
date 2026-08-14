import { useEffect, useMemo, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useFeedsStore } from "../stores/feedsStore";
import type { ScoredSource, SearchCategory } from "../lib/types";
import { ScreenOverlay } from "./ScreenOverlay";
import { ImageOffIcon, StarIcon } from "./icons";

type Mode = "all" | "category";
type ResultSort = "recommended" | "newest" | "oldest";
type ResultSize = "compact" | "standard" | "large";
type ResultKind = "all" | "personal" | "technical" | "academic" | "qa" | "developer";
type ResultAvailability = "all" | "feed" | "article" | "noFeed";

/**
 * "探す" screen: finds candidate *sites* to subscribe to, as a discovery
 * step distinct from the timeline's own genre/folder filter (FeedPicker) --
 * that filter re-sorts sites you've already vetted, this finds ones you
 * haven't yet. Two entry points into the same feed-gated/policy-scored
 * pipeline (`commands::search::rank_hits`): a keyword search for something
 * specific in mind, or browsing one of Hatena Bookmark's fixed categories
 * for passive, serendipitous discovery.
 *
 * Every result is already confirmed to have a discoverable feed
 * (backend-gated), so "登録" always succeeds via the same `add_feed` path
 * used everywhere else -- but registering directly off a one-line snippet
 * isn't enough to judge a site by (user feedback), so a result has to be
 * expanded into its preview (thumbnail, full snippet, a link to open the
 * actual article) before the register button appears. An in-app article
 * viewer was considered for this preview step but deferred -- see
 * `IDEAS_AND_HYPOTHESES.md` -- so "元記事を開く" hands off to the system
 * browser instead of embedding one.
 */
export function DiscoverOverlay() {
  const { addFeed, feeds } = useFeedsStore();

  const [mode, setMode] = useState<Mode>("category");
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<SearchCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [results, setResults] = useState<ScoredSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [registeredUrls, setRegisteredUrls] = useState<Set<string>>(new Set());
  const [savedUrls, setSavedUrls] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("gyroscope:discovered-bookmarks") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [starredUrls, setStarredUrls] = useState<Set<string>>(() => {
    try {
      return new Set(JSON.parse(localStorage.getItem("gyroscope:discovered-stars") ?? "[]"));
    } catch {
      return new Set();
    }
  });
  const [resultSort, setResultSort] = useState<ResultSort>("newest");
  const [hideRegistered, setHideRegistered] = useState(true);
  const [resultSize, setResultSize] = useState<ResultSize>("standard");
  const [resultKind, setResultKind] = useState<ResultKind>("all");
  const [resultAvailability, setResultAvailability] = useState<ResultAvailability>("all");

  const existingUrls = new Set(feeds.map((f) => f.url));

  const visibleResults = useMemo(() => {
    if (!results) return null;
    const registered = (source: ScoredSource) =>
      existingUrls.has(source.url) || registeredUrls.has(source.url);
    const filtered = results.filter(
      (source) =>
        (!activeCategory || !query.trim() ||
          `${source.title} ${source.snippet} ${source.domain}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())) &&
        (!hideRegistered || !registered(source)) &&
        (resultAvailability === "all" ||
          (resultAvailability === "feed" && source.feed_available) ||
          (resultAvailability === "article") ||
          (resultAvailability === "noFeed" && !source.feed_available)) &&
        (resultKind === "all" ||
          (resultKind === "personal" && source.reasons.includes("個人ブログ基盤")) ||
          (resultKind === "technical" && source.reasons.includes("技術記事プラットフォーム")) ||
          (resultKind === "academic" &&
            (source.reasons.includes("学術機関") || source.reasons.includes("論文"))) ||
          (resultKind === "qa" && source.reasons.includes("技術Q&A掲示板")) ||
          (resultKind === "developer" && source.reasons.includes("開発者一次情報"))),
    );
    return [...filtered].sort((a, b) => {
      if (resultSort === "newest" || resultSort === "oldest") {
        const direction = resultSort === "newest" ? -1 : 1;
        const dateOrder = (b.published_at ?? "").localeCompare(a.published_at ?? "");
        if (dateOrder !== 0) return direction * dateOrder;
        return results.indexOf(a) - results.indexOf(b);
      }
      return b.score - a.score || b.bookmark_count - a.bookmark_count;
    });
  }, [results, resultSort, hideRegistered, resultKind, resultAvailability, activeCategory, query, feeds, registeredUrls]);

  useEffect(() => {
    if (categories.length > 0) return;
    invoke<SearchCategory[]>("list_search_categories")
      .then(setCategories)
      .catch(() => {
        // Non-fatal: the category picker just stays empty and keyword
        // search (the default mode) is unaffected.
      });
  }, [categories.length]);

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || loading) return;
    setActiveCategory(null);
    await runSearch(() => invoke<ScoredSource[]>("search_sources", { query: query.trim() }));
  }

  async function handleBrowseCategory(slug: string) {
    if (loading) return;
    setActiveCategory(slug);
    await runSearch(() => invoke<ScoredSource[]>("browse_category", { category: slug }));
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
      await addFeed(source.url);
      setRegisteredUrls((prev) => new Set(prev).add(source.url));
    } catch (err) {
      setError(String(err));
    } finally {
      setRegistering(null);
    }
  }

  function handleSaveArticle(source: ScoredSource) {
    const next = new Set(savedUrls);
    if (next.has(source.url)) next.delete(source.url);
    else next.add(source.url);
    setSavedUrls(next);
    localStorage.setItem("gyroscope:discovered-bookmarks", JSON.stringify([...next]));
  }

  function handleToggleStar(source: ScoredSource) {
    const next = new Set(starredUrls);
    if (next.has(source.url)) next.delete(source.url);
    else next.add(source.url);
    setStarredUrls(next);
    localStorage.setItem("gyroscope:discovered-stars", JSON.stringify([...next]));
  }

  function cycleSort() {
    const orders: ResultSort[] = ["recommended", "newest", "oldest"];
    setResultSort(orders[(orders.indexOf(resultSort) + 1) % orders.length]);
  }

  function cycleSize() {
    const sizes: ResultSize[] = ["standard", "compact", "large"];
    setResultSize(sizes[(sizes.indexOf(resultSize) + 1) % sizes.length]);
  }

  return (
    <ScreenOverlay screen="discover" title="サイトを探す">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm">
        <section>
          <div className="flex flex-col gap-1.5">
        {mode === "all" ? (
          <form onSubmit={handleSearch} className="flex min-w-0 gap-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="キーワードで検索"
              className="min-w-0 flex-1 rounded border border-black/15 bg-white/80 px-2 py-1.5 text-xs outline-none transition-shadow placeholder:opacity-50 focus:border-transparent focus:ring-2 focus:ring-amber-400/60 dark:border-white/15 dark:bg-white/10"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="accent-bg accent-text rounded px-3 py-1.5 text-xs font-medium transition-opacity duration-150 hover:opacity-90 active:opacity-75 disabled:opacity-50"
            >
              {loading ? "検索中..." : "検索"}
            </button>
            {results !== null && <button type="button" onClick={cycleSort} className="rounded p-1.5 text-xs opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5" title="並び順を変更" aria-label="並び順を変更">↕</button>}
            <button type="button" onClick={cycleSize} className="rounded p-1.5 text-xs opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5" title="表示サイズを変更" aria-label="表示サイズを変更">▦</button>
          </form>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex min-w-0 gap-1">
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="このジャンルをキーワードで絞り込み"
                className="min-w-0 flex-1 rounded border border-black/15 bg-white/80 px-2 py-1.5 text-xs outline-none transition-shadow placeholder:opacity-50 focus:border-transparent focus:ring-2 focus:ring-amber-400/60 dark:border-white/15 dark:bg-white/10"
                aria-label="ジャンル内キーワード検索"
              />
              {results !== null && <button type="button" onClick={cycleSort} className="rounded p-1.5 text-xs opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5" title="並び順を変更" aria-label="並び順を変更">↕</button>}
              <button type="button" onClick={cycleSize} className="rounded p-1.5 text-xs opacity-60 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5" title="表示サイズを変更" aria-label="表示サイズを変更">▦</button>
            </div>
            <div className="flex flex-wrap gap-1">
              <button type="button" onClick={() => setMode("all")} className="rounded-full bg-black/5 px-2.5 py-1 text-xs transition-colors hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10">すべて</button>
              {categories.map((c) => (
                <button
                  key={c.slug}
                  type="button"
                  onClick={() => handleBrowseCategory(c.slug)}
                  disabled={loading}
                  className={`rounded-full px-2.5 py-1 text-xs transition-colors duration-150 disabled:opacity-50 ${
                    activeCategory === c.slug
                      ? "accent-bg-soft accent-text"
                      : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        )}
          </div>
        </section>

        <section className="flex flex-col gap-1.5">
          <div className="flex flex-col gap-1.5">
        <div className="rounded bg-black/[0.025] p-1.5 text-[10px] dark:bg-white/[0.025]">
          <div className="mb-1 opacity-60">記事の種類</div>
          <div className="flex flex-wrap gap-1">
            {([["all", "すべて"], ["personal", "個人ブログ基盤"], ["technical", "技術記事"], ["academic", "学術・論文"], ["qa", "技術Q&A"], ["developer", "開発者一次情報"]] as [ResultKind, string][]).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setResultKind(value)} className={`rounded-full px-2 py-1 transition-colors ${resultKind === value ? "accent-bg-soft accent-text" : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"}`} aria-pressed={resultKind === value}>{label}</button>
            ))}
          </div>
        </div>
        <div className="rounded bg-black/[0.025] p-1.5 text-[10px] dark:bg-white/[0.025]">
          <div className="mb-1 opacity-60">候補の状態</div>
          <div className="flex flex-wrap gap-1">
            {([["all", "すべて"], ["feed", "RSS登録可"], ["article", "記事保存可"], ["noFeed", "RSSなし"]] as [ResultAvailability, string][]).map(([value, label]) => (
              <button key={value} type="button" onClick={() => setResultAvailability(value)} className={`rounded-full px-2 py-1 transition-colors ${resultAvailability === value ? value === "feed" ? "bg-emerald-500/20 text-emerald-700 dark:text-emerald-300" : value === "noFeed" ? "bg-neutral-600/30 text-neutral-900 ring-1 ring-neutral-500/60 dark:bg-neutral-300/25 dark:text-neutral-100 dark:ring-neutral-300/60" : value === "article" ? "bg-amber-500/20 text-amber-700 dark:text-amber-300" : "accent-bg-soft accent-text" : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"}`} aria-pressed={resultAvailability === value}>{label}</button>
            ))}
          </div>
        </div>
          </div>
        </section>

        {error && <p className="text-xs text-red-500">{error}</p>}
        {loading && <p className="text-xs opacity-60">読み込み中...</p>}

        {results !== null &&
          !loading &&
          <>
            <section className="hidden">
              <div className="flex min-w-0 flex-wrap items-center gap-1.5 rounded border border-black/10 bg-black/[0.025] p-1.5 text-[10px] dark:border-white/10 dark:bg-white/[0.025]">
              <span className="shrink-0 px-1 opacity-60">
                {visibleResults?.length ?? 0}件 / 全{results.length}件
              </span>
              <div className="flex shrink-0 items-center gap-1 rounded bg-black/5 px-1.5 py-1 dark:bg-white/5">
                <span className="opacity-60" title="並び順" aria-label="並び順">↕</span>
                {([["recommended", "おすすめ"], ["newest", "新着"], ["oldest", "古い"]] as [ResultSort, string][]).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setResultSort(value)} className={`rounded-full px-1.5 py-0.5 font-medium ${resultSort === value ? "accent-bg-soft accent-text" : "hover:bg-black/10 dark:hover:bg-white/10"}`} aria-pressed={resultSort === value}>{label}</button>
                ))}
              </div>
              <label className="flex shrink-0 items-center gap-1 rounded bg-black/5 px-1.5 py-1 dark:bg-white/5">
                <input
                  type="checkbox"
                  checked={hideRegistered}
                  onChange={(e) => setHideRegistered(e.target.checked)}
                />
                登録済みを隠す
              </label>
              <div className="flex shrink-0 items-center gap-1 rounded bg-black/5 px-1.5 py-1 dark:bg-white/5">
                <span className="opacity-60" title="表示サイズ" aria-label="表示サイズ">▦</span>
                {([["compact", "小"], ["standard", "標準"], ["large", "大"]] as [ResultSize, string][]).map(([value, label]) => (
                  <button key={value} type="button" onClick={() => setResultSize(value)} className={`rounded-full px-1.5 py-0.5 font-medium ${resultSize === value ? "accent-bg-soft accent-text" : "hover:bg-black/10 dark:hover:bg-white/10"}`} aria-pressed={resultSize === value}>{label}</button>
                ))}
              </div>
              </div>
            </section>
            {(visibleResults?.length ?? 0) === 0 ? (
            <p className="rounded border border-dashed border-black/15 px-3 py-6 text-center text-xs opacity-50 dark:border-white/15">
              {results.length === 0
                ? "フィードを持つサイトが見つかりませんでした"
                : "条件に合うサイトがありません。絞り込み条件を変えてください"}
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {visibleResults?.map((source) => {
                const already = existingUrls.has(source.url) || registeredUrls.has(source.url);
                const expanded = expandedUrl === source.url;
                return (
                  <li
                    key={source.url}
                    className="flex flex-col overflow-hidden rounded-lg border border-black/5 bg-white/25 p-0.5 transition-colors duration-150 hover:border-black/15 hover:bg-white/40 dark:border-white/5 dark:bg-white/[0.025] dark:hover:border-white/15 dark:hover:bg-white/[0.05]"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedUrl(expanded ? null : source.url)}
                      className={`flex w-full items-start gap-2 rounded px-2 text-left transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5 ${
                        resultSize === "compact" ? "py-1" : resultSize === "large" ? "py-2.5" : "py-1.5"
                      }`}
                      aria-expanded={expanded}
                    >
                      {source.thumbnail_url ? (
                        <img
                          src={source.thumbnail_url}
                          alt=""
                          className={`shrink-0 rounded object-cover ${
                            resultSize === "compact" ? "h-8 w-8" : resultSize === "large" ? "h-14 w-14" : "h-10 w-10"
                          }`}
                        />
                      ) : (
                        <div className={`flex shrink-0 items-center justify-center rounded bg-black/5 dark:bg-white/5 ${
                          resultSize === "compact" ? "h-8 w-8" : resultSize === "large" ? "h-14 w-14" : "h-10 w-10"
                        }`}>
                          <ImageOffIcon className="h-1/2 w-1/2 opacity-40" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 text-[10px] font-medium uppercase tracking-wide opacity-50">
                          記事
                        </div>
                        <div className="truncate text-sm font-medium leading-snug">{source.title}</div>
                        <div className="mt-1 truncate text-[10px] opacity-55">
                          提供元: <span className="font-medium">{source.domain}</span>
                        </div>
                        <div className="mt-1 flex flex-wrap gap-1">
                          <span className={`rounded px-1 text-[10px] font-medium ${source.feed_available ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-300" : "bg-neutral-500/15 text-neutral-600 dark:text-neutral-300"}`}>
                            {source.feed_available ? "RSS登録可" : "RSSなし"}
                          </span>
                          <span className="rounded bg-amber-500/15 px-1 text-[10px] font-medium text-amber-700 dark:text-amber-300">
                            {savedUrls.has(source.url) ? "記事保存済み" : "記事保存可"}
                          </span>
                        </div>
                        {source.reasons.filter((reason) => !/users以上ブックマーク$/.test(reason)).length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {source.reasons.filter((reason) => !/users以上ブックマーク$/.test(reason)).map((reason) => (
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
                      <button
                        type="button"
                        onClick={(event) => {
                          event.stopPropagation();
                          handleToggleStar(source);
                        }}
                        className={`shrink-0 rounded p-1 transition-colors ${
                          starredUrls.has(source.url)
                            ? "text-amber-500"
                            : "opacity-50 hover:bg-black/5 hover:opacity-100 dark:hover:bg-white/5"
                        }`}
                        aria-label={starredUrls.has(source.url) ? "ブックマークを外す" : "ブックマークする"}
                        aria-pressed={starredUrls.has(source.url)}
                      >
                        <StarIcon filled={starredUrls.has(source.url)} className="h-4 w-4" />
                      </button>
                      {already && <span className="shrink-0 text-[10px] opacity-50">登録済み</span>}
                    </button>

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
                        <div className="flex gap-1">
                          <button
                            type="button"
                            onClick={() => openUrl(source.url)}
                            className="flex-1 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
                          >
                            元記事を開く
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRegister(source)}
                            disabled={!source.feed_available || already || registering === source.url}
                            className="flex-1 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
                          >
                            {!source.feed_available ? "RSSなし" : already ? "登録済み" : registering === source.url ? "..." : "フィード登録"}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSaveArticle(source)}
                            className="flex-1 rounded bg-amber-500/15 px-2 py-1 text-xs text-amber-800 transition-colors duration-150 hover:bg-amber-500/25 active:bg-amber-500/30 dark:text-amber-200"
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
          )}
          </>
        }
      </div>
    </ScreenOverlay>
  );
}
