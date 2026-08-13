import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useFeedsStore } from "../stores/feedsStore";
import type { ScoredSource, SearchCategory } from "../lib/types";
import { ScreenOverlay } from "./ScreenOverlay";
import { ImageOffIcon } from "./icons";

type Mode = "keyword" | "category";

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

  const [mode, setMode] = useState<Mode>("keyword");
  const [query, setQuery] = useState("");
  const [categories, setCategories] = useState<SearchCategory[]>([]);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);

  const [results, setResults] = useState<ScoredSource[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedUrl, setExpandedUrl] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [registeredUrls, setRegisteredUrls] = useState<Set<string>>(new Set());

  const existingUrls = new Set(feeds.map((f) => f.url));

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

  return (
    <ScreenOverlay screen="discover" title="サイトを探す">
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3 text-sm">
        <div className="segmented flex gap-0.5 self-start rounded bg-black/5 p-0.5 dark:bg-white/5">
          <button
            type="button"
            onClick={() => setMode("keyword")}
            className={`rounded px-2 py-1 text-xs transition-colors duration-150 ${
              mode === "keyword" ? "accent-bg-soft accent-text" : "opacity-60 hover:opacity-100"
            }`}
          >
            キーワード
          </button>
          <button
            type="button"
            onClick={() => setMode("category")}
            className={`rounded px-2 py-1 text-xs transition-colors duration-150 ${
              mode === "category" ? "accent-bg-soft accent-text" : "opacity-60 hover:opacity-100"
            }`}
          >
            ジャンル
          </button>
        </div>

        {mode === "keyword" ? (
          <form onSubmit={handleSearch} className="flex gap-1">
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="キーワードで検索"
              className="min-w-0 flex-1 rounded border border-black/10 bg-black/5 px-2 py-1 text-xs outline-none dark:border-white/10 dark:bg-white/5"
            />
            <button
              type="submit"
              disabled={loading || !query.trim()}
              className="rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
            >
              {loading ? "検索中..." : "検索"}
            </button>
          </form>
        ) : (
          <div className="flex flex-wrap gap-1">
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
        )}

        {error && <p className="text-xs text-red-500">{error}</p>}
        {loading && <p className="text-xs opacity-60">読み込み中...</p>}

        {results !== null &&
          !loading &&
          (results.length === 0 ? (
            <p className="rounded border border-dashed border-black/15 px-3 py-6 text-center text-xs opacity-50 dark:border-white/15">
              フィードを持つサイトが見つかりませんでした
            </p>
          ) : (
            <ul className="flex flex-col gap-1">
              {results.map((source) => {
                const already = existingUrls.has(source.url) || registeredUrls.has(source.url);
                const expanded = expandedUrl === source.url;
                return (
                  <li
                    key={source.url}
                    className="flex flex-col overflow-hidden rounded border border-transparent transition-colors duration-150 hover:border-black/10 dark:hover:border-white/10"
                  >
                    <button
                      type="button"
                      onClick={() => setExpandedUrl(expanded ? null : source.url)}
                      className="flex w-full items-start gap-2 rounded px-2 py-1.5 text-left transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
                      aria-expanded={expanded}
                    >
                      {source.thumbnail_url ? (
                        <img
                          src={source.thumbnail_url}
                          alt=""
                          className="h-10 w-10 shrink-0 rounded object-cover"
                        />
                      ) : (
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded bg-black/5 dark:bg-white/5">
                          <ImageOffIcon className="h-1/2 w-1/2 opacity-40" />
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-xs font-medium">{source.title}</div>
                        <div className="truncate text-[10px] opacity-50">{source.domain}</div>
                        {source.reasons.length > 0 && (
                          <div className="mt-0.5 flex flex-wrap gap-1">
                            {source.reasons.map((reason) => (
                              <span
                                key={reason}
                                className="accent-bg-soft accent-text rounded px-1 text-[10px] font-medium"
                              >
                                {reason}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
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
                            disabled={already || registering === source.url}
                            className="flex-1 rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
                          >
                            {already ? "登録済み" : registering === source.url ? "..." : "登録"}
                          </button>
                        </div>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          ))}
      </div>
    </ScreenOverlay>
  );
}
