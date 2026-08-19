import { invoke } from "@tauri-apps/api/core";

// Cache + in-flight dedup for per-article thumbnails fetched via the backend
// `fetch_article_image` command (og:image / twitter:image / first real img).
// Kept module-level so scrolling a virtualised list doesn't re-fetch the same
// URL over and over -- the cache survives row mount/unmount, which is the
// whole point given a windowed list remounts rows constantly.
const cache = new Map<string, string | null>();
const inflight = new Map<string, Promise<string | null>>();

// undefined = not looked up yet; string = a usable image URL; null = the
// page had no usable image (cached so we don't keep asking).
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
