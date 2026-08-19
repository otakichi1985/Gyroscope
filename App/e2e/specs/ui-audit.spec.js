// Computational visual audit -- no model vision, no human in the loop.
//  - Layer 1: DOM invariant audit (rendered / hit-test / overflow / contrast)
//    via ../helpers/visual.js. Geometry + computed styles + elementFromPoint
//    proxy for eyesight; the report is numbers/text a text-only model reads.
//  - Layer 2: screenshot pixel-diff vs committed baselines (../baselines/).
//    Numeric metrics only (diff %, changed-region bbox) -- no image viewing.
//  - Layer 3: walks every nav screen, overlay, and theme, auditing after each.
//  - Classification: CLEAR_PASS / CLEAR_FAIL / AMBIGUOUS. Only AMBIGUOUS is
//    meant to be triaged by a human (or flagged for follow-up).
//
// Baselines regenerate deliberately: UPDATE_BASELINES=1 npm run test:e2e -- --spec e2e/specs/ui-audit.spec.js
// Missing baselines auto-create on the first normal run and report BASELINE_CREATED.

import path from "node:path";
import { fileURLToPath } from "node:url";
import { mkdirSync, existsSync } from "node:fs";
import { auditPage, classify, formatReport, installConsoleCollector, drainConsoleErrors } from "../helpers/visual.js";
import { diffPngs } from "../helpers/pixeldiff.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const baselineDir = path.join(__dirname, "..", "baselines");
const shotDir = path.join(process.env.TEMP || "/tmp", "gyroscope-e2e-shots");
const UPDATE = process.env.UPDATE_BASELINES === "1";

mkdirSync(baselineDir, { recursive: true });
mkdirSync(shotDir, { recursive: true });

const J = {
  starPrefix: "\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF", // ブックマーク
  discover: "\u30B5\u30A4\u30C8\u3092\u63A2\u3059", // サイトを探す
  history: "\u65E2\u8AAD\u5C65\u6B74\u3092\u958B\u304F", // 既読履歴を開く
  trash: "\u30B4\u30DF\u7BB1\u3092\u958B\u304F", // ゴミ箱を開く
  feedManager: "\u30D5\u30A3\u30FC\u30C9\u7BA1\u7406\u3092\u958B\u304F", // フィード管理を開く
  settings: "\u5916\u89B3\u8A2D\u5B9A\u3092\u958B\u304F", // 外観設定を開く
  close: "\u9589\u3058\u308B", // 閉じる
  system: "\u30B7\u30B9\u30C6\u30E0", // システム
  light: "\u30E9\u30A4\u30C8", // ライト
  dark: "\u30C0\u30FC\u30AF", // ダーク
};

const activeOverlay = `document.querySelector('.screen-overlay:not([inert])')`;
const click = (el) => `(() => { const e = ${el}; if (!e) throw new Error("element missing"); e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; })()`;
const byLabelIn = (scope, label) => `${scope}.querySelector('[aria-label="${label}"]')`;
const byTextIn = (scope, text) => `Array.from(${scope}.querySelectorAll("button")).find(b => b.textContent.trim() === "${text}")`;
const starBtn = `document.querySelector('.app-filterbar button[aria-label^="${J.starPrefix}"]')`;

const S = {
  starPressed: `(() => { const b = ${starBtn}; return b ? b.getAttribute('aria-pressed') === 'true' : null; })()`,
  clickStar: click(starBtn),
  clickNav: (label) => click(byLabelIn("document", label)),
  clickClose: click(byLabelIn(activeOverlay, J.close)),
  clickThemeMode: (label) => click(byTextIn(activeOverlay, label)),
};

async function auditAndShot(name) {
  await browser.pause(900); // let transitions settle before measuring
  const report = await auditPage(browser);
  const c = classify(report);
  console.log(formatReport(report, name));
  console.log(`[audit] ${name}: dom=${c.verdict} errors=${c.errors.length} warns=${c.warns.length}`);
  const base = path.join(baselineDir, `${name}.png`);
  if (!UPDATE && existsSync(base)) {
    const cur = path.join(shotDir, `${name}.png`);
    await browser.saveScreenshot(cur);
    const d = diffPngs(base, cur);
    console.log(`[shot] ${name}: diff ${JSON.stringify(d)}`);
    return { c, shot: d.error ? "AMBIGUOUS" : d.pctChanged <= 0.5 ? "CLEAR_PASS" : "AMBIGUOUS", diff: d };
  }
  await browser.saveScreenshot(base);
  console.log(`[shot] ${name}: baseline ${UPDATE ? "updated" : "created"} -> ${base}`);
  return { c, shot: "BASELINE_CREATED" };
}

