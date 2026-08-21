// Seeds the E2E throwaway database (%TEMP%\gyroscope-e2e-data) with one feed
// and one article whose HTML deliberately exercises every reader readability
// fix: a hard-coded inline color/font-size (stripped by sanitize), a heading
// hierarchy, a blockquote (no longer dimmed), inline + block code, a link and
// a table (wrapped in a scrollable container).
//
// Used two ways:
//  - imported by e2e/specs/reader-readability.spec.js: `seedReaderData()` runs
//    in the spec's before() hook and `unseedReaderData()` in after(), so the
//    shared E2E DB is seeded only while that spec runs and other specs
//    (notably the ui-audit pixel baselines, which expect an empty timeline)
//    are unaffected regardless of suite order.
//  - run directly (`node e2e/seed-reader-data.mjs`): resets the whole DB and
//    seeds it, for manually launching the app against seeded data.
//
// The migration SQL below is kept in sync with db/migrations.rs (v1..v6); the
// FTS5 triggers included there fire on our INSERT, so search stays consistent.
// The seed row is fully network-independent: the sample body is long enough
// to skip the reader's "summary-only" auto full-text fetch, and the feed has
// no refresh interval, so nothing tries to reach example.com at runtime.

import { rmSync, mkdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const dataDir = path.join(os.tmpdir(), "gyroscope-e2e-data");
const dbPath = path.join(dataDir, "gyroscope.sqlite3");

const SEED_FEED_URL = "https://example.com/feed.xml";
const SEED_ENTRY_GUID = "e2e-reader-entry";

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

const SAMPLE_TITLE = "E2Eリーダー検証記事（読みやすさ）";

const contentHtml = `<h1>見出し1（記事のタイトル下）</h1>
<p style="color:#333333;font-size:12px;line-height:1.2">この段落は元サイトが色と文字サイズを直書きしています。読書画面では style 属性が取り除かれ、テーマの文字色と、文字設定で選んだサイズ・行間に従います。</p>
<h2>見出し2</h2>
<p>通常の段落です。文字が読みにくい問題を再現するための長めの文章を並べます。読書画面では行間が広げられ、見出しは本文より大きくなり、引用は枠線で区別され、幅の広い表は専用の横スクロール領域に包まれます。この程度の文字数があれば「要約のみ」判定を回避して全文取得が走ることもありません。</p>
<blockquote>これは引用文です。以前は不透明度0.85でかすんでいましたが、今はアクセントの枠線と薄い背景で強調され、文字はくっきり読めます。</blockquote>
<ul><li>箇条書きの項目その1</li><li>箇条書きの項目その2</li></ul>
<ol><li>番号付きリストの1番目</li><li>番号付きリストの2番目</li></ol>
<pre><code>const sample = 1;
if (sample &gt; 0) console.log("コードブロックの例");</code></pre>
<p><a href="https://example.com/">リンクの例</a>。リンクはテーマのアクセント色で下線付きになります。</p>
<h3>見出し3</h3>
<table width="900"><tr><th>列A</th><th>列B</th></tr><tr><td>セルの値1</td><td>セルの値2</td></tr></table>
<p>末尾の段落です。幅の広い表は専用のスクロール領域に包まれるので、ウィンドウの端で切れて読めなくなることはありません。</p>`;

const plainBody = `見出し1（記事のタイトル下） この段落は元サイトが色と文字サイズを直書きしています。読書画面では style 属性が取り除かれ、テーマの文字色と、文字設定で選んだサイズ・行間に従います。 見出し2 通常の段落です。文字が読みにくい問題を再現するための長めの文章を並べます。読書画面では行間が広げられ、見出しは本文より大きくなり、引用は枠線で区別され、幅の広い表は専用の横スクロール領域に包まれます。この程度の文字数があれば「要約のみ」判定を回避して全文取得が走ることもありません。 これは引用文です。以前は不透明度0.85でかすんでいましたが、今はアクセントの枠線と薄い背景で強調され、文字はくっきり読めます。 箇条書きの項目その1 箇条書きの項目その2 番号付きリストの1番目 番号付きリストの2番目 const sample = 1; if (sample > 0) console.log("コードブロックの例"); リンクの例。リンクはテーマのアクセント色で下線付きになります。 見出し3 列A 列B セルの値1 セルの値2 末尾の段落です。幅の広い表は専用のスクロール領域に包まれるので、ウィンドウの端で切れて読めなくなることはありません。`;

/** Opens the shared E2E DB (creating its directory if needed). */
export function openDb() {
  mkdirSync(dataDir, { recursive: true });
  return new DatabaseSync(dbPath);
}

/** Creates the schema if the DB is fresh. Safe to call from any spec. */
export function ensureSchema(db) {
  const hasFeeds = db
    .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'feeds'`)
    .get();
  if (hasFeeds) return;
  for (const sql of migrations) db.exec(sql);
  db.exec("PRAGMA user_version = 6");
}

/**
 * Clears all app data from the shared E2E DB (feeds/entries cascade via FK,
 * plus history/bookmarks/tags), retrying briefly on "database is locked".
 * Used by ui-audit in its before() so the pixel baselines (which expect an
 * empty timeline) are deterministic regardless of what earlier specs left in
 * the shared DB.
 */
export async function clearE2eData() {
  const deadline = Date.now() + 5000;
  const sleep = () => new Promise((r) => setTimeout(r, 150));
  for (;;) {
    try {
      const db = openDb();
      try {
        ensureSchema(db);
        db.prepare(`DELETE FROM feed_tags`).run();
        db.prepare(`DELETE FROM tags`).run();
        db.prepare(`DELETE FROM entries`).run();
        db.prepare(`DELETE FROM feeds`).run();
        db.prepare(`DELETE FROM read_history`).run();
        db.prepare(`DELETE FROM saved_articles`).run();
        return;
      } finally {
        db.close();
      }
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await sleep();
    }
  }
}

/** Removes the seed feed + article. Safe to call while the app holds the DB. */
export function unseedReaderData() {
  const db = openDb();
  try {
    ensureSchema(db);
    db.prepare(`DELETE FROM entries WHERE guid = ?`).run(SEED_ENTRY_GUID);
    db.prepare(`DELETE FROM feeds WHERE url = ?`).run(SEED_FEED_URL);
  } finally {
    db.close();
  }
}

/* Generic scroll-seat helpers, shared by scroll-related specs (and the
   disposable zz-temp diagnostics). These let a spec get a definitely-scrollable
   timeline without depending on a particular window height, and clean up after
   itself -- the two bits of boilerplate every scroll spec used to copy. */

/**
 * Adds a feed with `count` articles (published a minute apart going back from
 * `now`), then returns the feed url. Rows are idempotent for a
 * (feedUrl, guidPrefix) pair and are removed by `unseedScrollableFeed`. Retried
 * briefly on "database is locked" like the other seeders.
 */
export async function seedScrollableFeed({ feedUrl, guidPrefix, count, now = "2026-08-20T09:00:00.000Z" }) {
  const deadline = Date.now() + 5000;
  const sleep = () => new Promise((r) => setTimeout(r, 150));
  for (;;) {
    try {
      const db = openDb();
      try {
        ensureSchema(db);
        db.prepare(`DELETE FROM entries WHERE guid LIKE ?`).run(`${guidPrefix}%`);
        db.prepare(`DELETE FROM feeds WHERE url = ?`).run(feedUrl);
        const feedId = db
          .prepare(
            `INSERT INTO feeds
              (url, site_url, title, custom_title, icon_path, folder, interval_min, notify_enabled, sort_order, etag, last_modified, last_fetched_at, last_error, created_at, source_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(feedUrl, "https://scroll.example.com/", "Scroll Example Feed", null, null, null, null, 0, 0, null, null, null, null, now, "rss").lastInsertRowid;
        const insert = db.prepare(
          `INSERT INTO entries
            (feed_id, guid, title, link, author, summary, content_html, thumbnail_url, published_at, fetched_at, is_read, is_starred, body_text)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
        );
        for (let i = 0; i < count; i++) {
          const published = new Date(Date.parse(now) - i * 60000).toISOString();
          insert.run(feedId, `${guidPrefix}${i}`, `記事 ${i}`, `${feedUrl.replace(/\/feed\.xml.*/, "")}/article/${i}`, "Author", `要約${i}`, `<p>本文${i}</p>`, null, published, now, `本文${i}`);
        }
        return feedUrl;
      } finally {
        db.close();
      }
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await sleep();
    }
  }
}

/** Removes every row a `seedScrollableFeed` call created. Safe while the app
 * holds the DB; retried briefly on "database is locked". */
export async function unseedScrollableFeed({ feedUrl, guidPrefix }) {
  const deadline = Date.now() + 5000;
  const sleep = () => new Promise((r) => setTimeout(r, 150));
  for (;;) {
    try {
      const db = openDb();
      try {
        ensureSchema(db);
        db.prepare(`DELETE FROM entries WHERE guid LIKE ?`).run(`${guidPrefix}%`);
        db.prepare(`DELETE FROM feeds WHERE url = ?`).run(feedUrl);
        return;
      } finally {
        db.close();
      }
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await sleep();
    }
  }
}

/**
 * Ensures exactly one seed feed/article is present (idempotent; does NOT wipe
 * unrelated data). Retries briefly in case the running app's SQLite connection
 * is mid-write ("database is locked").
 */
export async function seedReaderData() {
  const deadline = Date.now() + 5000;
  const sleep = () => new Promise((r) => setTimeout(r, 150));
  for (;;) {
    try {
      const db = openDb();
      try {
        ensureSchema(db);
        db.prepare(`DELETE FROM entries WHERE guid = ?`).run(SEED_ENTRY_GUID);
        db.prepare(`DELETE FROM feeds WHERE url = ?`).run(SEED_FEED_URL);
        const now = "2026-08-20T09:00:00.000Z";
        const feedId = db
          .prepare(
            `INSERT INTO feeds
              (url, site_url, title, custom_title, icon_path, folder, interval_min, notify_enabled, sort_order, etag, last_modified, last_fetched_at, last_error, created_at, source_type)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          )
          .run(
            SEED_FEED_URL,
            "https://example.com/",
            "Example Feed",
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
          SEED_ENTRY_GUID,
          SAMPLE_TITLE,
          "https://example.com/article/1",
          "Example Author",
          "要約文です。",
          contentHtml,
          null,
          now,
          now,
          plainBody,
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

// Manual CLI: hard-reset the whole DB then seed, for launching the app against
// a known dataset by hand. The spec path deliberately avoids this (it must not
// wipe the shared E2E DB while other specs' data lives there).
if (import.meta.url === `file://${process.argv[1].replaceAll("\\", "/")}`) {
  rmSync(dbPath, { force: true });
  await seedReaderData();
  console.log(`[seed-reader-data] seeded: ${dbPath}`);
}