import { writeFileSync } from "node:fs";

const shotDir = "C:/Users/chika/AppData/Local/Temp/opencode";

// All Japanese in execute()-driven selectors/assertions is written as \u
// escapes so the spec survives any file re-encoding (the WebDriver
// element-selector API is unreliable with Japanese, execute() is the proven
// path -- see AGENTS context).
const J = {
  discoverLabel: "\u30B5\u30A4\u30C8\u3092\u63A2\u3059", // サイトを探す
  genreTech: "\u30C6\u30AF\u30CE\u30ED\u30B8\u30FC", // テクノロジー
  saveArticle: "\u8A18\u4E8B\u3092\u4FDD\u5B58", // 記事を保存
  saveCancel: "\u4FDD\u5B58\u3092\u89E3\u9664", // 保存を解除
  bookmarkPrefix: "\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF", // ブックマーク
  savedFeed: "\u4FDD\u5B58\u3057\u305F\u8A18\u4E8B", // 保存した記事
  trashOpen: "\u30B4\u30DF\u7BB1\u3092\u958B\u304F", // ゴミ箱を開く
  deleteLabel: "\u30B4\u30DF\u7BB1\u306B\u79FB\u52D5", // ゴミ箱に移動
  restoreBtn: "\u5143\u306B\u623B\u3059", // 元に戻す
  closeBtn: "\u9589\u3058\u308B", // 閉じる
  hatena: "\u306F\u3066\u306A\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF", // はてなブックマーク
};

// The active overlay is the only `.screen-overlay` without `inert` (see
// ScreenOverlay.tsx) -- the rest stay mounted but hidden.
const activeOverlay = `document.querySelector('.screen-overlay:not([inert])')`;
const click = (el) => `(() => { const e = ${el}; if (!e) throw new Error("element missing"); e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; })()`;
const byLabelIn = (scope, label) => `${scope}.querySelector('[aria-label="${label}"]')`;
const byTextIn = (scope, text) => `Array.from(${scope}.querySelectorAll("button")).find(b => b.textContent.trim() === "${text}")`;

// The FilterBar bookmark toggle is the one button whose aria-label starts
// with "ブックマーク" inside `.app-filterbar`; discover card ☆s (also
// "ブックマーク…") live in overlays, so scoping by bar keeps them apart.
const starBtn = `document.querySelector('.app-filterbar button[aria-label^="${J.bookmarkPrefix}"]')`;

