// Unit tests for arrangeSources (src/lib/discoverRanking.ts): the filter/sort
// pipeline behind the "サイトを探す" result toolbar.
import { test } from "node:test";
import assert from "node:assert/strict";
import { arrangeSources, type ArrangeOptions } from "../src/lib/discoverRanking.ts";

const source = (url: string, over: { bookmarks?: number; score?: number; date?: string | null; reasons?: string[]; feed?: boolean } = {}) => ({
  title: url,
  url: `https://${url}/entry`,
  domain: url,
  snippet: "",
  published_at: over.date === undefined ? null : over.date,
  feed_url: null,
  feed_available: over.feed ?? true,
  thumbnail_url: null,
  bookmark_count: over.bookmarks ?? 0,
  score: over.score ?? 0,
  reasons: over.reasons ?? [],
});

const results = [
  source("a.example", { bookmarks: 10, score: 3, date: "2026-01-02T00:00:00Z" }),
  source("b.example", { bookmarks: 120, score: 1, date: "2026-03-01T00:00:00Z", reasons: ["個人ブログ基盤"] }),
  source("c.example", { bookmarks: 3, score: 5, date: "2025-12-31T00:00:00Z" }),
  source("d.example", { bookmarks: 50, score: 3, date: null, feed: false }),
];

const opts = (over: Partial<ArrangeOptions> = {}): ArrangeOptions => ({
  sort: "recommended",
  query: "",
  liveFilter: "",
  minBookmarks: 0,
  hideRegistered: false,
  isRegistered: () => false,
  kind: "all",
  availability: "all",
  ...over,
});

const domains = (list: ReturnType<typeof arrangeSources>) => list.map((s) => s.domain);

test("recommended sorts by score, then bookmark count", () => {
  assert.deepEqual(domains(arrangeSources(results, opts())), ["c.example", "d.example", "a.example", "b.example"]);
});

test("bookmarks sorts by bookmark count descending", () => {
  assert.deepEqual(domains(arrangeSources(results, opts({ sort: "bookmarks" }))), [
    "b.example",
    "d.example",
    "a.example",
    "c.example",
  ]);
});

test("newest puts the latest date first and undated last", () => {
  assert.deepEqual(domains(arrangeSources(results, opts({ sort: "newest" }))), [
    "b.example",
    "a.example",
    "c.example",
    "d.example",
  ]);
});

test("all sorts reorder the same filtered set", () => {
  const sets = (["recommended", "bookmarks", "newest"] as const).map((sort) =>
    domains(arrangeSources(results, opts({ sort, minBookmarks: 5 }))).sort(),
  );
  assert.deepEqual(sets[0], sets[1]);
  assert.deepEqual(sets[1], sets[2]);
});

test("minBookmarks drops sources below the floor", () => {
  assert.deepEqual(domains(arrangeSources(results, opts({ sort: "bookmarks", minBookmarks: 50 }))), [
    "b.example",
    "d.example",
  ]);
  assert.equal(arrangeSources(results, opts({ minBookmarks: 0 })).length, results.length);
});

test("hideRegistered toggles registered sources out and back in", () => {
  const isRegistered = (s: { domain: string }) => s.domain === "a.example";
  assert.ok(!domains(arrangeSources(results, opts({ hideRegistered: true, isRegistered }))).includes("a.example"));
  assert.ok(domains(arrangeSources(results, opts({ hideRegistered: false, isRegistered }))).includes("a.example"));
});

test("kind, availability and live text filters combine", () => {
  assert.deepEqual(domains(arrangeSources(results, opts({ kind: "personal" }))), ["b.example"]);
  assert.deepEqual(domains(arrangeSources(results, opts({ availability: "noFeed" }))), ["d.example"]);
  assert.deepEqual(domains(arrangeSources(results, opts({ liveFilter: "C.EXAMPLE" }))), ["c.example"]);
});

test("does not mutate the input array", () => {
  const before = domains(results);
  arrangeSources(results, opts({ sort: "bookmarks" }));
  assert.deepEqual(domains(results), before);
});