describe("UI audit: computational visual verification (no model vision)", () => {
  it("walks all screens/overlays/themes, audits invariants, captures+diff screenshots", async function () {
    this.timeout(240000);
    try {
      await browser.setWindowSize(900, 760);
    } catch (e) {
      console.log("setWindowSize failed:", e.message);
    }
    await installConsoleCollector(browser);
    await browser.pause(2500);

    const results = {};

    // home (timeline, empty state)
    results.home = await auditAndShot("home");

    // bookmark view (star toggle)
    await browser.execute(S.clickStar);
    await browser.pause(800);
    results.bookmarks = await auditAndShot("bookmarks");
    if (await browser.execute(S.starPressed)) {
      await browser.execute(S.clickStar);
      await browser.pause(500);
    }

    // discover overlay (shell; genre/search/header layout)
    await browser.execute(S.clickNav(J.discover));
    await browser.pause(1200);
    results.discover = await auditAndShot("discover");
    await browser.execute(S.clickClose);
    await browser.pause(500);

    // history overlay
    await browser.execute(S.clickNav(J.history));
    await browser.pause(800);
    results.history = await auditAndShot("history");
    await browser.execute(S.clickClose);
    await browser.pause(500);

    // trash overlay
    await browser.execute(S.clickNav(J.trash));
    await browser.pause(800);
    results.trash = await auditAndShot("trash");
    await browser.execute(S.clickClose);
    await browser.pause(500);

    // feed manager overlay
    await browser.execute(S.clickNav(J.feedManager));
    await browser.pause(800);
    results.feedManager = await auditAndShot("feedManager");
    await browser.execute(S.clickClose);
    await browser.pause(500);

    // settings overlay + theme walk
    await browser.execute(S.clickNav(J.settings));
    await browser.pause(1000);
    results.settings = await auditAndShot("settings");

    await browser.execute(S.clickThemeMode(J.light));
    await browser.pause(900);
    results.settingsLight = await auditAndShot("settings-light");
    await browser.execute(S.clickClose);
    await browser.pause(500);
    results.homeLight = await auditAndShot("home-light");

    await browser.execute(S.clickNav(J.settings));
    await browser.pause(1000);
    await browser.execute(S.clickThemeMode(J.dark));
    await browser.pause(900);
    results.settingsDark = await auditAndShot("settings-dark");
    await browser.execute(S.clickClose);
    await browser.pause(500);
    results.homeDark = await auditAndShot("home-dark");

    // restore system mode
    await browser.execute(S.clickNav(J.settings));
    await browser.pause(1000);
    await browser.execute(S.clickThemeMode(J.system));
    await browser.pause(900);
    await browser.execute(S.clickClose);
    await browser.pause(500);

    const errs = await drainConsoleErrors(browser);
    console.log(`[audit] consoleErrors: ${JSON.stringify(errs)}`);

    const fails = Object.entries(results).filter(([, r]) => r.c.verdict === "CLEAR_FAIL");
    const ambig = Object.entries(results).filter(([, r]) => r.c.verdict === "AMBIGUOUS" || (r.shot !== "CLEAR_PASS" && r.shot !== "BASELINE_CREATED"));
    console.log(`[audit] SUMMARY: screens=${Object.keys(results).length} CLEAR_FAIL=${fails.length} AMBIGUOUS=${ambig.length}`);
    for (const [n, r] of Object.entries(results)) {
      console.log(`[audit]   ${n}: dom=${r.c.verdict} shot=${r.shot}${r.diff && r.diff.bbox ? ` bbox=${JSON.stringify(r.diff.bbox)}` : ""}`);
    }

    // Hard gate: no error-severity structural violations.
    expect(fails).toHaveLength(0);
  });
});