const S = {
  starPressed: `(() => { const b = ${starBtn}; return b ? b.getAttribute('aria-pressed') === 'true' : null; })()`,
  clickStar: click(starBtn),
  hasDiscover: `!!${byLabelIn('document', J.discoverLabel)}`,
  clickDiscover: click(byLabelIn('document', J.discoverLabel)),
  hasGenre: `!!${byTextIn('document', J.genreTech)}`,
  clickGenre: click(byTextIn('document', J.genreTech)),
  cardCount: `Array.from(document.querySelectorAll('div[role="button"][aria-expanded]')).length`,
  clickCard0: click(`document.querySelector('div[role="button"][aria-expanded]')`),
  firstCardTitle: `(() => { const c = document.querySelector('div[role="button"][aria-expanded]'); if (!c) return null; const t = c.querySelector(".truncate.font-medium"); return t ? t.textContent.trim() : null; })()`,
  hasSaveArticle: `!!${byTextIn(activeOverlay, J.saveArticle)}`,
  clickSaveArticle: click(byTextIn(activeOverlay, J.saveArticle)),
  hasSaveCancel: `!!${byTextIn(activeOverlay, J.saveCancel)}`,
  overlayHas: (text) => `(() => { const o = ${activeOverlay}; return o ? o.textContent.includes("${text}") : false; })()`,
  cardStarPressed: `(() => { const o = ${activeOverlay}; const s = o ? o.querySelector('div[role="button"][aria-expanded] button[aria-label^="${J.bookmarkPrefix}"]') : null; return s ? s.getAttribute('aria-pressed') === 'true' : null; })()`,
  clickCardStar: click(`(() => { const o = ${activeOverlay}; const s = o ? o.querySelector('div[role="button"][aria-expanded] button[aria-label^="${J.bookmarkPrefix}"]') : null; if (!s) throw new Error("card star missing"); return s; })()`),
  // Timeline rows are role=button divs NOT inside any overlay (discover
  // cards share the role but live in `.screen-overlay`). The saved-article
  // row carries the "保存した記事" feed label.
  savedRowPresent: (title) => `(() => { const t = ${JSON.stringify(title)}; return !!Array.from(document.querySelectorAll('div[role="button"]')).find(r => !r.closest('.screen-overlay') && r.textContent.includes(t) && r.textContent.includes("${J.savedFeed}")); })()`,
  savedRowCount: `Array.from(document.querySelectorAll('div[role="button"]')).filter(r => !r.closest('.screen-overlay') && r.textContent.includes("${J.savedFeed}")).length`,
  clickDeleteSavedRow: click(`(() => { const rows = Array.from(document.querySelectorAll('div[role="button"]')).filter(r => !r.closest('.screen-overlay') && r.textContent.includes("${J.savedFeed}")); const b = rows[0] ? rows[0].querySelector('button[aria-label="${J.deleteLabel}"]') : null; if (!b) throw new Error("saved row delete button missing"); return b; })()`),
  clickTrashOpen: click(byLabelIn('document', J.trashOpen)),
  hasRestore: `!!${byTextIn(activeOverlay, J.restoreBtn)}`,
  trashHas: (title) => `(() => { const o = ${activeOverlay}; return o ? o.textContent.includes(${JSON.stringify(title)}) : false; })()`,
  clickRestoreFor: (title) => click(`(() => { const o = ${activeOverlay}; const b = Array.from(o.querySelectorAll("button")).find(b => b.textContent.trim() === "${J.restoreBtn}" && b.closest("li") && b.closest("li").textContent.includes(${JSON.stringify(title)})); if (!b) throw new Error("restore missing"); return b; })()`),
  clickCloseOverlay: click(byLabelIn(activeOverlay, J.closeBtn)),
  hasNoActiveOverlay: `(${activeOverlay}) === null`,
};

function dump(label, extra = {}) {
  return browser
    .execute(() => {
      const overlay = document.querySelector(".screen-overlay:not([inert])");
      return {
        activeOverlay: overlay ? overlay.textContent.slice(0, 160) : null,
        starPressed: (() => {
          const b = document.querySelector('.app-filterbar button[aria-label^="\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF"]');
          return b ? b.getAttribute("aria-pressed") : null;
        })(),
        savedRows: Array.from(document.querySelectorAll('div[role="button"]'))
          .filter((r) => !r.closest(".screen-overlay") && r.textContent.includes("\u4FDD\u5B58\u3057\u305F\u8A18\u4E8B"))
          .map((r) => r.textContent.slice(0, 60)),
      };
    })
    .then((s) => {
      writeFileSync(`${shotDir}/unified-bookmarks-${label}.json`, JSON.stringify({ ...s, ...extra }, null, 2), "utf8");
      return s;
    });
}

