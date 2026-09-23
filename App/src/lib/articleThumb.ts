import { invoke } from "@tauri-apps/api/core";

const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

export function getCachedArticleThumb(url: string): string | null | undefined {
  return cache.get(url);
}

export function fetchArticleThumb(url: string): Promise<string | null> {
  const cached = cache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  const existing = inflight.get(url);
  if (existing) return existing;
  const p = invoke<string | null>("fetch_article_image", { url })
    .catch(() => null)
    .finally(() => inflight.delete(url));
  inflight.set(url, p);
  p.then((val) => cache.set(url, val));
  return p;
}
