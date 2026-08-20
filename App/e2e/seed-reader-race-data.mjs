// Seeds the E2E throwaway database (%TEMP%\gyroscope-e2e-data) with two
// summary-only articles for the reader's full-text race regression spec
// (e2e/specs/reader-race.spec.js).
//
// Both entries are deliberately "summary-only" (short summary, no
// content_html), which is what makes the reader auto-fetch their full text
// on open. Their links point at a local HTTP server the spec starts, so the
// spec can control exactly when each full-text response arrives: article A
// answers late (after a delay), article B immediately. That deterministic
// ordering is what reproduces the reported bug -- open A, move to B, and a
// late A reply must not overwrite B's view.
//
// Kept in sync with db/migrations.rs (v1..v6); the FTS5 triggers fire on the
// INSERT so search stays consistent. The feed has no refresh interval so
// nothing tries to re-fetch at runtime.

import { mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.join(os.tmpdir(), "gyroscope-e2e-data");
const dbPath = path.join(dataDir, "gyroscope.sqlite3");

const SEED_FEED_URL = "https://example.com/race-feed.xml";

const migrations = [
  // v1
  `
  CREATE TABLE feeds (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      url             TEXT NOT NULL UNIQUE,
      site_url        TEXT,
      title           TEXT,
      custom_title    TEXT,
      icon_path       TEXT,
      folder          TEXT,
      interval_min    INTEGER,
      notify_enabled  INTEGER NOT NULL DEFAULT 0,
      sort_order      INTEGER NOT NULL DEFAULT 0,
      etag            TEXT,
      last_modified   TEXT,
      last_fetched_at TEXT,
      last_error      TEXT,
      created_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
  );
  CREATE TABLE entries (
      id              INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_id         INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      guid            TEXT NOT NULL,
      title           TEXT,
      link            TEXT,
      author          TEXT,
      summary         TEXT,
      content_html    TEXT,
      thumbnail_url   TEXT,
      published_at    TEXT,
      fetched_at      TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      is_read         INTEGER NOT NULL DEFAULT 0,
      is_starred      INTEGER NOT NULL DEFAULT 0,
      UNIQUE (feed_id, guid)
  );
  CREATE INDEX idx_entries_feed_published ON entries(feed_id, published_at DESC);
  CREATE INDEX idx_entries_published ON entries(published_at DESC);
  CREATE INDEX idx_entries_unread ON entries(is_read);
  CREATE TABLE tags (
      id   INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE
  );
  CREATE TABLE feed_tags (
      feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
      tag_id  INTEGER NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
      PRIMARY KEY (feed_id, tag_id)
  );
  CREATE TABLE settings (
      key   TEXT PRIMARY KEY,
      value TEXT NOT NULL
  );
  `,
  // v2
  `
  CREATE TABLE read_history (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      feed_title TEXT NOT NULL,
      entry_guid TEXT NOT NULL,
      title      TEXT,
      link       TEXT,
      read_at    TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
      UNIQUE (feed_title, entry_guid)
  );
  CREATE INDEX idx_read_history_read_at ON read_history(read_at DESC);
  `,
  // v3
  `
  ALTER TABLE entries ADD COLUMN body_text TEXT;
  CREATE VIRTUAL TABLE entries_fts USING fts5(
      title, body_text,
      content='entries', content_rowid='id'
  );
  CREATE TRIGGER entries_fts_ai AFTER INSERT ON entries BEGIN
      INSERT INTO entries_fts(rowid, title, body_text) VALUES (new.id, new.title, new.body_text);
  END;
  CREATE TRIGGER entries_fts_ad AFTER DELETE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, body_text) VALUES ('delete', old.id, old.title, old.body_text);
  END;
  CREATE TRIGGER entries_fts_au AFTER UPDATE ON entries BEGIN
      INSERT INTO entries_fts(entries_fts, rowid, title, body_text) VALUES ('delete', old.id, old.title, old.body_text);
      INSERT INTO entries_fts(rowid, title, body_text) VALUES (new.id, new.title, new.body_text);
  END;
  `,
  // v4
  `ALTER TABLE entries ADD COLUMN deleted_at TEXT;`,
  // v5
  `ALTER TABLE feeds ADD COLUMN source_type TEXT NOT NULL DEFAULT 'rss';`,
  // v6
  `
  CREATE TABLE saved_articles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      url TEXT NOT NULL UNIQUE,
      title TEXT NOT NULL,
      domain TEXT NOT NULL,
      snippet TEXT NOT NULL,
      thumbnail_url TEXT,
      saved_at TEXT NOT NULL,
      deleted_at TEXT
  );
  `,
];

export const RACE_A_TITLE = "E2E競合記事A（全文取得が遅い）";
export const RACE_B_TITLE = "E2E競合記事B（全文取得が速い）";

/** Article links the spec's local HTTP server serves. */
export function raceUrl(port, which) {
  return `http://127.0.0.1:${port}/race/${which}`;
}

function openDb() {
  mkdirSync(dataDir, { recursive: true });
  return new DatabaseSync(dbPath);
}

function ensureSchema(db) {
  const hasFeeds = db.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feeds'`).get();
  if (hasFeeds) return;
  for (const sql of migrations) db.exec(sql);
  db.exec("PRAGMA user_version = 6");
}

/** Removes the race seed feed + entries. Safe to call while the app holds the DB. */
export function unseedReaderRaceData() {
  const db = openDb();
  try {
    ensureSchema(db);
    db.prepare(`DELETE FROM entries WHERE guid = ? OR guid = ?`).run("e2e-race-A", "e2e-race-B");
    db.prepare(`DELETE FROM feeds WHERE url = ?`).run(SEED_FEED_URL);
  } finally {
    db.close();
  }
}

/**
 * Ensures the two race articles are present (idempotent; does NOT wipe
 * unrelated data). Retries briefly in case the running app's SQLite
 * connection is mid-write ("database is locked").
 */
export async function seedReaderRaceData(port) {
  const deadline = Date.now() + 5000;
  const sleep = () => new Promise((r) => setTimeout(r, 150));
  for (;;) {
    try {
      const db = openDb();
      try {
        ensureSchema(db);
        const aUrl = raceUrl(port, "A");
        const bUrl = raceUrl(port, "B");
        db.prepare(`DELETE FROM entries WHERE link = ? OR link = ?`).run(aUrl, bUrl);
        db.prepare(`DELETE FROM feeds WHERE url = ?`).run(SEED_FEED_URL);
        const now = "2026-08-20T10:00:00.000Z";
        const feedId = db
          .prepare(
            `INSERT INTO feeds
              (url, site_url, title, custom_title, icon_path, folder, interval_min, notify_enabled, sort_order, etag, last_modified, last_fetched_at, last_error, created_at, source_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            SEED_FEED_URL,
            "https://example.com/",
            "Example Race Feed",
            null,
            null,
            null,
            null,
            0,
            0,
            null,
            null,
            null,
            null,
            now,
            "rss",
          ).lastInsertRowid;
        db.prepare(
          `INSERT INTO entries
            (feed_id, guid, title, link, author, summary, content_html, thumbnail_url, published_at, fetched_at, is_read, is_starred, body_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
        ).run(
          feedId,
          "e2e-race-A",
          RACE_A_TITLE,
          aUrl,
          null,
          "これは記事Aの要約です。本文は全文取得で後から読み込みます。",
          null,
          null,
          now,
          now,
          "記事Aの要約です。本文は全文取得で後から読み込みます。",
        );
        db.prepare(
          `INSERT INTO entries
            (feed_id, guid, title, link, author, summary, content_html, thumbnail_url, published_at, fetched_at, is_read, is_starred, body_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
        ).run(
          feedId,
          "e2e-race-B",
          RACE_B_TITLE,
          bUrl,
          null,
          "これは記事Bの要約です。本文は全文取得で後から読み込みます。",
          null,
          null,
          now,
          now,
          "記事Bの要約です。本文は全文取得で後から読み込みます。",
        );
        return dbPath;
      } finally {
        db.close();
      }
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await sleep();
    }
  }
}