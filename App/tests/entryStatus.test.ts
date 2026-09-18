// Unit tests for the timeline status-lamp logic (src/lib/entryStatus.ts).
// Run with `npm run test:unit` (node --test). Same placement rationale as
// discoverRanking.test.ts: kept outside src/ so tsc skips it.
import { test } from "node:test";
import assert from "node:assert/strict";
import { getEntryLamp, FRESH_WINDOW_MS } from "../src/lib/entryStatus.ts";

const NOW = Date.parse("2026-09-18T12:00:00+09:00");

const row = (over: { is_read?: boolean; published_at?: string | null } = {}) => ({
  is_read: over.is_read ?? false,
  published_at: over.published_at ?? null,
});

test("unread + published 1h ago is fresh", () => {
  const published = new Date(NOW - 60 * 60 * 1000).toISOString();
  assert.equal(getEntryLamp(row({ published_at: published }), NOW), "fresh");
});

test("unread + published 25h ago is unread", () => {
  const published = new Date(NOW - 25 * 60 * 60 * 1000).toISOString();
  assert.equal(getEntryLamp(row({ published_at: published }), NOW), "unread");
});

test("unread without a date is unread", () => {
  assert.equal(getEntryLamp(row(), NOW), "unread");
});

test("unread with a garbage date is unread", () => {
  assert.equal(getEntryLamp(row({ published_at: "not-a-date" }), NOW), "unread");
});

test("read is read even when fresh", () => {
  const published = new Date(NOW - 60 * 60 * 1000).toISOString();
  assert.equal(getEntryLamp(row({ is_read: true, published_at: published }), NOW), "read");
});

test("boundary: exactly 24h is unread, just under is fresh", () => {
  const atEdge = new Date(NOW - FRESH_WINDOW_MS).toISOString();
  const justUnder = new Date(NOW - FRESH_WINDOW_MS + 1000).toISOString();
  assert.equal(getEntryLamp(row({ published_at: atEdge }), NOW), "unread");
  assert.equal(getEntryLamp(row({ published_at: justUnder }), NOW), "fresh");
});
