// Unit tests for the pure "探す" ranking logic (src/lib/discoverRanking.ts).
// Run with `npm run test:unit` (node --test). Kept outside src/ so the app's
// tsc build doesn't type-check it (it imports node:test/node:assert, which
// aren't in the app's dependency graph); node's type-stripping runs it as-is.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hostOf, relevanceOf } from "../src/lib/discoverRanking.ts";

const source = (over: Partial<Record<"title" | "snippet" | "domain", string>> = {}) => ({
  title: over.title ?? "Rustの並行処理入門",
  url: "https://example.com/entry/1",
  domain: over.domain ?? "example.com",
  snippet: over.snippet ?? "async/await とスレッドの使い分け",
  published_at: null,
  feed_url: "https://example.com/feed",
  feed_available: true,
  thumbnail_url: null,
  bookmark_count: 100,
  score: 1,
  reasons: [],
});

test("hostOf strips www. and lowercases", () => {
  assert.equal(hostOf("https://www.Example.com/feed"), "example.com");
  assert.equal(hostOf("https://example.com/entry/1"), "example.com");
  assert.equal(hostOf("https://sub.Example.com/x"), "sub.example.com");
});

test("hostOf returns '' for malformed URLs", () => {
  assert.equal(hostOf("not a url"), "");
  assert.equal(hostOf(""), "");
});

test("relevanceOf: a keyword in the title scores higher than snippet/domain", () => {
  const s = source({ title: "Rust", domain: "rust-lang.org", snippet: "並行処理" });
  // "rust" hits title (3) and domain (2) = 5
  assert.equal(relevanceOf(s, "rust"), 5);
  // "並行" hits snippet only = 1
  assert.equal(relevanceOf(s, "並行"), 1);
});

test("relevanceOf: multi-token queries sum per token", () => {
  const s = source({ title: "Rust スレッド", snippet: "スレッド", domain: "rust-lang.org" });
  // "rust" -> 3 (title) + 2 (domain) = 5; "スレッド" -> 3 (title) + 1 (snippet) = 4; total 9
  assert.equal(relevanceOf(s, "rust スレッド"), 9);
});

test("relevanceOf: no literal match scores 0 (falls back to popularity)", () => {
  assert.equal(relevanceOf(source(), "全く関係ない語"), 0);
});

test("relevanceOf: empty/whitespace query scores 0", () => {
  assert.equal(relevanceOf(source(), ""), 0);
  assert.equal(relevanceOf(source(), "   "), 0);
});

test("relevanceOf: ranking prefers title hits over domain hits over snippet hits", () => {
  const titleHit = source({ title: "Docker", snippet: "", domain: "other.com" });
  const domainHit = source({ title: "", snippet: "", domain: "docker.com" });
  const snippetHit = source({ title: "", snippet: "Docker", domain: "other.com" });
  assert.ok(relevanceOf(titleHit, "docker") > relevanceOf(domainHit, "docker"));
  assert.ok(relevanceOf(domainHit, "docker") > relevanceOf(snippetHit, "docker"));
});
