import { createServer } from "node:http";
import {
  RACE_A_TITLE,
  RACE_B_TITLE,
  seedReaderRaceData,
  unseedReaderRaceData,
} from "../seed-reader-race-data.mjs";

// Reader full-text race regression spec. Reproduces the reported bug
// deterministically: open a summary-only article whose full-text fetch
// answers slowly (A), move to a second article whose fetch answers
// immediately (B), and verify the late A reply cannot overwrite B's view.
//
// Timing is controlled by a local HTTP server started in before() and the
// seeded entries' links pointing at it: /race/A responds after a fixed
// delay, /race/B immediately. Both pages embed the marker text as JSON-LD
// articleBody, which the extractor returns verbatim (no DOM heuristics), so
// the reader's rendered content is exactly the marker -- easy to assert.
//
// The buggy code called setFetchedHtml() unconditionally after awaiting the
// fetch, so A's delayed response landed after B was open and replaced B's
// content with A's. The fix drops any reply whose fetch target is no longer
// the article being viewed.

const A_DELAY_MS = 4000;
const A_MARKER = "E2E競合記事Aの本文マーカー";
const B_MARKER = "E2E競合記事Bの本文マーカー";

const activeOverlay = `document.querySelector('.screen-overlay:not([inert])')`;
const click = (el) =>
  `(() => { const e = ${el}; if (!e) throw new Error("element missing"); e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; })()`;

// First timeline row whose text includes the given title.
const timelineRowWith = (title) =>
  `(() => { const r = Array.from(document.querySelectorAll('.app-content div[role="button"]')).find((x) => x.textContent.includes(${JSON.stringify(title)})); return r || null; })()`;

const S = {
  hasRow: (title) =>
    `(() => { const r = Array.from(document.querySelectorAll('.app-content div[role="button"]')).find((x) => x.textContent.includes(${JSON.stringify(title)})); return !!r; })()`,
  clickRow: (title) =>
    click(`(() => { const r = Array.from(document.querySelectorAll('.app-content div[role="button"]')).find((x) => x.textContent.includes(${JSON.stringify(title)})); if (!r) throw new Error("row missing: ${title}"); return r; })()`),
  readerShowsTitle: (title) =>
    `(() => { const o = ${activeOverlay}; return !!o && o.textContent.includes(${JSON.stringify(title)}); })()`,
  readerFetching: `(() => { const o = ${activeOverlay}; return !!o && o.textContent.includes("全文を取得中"); })()`,
  readerHasText: (text) =>
    `(() => { const o = ${activeOverlay}; const c = o ? o.querySelector(".reader-content") : null; return !!c && c.textContent.includes(${JSON.stringify(text)}); })()`,
  clickClose: click(`(() => { const o = ${activeOverlay}; const b = o ? Array.from(o.querySelectorAll("button")).find((x) => x.getAttribute("aria-label") === "閉じる") : null; if (!b) throw new Error("閉じる button missing"); return b; })()`),
  timelineVisible: `(() => { const o = ${activeOverlay}; return !o || (() => { const c = document.querySelector(".app-content"); return !!c && getComputedStyle(c).display !== "none" && getComputedStyle(c).visibility !== "hidden"; })(); })()`,
};

function pageHtml(marker) {
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "Article",
    headline: "test",
    articleBody: marker,
  });
  return `<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>test</title><script type="application/ld+json">${jsonLd}</script></head><body><h1>test</h1></body></html>`;
}

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

describe("reader: a late full-text reply must not overwrite the current article", () => {
  let server;
  let port;

  before(async () => {
    server = createServer((req, res) => {
      const which = req.url?.endsWith("/race/A") ? "A" : req.url?.endsWith("/race/B") ? "B" : null;
      if (!which) {
        res.writeHead(404).end("not found");
        return;
      }
      const respond = () => {
        res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
        res.end(pageHtml(which === "A" ? A_MARKER : B_MARKER));
      };
      if (which === "A") setTimeout(respond, A_DELAY_MS);
      else respond();
    });
    port = await listen(server);
    await seedReaderRaceData(port);
  });

  after(() => {
    unseedReaderRaceData();
    server.close();
  });

  it("drops A's stale full text when the reader has moved to B", async () => {
    // Fresh frontend state: clear the appearance prefs a previous run may
    // have left, then reload so the store re-reads.
    await browser.execute(() => localStorage.removeItem("gyroscope:appearance"));
    await browser.execute(() => location.reload());
    await browser.pause(2500);

    await browser.waitUntil(async () => (await browser.execute(S.hasRow(RACE_A_TITLE))) === true, {
      timeout: 20000,
      interval: 500,
    });
    await browser.waitUntil(async () => (await browser.execute(S.hasRow(RACE_B_TITLE))) === true, {
      timeout: 20000,
      interval: 500,
    });

    // 1. Open article A: its full-text fetch stays in flight (delayed).
    await browser.execute(S.clickRow(RACE_A_TITLE));
    await browser.waitUntil(async () => (await browser.execute(S.readerShowsTitle(RACE_A_TITLE))) === true, {
      timeout: 20000,
      interval: 500,
    });
    await browser.waitUntil(async () => (await browser.execute(S.readerFetching)) === true, {
      timeout: 10000,
      interval: 200,
    });
    const aOpenedAt = Date.now();

    // 2. Move to article B while A's fetch is still pending.
    await browser.execute(S.clickClose);
    await browser.waitUntil(async () => (await browser.execute(S.timelineVisible)) === true, {
      timeout: 10000,
      interval: 200,
    });
    await browser.execute(S.clickRow(RACE_B_TITLE));
    await browser.waitUntil(async () => (await browser.execute(S.readerShowsTitle(RACE_B_TITLE))) === true, {
      timeout: 20000,
      interval: 500,
    });

    // 3. B's fetch answers immediately: its marker renders.
    await browser.waitUntil(async () => (await browser.execute(S.readerHasText(B_MARKER))) === true, {
      timeout: 10000,
      interval: 200,
    });

    // 4. Wait well past the point where A's delayed reply must have landed,
    //    then make sure it did not replace B's content.
    const waitUntil = aOpenedAt + A_DELAY_MS + 3000;
    const remaining = waitUntil - Date.now();
    if (remaining > 0) await browser.pause(remaining);

    expect(await browser.execute(S.readerShowsTitle(RACE_B_TITLE))).toBe(true);
    expect(await browser.execute(S.readerHasText(B_MARKER))).toBe(true);
    expect(await browser.execute(S.readerHasText(A_MARKER))).toBe(false);

    console.log("[reader-race] OK stale A reply dropped, B view intact");
  });
});