describe("temp unified-bookmarks verify (discover saves merge into bookmark view + trash)", () => {
  it("saves from discover, navigates via the star icon, trashes and restores", async () => {
    try {
      await browser.setWindowSize(420, 680);
    } catch (e) {
      console.log("setWindowSize failed:", e.message);
    }
    await browser.pause(2500);

    // Normalize before the main flow: the E2E data dir persists across runs,
    // so clear any leftover saved-article bookmarks and settle the bookmark
    // filter to OFF.
    await browser.waitUntil(async () => (await browser.execute(S.hasDiscover)) === true, {
      timeout: 20000,
      interval: 500,
    });
    if (await browser.execute(S.starPressed)) {
      await browser.execute(S.clickStar);
      await browser.pause(400);
    }
    await browser.execute(S.clickStar); // bookmark view ON
    await browser.pause(700);
    for (let i = 0; i < 20; i++) {
      const n = await browser.execute(S.savedRowCount);
      if (n === 0) break;
      await browser.execute(S.clickDeleteSavedRow);
      await browser.pause(300);
    }
    await browser.execute(S.clickStar); // bookmark view OFF
    await browser.pause(400);

    // 1. Discover: browse a category and save the first card's article.
    await browser.execute(S.clickDiscover);
    await browser.pause(1200);
    await browser.waitUntil(async () => (await browser.execute(S.hasGenre)) === true, {
      timeout: 10000,
      interval: 500,
    });
    await browser.execute(S.clickGenre);
    await browser.waitUntil(async () => (await browser.execute(S.cardCount)) > 0, {
      timeout: 30000,
      interval: 1000,
    });
    await browser.pause(1000);
    if (!(await browser.execute(S.overlayHas(J.hatena)))) throw new Error("source note (はてなブックマーク) missing");

    const title = await browser.execute(S.firstCardTitle);
    if (!title) throw new Error("could not read first card title");
    await browser.execute(S.clickCard0);
    await browser.pause(400);
    if (!(await browser.execute(S.hasSaveArticle))) throw new Error("no 記事を保存 button on expanded card");
    await browser.execute(S.clickSaveArticle);
    await browser.pause(400);
    if (!(await browser.execute(S.hasSaveCancel))) throw new Error("save did not toggle to 保存を解除");
    await dump("after-save", { title });

    // 2. One-tap from the discover screen: the FilterBar ☆ jumps home to the
    // bookmark view, where the saved article shows with its "保存した記事" label.
    await browser.execute(S.clickStar);
    await browser.waitUntil(async () => (await browser.execute(S.savedRowPresent(title))) === true, {
      timeout: 20000,
      interval: 500,
    });
    await browser.saveScreenshot(`${shotDir}/unified-bookmarks-view.png`);

    // 3. Toggle the filter back off -- the saved article leaves the list
    // (it only lives in the bookmark view).
    await browser.execute(S.clickStar);
    await browser.waitUntil(async () => (await browser.execute(S.savedRowPresent(title))) === false, {
      timeout: 20000,
      interval: 500,
    });

    // 4. Back to discover: the card ☆ is still filled (DB-backed state).
    await browser.execute(S.clickDiscover);
    await browser.pause(800);
    if (!(await browser.execute(S.cardStarPressed))) throw new Error("discover ☆ not pressed after returning");

    // 5. Unstarring the card soft-deletes the bookmark into the trash.
    await browser.execute(S.clickCardStar);
    await browser.pause(500);
    if (await browser.execute(S.cardStarPressed)) throw new Error("card star did not toggle off");

    // 6. The trash lists it; restore brings it back.
    await browser.execute(S.clickTrashOpen);
    await browser.waitUntil(async () => (await browser.execute(S.trashHas(title))) === true, {
      timeout: 10000,
      interval: 500,
    });
    if (!(await browser.execute(S.hasRestore))) throw new Error("no restore button in trash");
    await browser.saveScreenshot(`${shotDir}/unified-bookmarks-trash.png`);
    await browser.execute(S.clickRestoreFor(title));
    await browser.waitUntil(async () => (await browser.execute(S.trashHas(title))) === false, {
      timeout: 10000,
      interval: 500,
    });

    // 7. Close trash, reopen the bookmark view -- the restored article is back.
    await browser.execute(S.clickCloseOverlay);
    await browser.waitUntil(async () => (await browser.execute(S.hasNoActiveOverlay)) === true, {
      timeout: 10000,
      interval: 500,
    });
    await browser.execute(S.clickStar);
    await browser.waitUntil(async () => (await browser.execute(S.savedRowPresent(title))) === true, {
      timeout: 20000,
      interval: 500,
    });
    await browser.saveScreenshot(`${shotDir}/unified-bookmarks-restored.png`);

    await dump("final", { title });
    console.log("[unified-bookmarks] OK title=", JSON.stringify(title));
  });
});