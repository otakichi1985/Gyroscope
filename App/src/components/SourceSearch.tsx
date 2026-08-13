import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { useFeedsStore } from "../stores/feedsStore";
import type { ScoredSource } from "../lib/types";

/**
 * Search for subscribable *sources*, not individual articles: results are
 * already feed-gated by the backend (`commands::search::search_sources`
 * only returns domains a feed was actually found for), so every "登録"
 * button here is expected to succeed via the same `add_feed` path as the
 * manual URL field above it.
 */
export function SourceSearch() {
  const { addFeed, feeds } = useFeedsStore();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<ScoredSource[] | null>(null);
  const [searching, setSearching] = useState(false);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [registering, setRegistering] = useState<string | null>(null);
  const [registeredUrls, setRegisteredUrls] = useState<Set<string>>(new Set());

  const existingUrls = new Set(feeds.map((f) => f.url));

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim() || searching) return;
    setSearching(true);
    setSearchError(null);
    setResults(null);
    try {
      const found = await invoke<ScoredSource[]>("search_sources", { query: query.trim() });
      setResults(found);
    } catch (err) {
      setSearchError(String(err));
    } finally {
      setSearching(false);
    }
  }

  async function handleRegister(source: ScoredSource) {
    setRegistering(source.url);
    setSearchError(null);
    try {
      await addFeed(source.url);
      setRegisteredUrls((prev) => new Set(prev).add(source.url));
    } catch (err) {
      setSearchError(String(err));
    } finally {
      setRegistering(null);
    }
  }

  return (
    <div className="flex flex-col gap-1.5 rounded border border-black/10 p-2 dark:border-white/10">
      <div className="text-xs font-medium opacity-70">サイトを検索して登録</div>
      <form onSubmit={handleSearch} className="flex gap-1">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="キーワードで検索"
          className="min-w-0 flex-1 rounded border border-black/10 bg-black/5 px-2 py-1 text-xs outline-none dark:border-white/10 dark:bg-white/5"
        />
        <button
          type="submit"
          disabled={searching || !query.trim()}
          className="rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
        >
          {searching ? "検索中..." : "検索"}
        </button>
      </form>
      {searchError && <p className="text-xs text-red-500">{searchError}</p>}

      {results !== null &&
        (results.length === 0 ? (
          <p className="rounded border border-dashed border-black/15 px-3 py-4 text-center text-xs opacity-50 dark:border-white/15">
            フィードを持つサイトが見つかりませんでした
          </p>
        ) : (
          <ul className="flex flex-col gap-1">
            {results.map((source) => {
              const already = existingUrls.has(source.url) || registeredUrls.has(source.url);
              return (
                <li
                  key={source.url}
                  className="flex flex-col gap-1 rounded px-2 py-1.5 transition-colors duration-150 hover:bg-black/5 dark:hover:bg-white/5"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="truncate text-xs font-medium">{source.title}</div>
                      <div className="truncate text-[10px] opacity-50">{source.domain}</div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRegister(source)}
                      disabled={already || registering === source.url}
                      className="shrink-0 rounded bg-black/10 px-2 py-0.5 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 disabled:opacity-50 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
                    >
                      {already ? "登録済み" : registering === source.url ? "..." : "登録"}
                    </button>
                  </div>
                  {source.snippet && <p className="truncate text-[10px] opacity-60">{source.snippet}</p>}
                  {source.reasons.length > 0 && (
                    <div className="flex flex-wrap gap-1">
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
                </li>
              );
            })}
          </ul>
        ))}
    </div>
  );
}
