import type { ScoredSource } from "./types";

export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

export function relevanceOf(source: ScoredSource, query: string): number {
  const tokens = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 0;
  const title = source.title.toLocaleLowerCase();
  const snippet = (source.snippet ?? "").toLocaleLowerCase();
  const domain = source.domain.toLocaleLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (title.includes(token)) score += 3;
    if (snippet.includes(token)) score += 1;
    if (domain.includes(token)) score += 2;
  }
  return score;
}

export type ResultSort = "relevance" | "recommended" | "bookmarks" | "newest" | "oldest";
export type ResultKind = "all" | "personal" | "technical" | "academic" | "qa" | "developer";
export type ResultAvailability = "all" | "feed" | "noFeed";

// Bookmark-count floors offered in the UI. They line up with the backend's
// bookmark_boost tiers (5 / 20 / 50) plus a stricter 100.
export const MIN_BOOKMARK_OPTIONS = [0, 5, 20, 50, 100] as const;

export interface ArrangeOptions {
  sort: ResultSort;
  // Query used for relevance ordering.
  query: string;
  // When set, results are additionally narrowed to ones containing this text.
  liveFilter: string;
  minBookmarks: number;
  hideRegistered: boolean;
  isRegistered: (source: ScoredSource) => boolean;
  kind: ResultKind;
  availability: ResultAvailability;
}

function matchesKind(source: ScoredSource, kind: ResultKind): boolean {
  switch (kind) {
    case "all":
      return true;
    case "personal":
      return source.reasons.includes("個人ブログ基盤");
    case "technical":
      return source.reasons.includes("技術記事プラットフォーム");
    case "academic":
      return source.reasons.includes("学術機関") || source.reasons.includes("論文");
    case "qa":
      return source.reasons.includes("技術Q&A掲示板");
    case "developer":
      return source.reasons.includes("開発者一次情報");
  }
}

// Filters and orders search results for display. Every sort works on the same
// filtered set, and ties keep the backend's original order.
export function arrangeSources(results: ScoredSource[], opts: ArrangeOptions): ScoredSource[] {
  const live = opts.liveFilter.trim().toLocaleLowerCase();
  const filtered = results.filter((source) => {
    if (source.bookmark_count < opts.minBookmarks) return false;
    if (opts.hideRegistered && opts.isRegistered(source)) return false;
    if (live && !`${source.title} ${source.snippet} ${source.domain}`.toLocaleLowerCase().includes(live))
      return false;
    if (opts.availability === "feed" && !source.feed_available) return false;
    if (opts.availability === "noFeed" && source.feed_available) return false;
    return matchesKind(source, opts.kind);
  });
  const original = new Map(results.map((source, index) => [source, index]));
  const byOriginal = (a: ScoredSource, b: ScoredSource) => original.get(a)! - original.get(b)!;
  return filtered.sort((a, b) => {
    switch (opts.sort) {
      case "relevance":
        return (
          relevanceOf(b, opts.query) - relevanceOf(a, opts.query) ||
          b.score - a.score ||
          b.bookmark_count - a.bookmark_count ||
          byOriginal(a, b)
        );
      case "bookmarks":
        return b.bookmark_count - a.bookmark_count || b.score - a.score || byOriginal(a, b);
      case "newest":
      case "oldest": {
        const direction = opts.sort === "newest" ? -1 : 1;
        const dateOrder = (a.published_at ?? "").localeCompare(b.published_at ?? "");
        return direction * dateOrder || byOriginal(a, b);
      }
      case "recommended":
        return b.score - a.score || b.bookmark_count - a.bookmark_count || byOriginal(a, b);
    }
  });
}
