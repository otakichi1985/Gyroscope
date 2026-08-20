import type { ScoredSource } from "./types";

/**
 * Pure ranking/host logic for the "探す" screen, extracted from
 * DiscoverOverlay so it can be unit-tested without a browser / network.
 */

// Feeds are stored by their *feed* URL (e.g. foo.example/feed) while search
// hits carry the *article* URL (e.g. foo.example/entry/1) -- two URLs for
// the same site that never string-match. Compare by host (minus an optional
// leading "www.") so a site already subscribed to is actually recognized as
// registered.
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

// Keyword-search relevance: Hatena's RSS endpoints only return recency order
// (see search.rs), so the "関連度" sort re-ranks the candidates locally by how
// strongly the query tokens appear in the title/snippet/domain. Japanese
// queries have no whitespace, so the whole phrase becomes one token; a hit
// with no literal match scores 0 and falls back to the popularity score.
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