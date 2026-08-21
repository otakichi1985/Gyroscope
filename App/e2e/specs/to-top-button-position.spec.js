// Regression: the floating "一番上に戻る" (scroll-to-top) button must stay
// anchored to the window's bottom-right corner in every skin once the pane is
// scrolled, and stay on top of the content.
//
// Why a dedicated spec: the previous bug only appeared when a style skin was
// selected AND the timeline was scrolled -- the trio of skins (cardinality /
// ordinary / terminal) force `position:relative` on every direct child via a
// `> :not(...)` rule, which dragged the `position:fixed` button to the
// bottom-left; their `:where(button)` reset also squared it. The other suites
// (scroll-keys, ui-audit) only exercise the default skin at scroll-top, so
// they could never catch it. The button carries a `scroll-to-top-btn` class
// the skins exclude from those resets.
//
// Scrolling is done by forcing `scrollTop` rather than pressing End, so the
// check is independent of window height (the E2E window inherits the last saved
// size via the window-state plugin). Skins are switched through the persisted
// appearance store and applied by reloading.

import { seedScrollableFeed, unseedScrollableFeed } from "../seed-reader-data.mjs";

const FEED_URL = "https://top-btn-e2e.example.com/feed.xml";
const GUID_PREFIX = "top-btn-e2e-";
const ENTRY_COUNT = 120;

const APPEARANCE_KEY = "gyroscope:appearance";
const BTN = `button.scroll-to-top-btn`;

// These skins are the ones that reset/were the bug; mono is the neutral
// baseline. Mirror the ordering so the suite stays readable.
const SKINS = ["mono", "link-amber", "ordinary", "terminal"];

const setSkin = (id) => `(() => { const k=${JSON.stringify(APPEARANCE_KEY)}; let o={}; try{o=JSON.parse(localStorage.getItem(k)||"{}");}catch{} o.skinId=${JSON.stringify(id)}; localStorage.setItem(k,JSON.stringify(o)); return 1; })()`;

const probeExpr = `(() => {
  const b = document.querySelector(${JSON.stringify(BTN)});
  if (!b) return { hasButton: false };
  const r = b.getBoundingClientRect();
  const cs = getComputedStyle(b);
  return {
    hasButton: true,
    pos: cs.position,
    z: cs.zIndex,
    innerW: window.innerWidth,
    innerH: window.innerHeight,
    marginRight: Math.round(window.innerWidth - r.right),
    marginBottom: Math.round(window.innerHeight - r.bottom),
  };
})()`;

const scrollToBottomExpr = `(() => { const s = document.querySelector(".entry-list-scroll"); if (!s) return false; s.scrollTop = s.scrollHeight; return true; })()`;

async function reloadAndWait() {
  await browser.execute(() => location.reload());
  await browser.waitUntil(
    async () => (await browser.execute(() => !!document.querySelector(".app-filterbar"))) === true,
    { timeout: 20000, interval: 500 },
  );
  await browser.waitUntil(
    async () => (await browser.execute(`document.querySelectorAll(".entry-list-scroll div[role='button']").length`)) > 0,
    { timeout: 20000, interval: 500 },
  );
}

describe("to-top button stays fixed bottom-right in every skin when scrolled", () => {
  before(async () => {
    await seedScrollableFeed({ feedUrl: FEED_URL, guidPrefix: GUID_PREFIX, count: ENTRY_COUNT });
  });

  after(async () => {
    await setSkinMono();
    await unseedScrollableFeed({ feedUrl: FEED_URL, guidPrefix: GUID_PREFIX });
  });

  async function setSkinMono() {
    await browser.execute(setSkin("mono"));
    await browser.execute(() => location.reload());
  }

  for (const id of SKINS) {
    it(`skin=${id}: button is fixed, bottom-right and on top`, async () => {
      await browser.execute(setSkin(id));
      await reloadAndWait();
      await browser.execute(scrollToBottomExpr);
      await browser.pause(600); // let the scroll listener reset the button's visibility

      const probe = await browser.execute(probeExpr);
      const check = (cond, msg) => {
        if (!cond) throw new Error(`[skin=${id}] ${msg}`);
      };
      check(probe.hasButton, "button present");
      // The bug dragged it to the LEFT (marginRight ~ window width); it must be
      // pinned near the window's right edge instead.
      check(probe.pos === "fixed", `position should be fixed, got ${probe.pos}`);
      check(probe.marginRight >= 8, `near right edge, got marginRight ${probe.marginRight}`);
      check(probe.marginRight <= 24, `not pushed to far left, got marginRight ${probe.marginRight}`);
      check(probe.z === "40", `should sit on top of content, got z-index ${probe.z}`);
    });
  }
});
