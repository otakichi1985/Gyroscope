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
