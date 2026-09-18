// Regression: floating skins (link-amber/cardinality, ordinary) sink the
// entry list 64px up behind the toolbar area (see the SINK_PX comment on
// `.skin-floating .entry-list-scroll` in index.css). The new PaneBar sits in
// that band, so without its own plate + z-index the sunk list paints over it
// for hit-testing (mask-image affects paint, not hits) and every pane-bar
// button silently does nothing -- confirmed via elementFromPoint before the
// fix. Also locks the ordinary dev-build pill to an opaque fill: over a bare
// transparent window the translucent amber read as muddy dark.
//
// Seeded with articles so the scroll list actually exists (empty state
// renders no list and cannot reproduce the overlap). Clicks go through
// browser.execute + DOM (el.click()), the standard workaround for this
// harness's slow WebDriver element operations (see VERIFY.md).

import { seedScrollableFeed, unseedScrollableFeed } from "../seed-reader-data.mjs";

const FEED_URL = "https://floating-panebar-e2e.example.com/feed.xml";
const GUID_PREFIX = "floating-panebar-e2e-";
const APPEARANCE_KEY = "gyroscope:appearance";

const setSkin = (id) => `(() => { const k=${JSON.stringify(APPEARANCE_KEY)}; let o={}; try{o=JSON.parse(localStorage.getItem(k)||"{}");}catch{} o.skinId=${JSON.stringify(id)}; localStorage.setItem(k,JSON.stringify(o)); return 1; })()`;

const hitPaneBarExpr = `(() => {
  const btn = document.querySelector(".pane-bar button");
  if (!btn) return { missing: true };
  const r = btn.getBoundingClientRect();
  const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
  return { hit: hit ? (hit.tagName + "." + [...hit.classList].slice(0, 3).join(".")) : "null" };
})()`;

const clickPaneBarMainExpr = `(() => {
  const btns = [...document.querySelectorAll(".pane-bar button")];
  const main = btns.find((b) => b.textContent === "並べて表示" || b.textContent === "1つに戻す");
  if (!main) return null;
  main.click();
  return main.textContent;
})()`;

const devPillAlphaExpr = `(() => {
  const pill = [...document.querySelectorAll(".app-filterbar span")].find((s) => s.textContent === "開発版");
  if (!pill) return { missing: true };
  const bg = getComputedStyle(pill).backgroundColor;
  const m = bg.match(/rgba?\\(([^)]+)\\)/);
  const parts = m ? m[1].split(",").map((s) => s.trim()) : [];
  return { bg, alpha: parts.length === 4 ? parseFloat(parts[3]) : 1 };
})()`;

async function setSkinAndReload(id) {
  await browser.execute(setSkin(id));
  await browser.execute(() => location.reload());
  await browser.waitUntil(
    async () => (await browser.execute(() => !!document.querySelector(".app-filterbar"))) === true,
    { timeout: 20000, interval: 500 },
  );
  await browser.waitUntil(
    async () => (await browser.execute(`document.querySelectorAll(".entry-list-scroll div[role='button']").length`)) > 0,
    { timeout: 20000, interval: 500 },
  );
  await browser.pause(500);
}

describe("floating skins: pane-bar stays clickable, dev pill stays legible", () => {
  before(async () => {
    await seedScrollableFeed({ feedUrl: FEED_URL, guidPrefix: GUID_PREFIX, count: 120 });
  });

  after(async () => {
    await browser.execute(setSkin("mono"));
    await browser.execute(() => location.reload());
    await unseedScrollableFeed({ feedUrl: FEED_URL, guidPrefix: GUID_PREFIX });
  });

  it("link-amber: pane-bar button receives clicks with articles present", async () => {
    await setSkinAndReload("link-amber");
    const probe = await browser.execute(hitPaneBarExpr);
    if (!probe.hit || !probe.hit.startsWith("BUTTON")) {
      throw new Error(`pane-bar button is covered, hit=${probe.hit}`);
    }
    await browser.execute(clickPaneBarMainExpr);
    await browser.waitUntil(
      async () => (await browser.execute(`document.querySelectorAll(".timeline-toolbar").length`)) === 2,
      { timeout: 10000, interval: 300 },
    );
    // Back to single pane for a clean persisted state.
    await browser.execute(clickPaneBarMainExpr);
    await browser.waitUntil(
      async () => (await browser.execute(`document.querySelectorAll(".timeline-toolbar").length`)) === 1,
      { timeout: 10000, interval: 300 },
    );
  });

  it("ordinary: pane-bar button receives clicks, dev pill is opaque", async () => {
    await setSkinAndReload("ordinary");
    const probe = await browser.execute(hitPaneBarExpr);
    if (!probe.hit || !probe.hit.startsWith("BUTTON")) {
      throw new Error(`pane-bar button is covered, hit=${probe.hit}`);
    }
    const pill = await browser.execute(devPillAlphaExpr);
    if (pill.missing) throw new Error("dev pill not found");
    if (pill.alpha !== 1) throw new Error(`dev pill should be opaque, got ${pill.bg}`);
  });
});
