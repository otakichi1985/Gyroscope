// Scroll-to-top + page-scroll keys regression spec (user request: 一気に上に
// 戻れる機能と Home/End/PageUp/PageDown キー対応). Seeds a feed with enough
// articles to make the timeline scroll, then verifies:
//   1. the End key jumps the timeline to the bottom and the floating
//      "一番上に戻る" button appears
//   2. clicking that button glides back to the top and hides it
//   3. the Home key jumps straight to the top
//   4. PageDown / PageUp scroll by roughly a viewport
// The seeded feed/articles are removed in after() so specs that expect an
// empty timeline (ui-audit baselines) are unaffected regardless of order.

import { openDb, ensureSchema } from "../seed-reader-data.mjs";

const SEED_FEED_URL = "https://scroll-e2e.example.com/feed.xml";
const SEED_GUID_PREFIX = "scroll-e2e-";
const ENTRY_COUNT = 60;

const scrollTopExpr = `document.querySelector(".entry-list-scroll")?.scrollTop ?? 0`;
const scrollMaxExpr = `(() => { const s = document.querySelector(".entry-list-scroll"); return s ? s.scrollHeight - s.clientHeight : 0; })()`;
const hasToTopButton = `document.querySelector('button[aria-label="\\u4E00\\u756A\\u4E0A\\u306B\\u623B\\u308B"]') !== null`;
const clickToTop = `(() => { const b = document.querySelector('button[aria-label="\\u4E00\\u756A\\u4E0A\\u306B\\u623B\\u308B"]'); if (!b) throw new Error("to-top button missing"); b.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; })()`;
const pressKey = (key) =>
  `(() => { window.dispatchEvent(new KeyboardEvent("keydown", { key: "${key}", bubbles: true, cancelable: true })); return true; })()`;

async function withDb(fn) {
  const deadline = Date.now() + 5000;
  const sleep = () => new Promise((r) => setTimeout(r, 150));
  for (;;) {
    try {
      const db = openDb();
      try {
        ensureSchema(db);
        return fn(db);
      } finally {
        db.close();
      }
    } catch (err) {
      if (Date.now() > deadline) throw err;
      await sleep();
    }
  }
}

function seedScrollData() {
  return withDb((db) => {
    db.prepare(`DELETE FROM entries WHERE guid LIKE ?`).run(`${SEED_GUID_PREFIX}%`);
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
        "https://scroll-e2e.example.com/",
        "Scroll E2E Feed",
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
    const insert = db.prepare(
      `INSERT INTO entries
        (feed_id, guid, title, link, author, summary, content_html, thumbnail_url, published_at, fetched_at, is_read, is_starred, body_text)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)`,
    );
    for (let i = 0; i < ENTRY_COUNT; i++) {
      const published = new Date(Date.parse(now) - i * 60000).toISOString();
      insert.run(
        feedId,
        `${SEED_GUID_PREFIX}${i}`,
        `スクロール検証記事 ${i}`,
        `https://scroll-e2e.example.com/article/${i}`,
        "Scroll Author",
        `要約${i}`,
        `<p>本文${i}</p>`,
        null,
        published,
        now,
        `本文${i}`,
      );
    }
  });
}

function unseedScrollData() {
  return withDb((db) => {
    db.prepare(`DELETE FROM entries WHERE guid LIKE ?`).run(`${SEED_GUID_PREFIX}%`);
    db.prepare(`DELETE FROM feeds WHERE url = ?`).run(SEED_FEED_URL);
  });
}

describe("scroll: Home/End/PageUp/PageDown keys + 一番上に戻る button", () => {
  before(async () => {
    seedScrollData();
  });

  after(() => {
    unseedScrollData();
  });

  it("End jumps to bottom and shows the to-top button; clicking returns to top", async () => {
    // Force the frontend to re-read the seeded articles: reloading remounts
    // EntryList, whose mount triggers the timeline refresh.
    await browser.execute(() => location.reload());
    await browser.pause(2500);

    // Make sure the timeline actually rendered rows before scrolling.
    await browser.waitUntil(
      async () => (await browser.execute(`document.querySelectorAll(".entry-list-scroll div[role='button']").length`)) > 0,
      { timeout: 20000, interval: 500 },
    );

    // 1. End key -> bottom, button appears.
    await browser.execute(pressKey("End"));
    await browser.waitUntil(
      async () => {
        const top = await browser.execute(scrollTopExpr);
        const max = await browser.execute(scrollMaxExpr);
        return max > 0 && top >= max - 20;
      },
      { timeout: 10000, interval: 200 },
    );
    expect(await browser.execute(hasToTopButton)).toBe(true);

    // 2. Click the to-top button -> back to top, button hides.
    await browser.execute(clickToTop);
    await browser.waitUntil(async () => (await browser.execute(scrollTopExpr)) < 20, {
      timeout: 10000,
      interval: 200,
    });
    await browser.pause(200);
    expect(await browser.execute(hasToTopButton)).toBe(false);

    console.log("[scroll-keys] End->bottom + button show, click->top + button hide: OK");
  });

  it("Home jumps to the top; PageDown/PageUp scroll by a viewport", async () => {
    const max = await browser.execute(scrollMaxExpr);
    if (max <= 0) throw new Error("timeline is not scrollable for the key test");

    // Home -> top.
    await browser.execute(pressKey("End"));
    await browser.waitUntil(async () => (await browser.execute(scrollTopExpr)) >= max - 20, {
      timeout: 10000,
      interval: 200,
    });
    await browser.execute(pressKey("Home"));
    await browser.waitUntil(async () => (await browser.execute(scrollTopExpr)) < 20, {
      timeout: 10000,
      interval: 200,
    });

    // PageDown -> a viewport's worth down; PageUp -> back up.
    const before = await browser.execute(scrollTopExpr);
    await browser.execute(pressKey("PageDown"));
    await browser.pause(400);
    const afterDown = await browser.execute(scrollTopExpr);
    if (!(afterDown > before + 100)) throw new Error(`PageDown did not scroll down: ${before} -> ${afterDown}`);
    await browser.execute(pressKey("PageUp"));
    await browser.pause(400);
    const afterUp = await browser.execute(scrollTopExpr);
    if (!(afterUp < afterDown - 100)) throw new Error(`PageUp did not scroll up: ${afterDown} -> ${afterUp}`);

    console.log("[scroll-keys] Home/PageDown/PageUp: OK");
  });
});