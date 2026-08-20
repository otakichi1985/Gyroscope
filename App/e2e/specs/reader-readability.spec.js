import { writeFileSync } from "node:fs";
import { seedReaderData, unseedReaderData } from "../seed-reader-data.mjs";

const shotDir = "C:/Users/chika/AppData/Local/Temp/opencode";

// Reader readability regression spec. Seeds one article into the E2E DB in
// before() (its HTML contains inline styles, a heading hierarchy, a blockquote,
// code, a link and a table) and removes it again in after(), so other specs --
// especially the ui-audit pixel baselines, which expect an empty timeline --
// are unaffected regardless of suite order. Verifies:
//   1. the author's inline style/color/size are stripped (theme wins)
//   2. blockquote is no longer dimmed (opacity 1)
//   3. wide tables are wrapped in a scrollable container instead of clipping
//   4. heading hierarchy is visible (h1 > body)
//   5. the 文字設定 panel adjusts font size / line height / column width live
//   6. the "不透明度を保つ" toggle only appears for floating skins
//   7. 本文フォント アプリのフォント/ゴシック/明朝 + コードフォント 等幅/本文 switch live
//   8. each element color (本文/見出し/引用/コード/リンク) can be overridden
//      with a theme-adaptive preset swatch and reset back to the theme
//   9. リンクをコピー copies the article URL to the OS clipboard

const activeOverlay = `document.querySelector('.screen-overlay:not([inert])')`;
const click = (el) =>
  `(() => { const e = ${el}; if (!e) throw new Error("element missing"); e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; })()`;

/// "#2563eb" -> "rgb(37, 99, 235)", matching how browsers serialize the
/// computed color of a hex-declared preset.
function hexToRgb(hex) {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) throw new Error(`bad hex: ${hex}`);
  return `rgb(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)})`;
}

const S = {
  // First timeline row (role=button divs live in .app-content, not overlays).
  hasTimelineRow: `(() => { const r = document.querySelector('.app-content div[role="button"]'); return !!(r && r.textContent.includes("E2Eリーダー検証記事")); })()`,
  clickTimelineRow: click(`document.querySelector('.app-content div[role="button"]')`),
  readerOpen: `(() => { const o = ${activeOverlay}; return !!o && o.textContent.includes("E2Eリーダー検証記事"); })()`,
  hasNoInlineStyle: `(() => { const o = ${activeOverlay}; const c = o ? o.querySelector(".reader-content") : null; if (!c) return null; return Array.from(c.querySelectorAll("p")).every(p => !p.hasAttribute("style")); })()`,
  bodyFontSize: `(() => { const o = ${activeOverlay}; const c = o ? o.querySelector(".reader-content") : null; return c ? getComputedStyle(c).fontSize : null; })()`,
  bodyLineHeight: `(() => { const o = ${activeOverlay}; const c = o ? o.querySelector(".reader-content") : null; return c ? getComputedStyle(c).lineHeight : null; })()`,
  h1FontSize: `(() => { const o = ${activeOverlay}; const h = o ? o.querySelector(".reader-content h1") : null; return h ? getComputedStyle(h).fontSize : null; })()`,
  blockquoteOpacity: `(() => { const o = ${activeOverlay}; const q = o ? o.querySelector(".reader-content blockquote") : null; return q ? getComputedStyle(q).opacity : null; })()`,
  tableWrapped: `(() => { const o = ${activeOverlay}; return !!o && !!o.querySelector(".reader-content .reader-table-wrap table"); })()`,
  scrollMaxWidthVar: `(() => { const o = ${activeOverlay}; const s = o ? o.querySelector(".allow-text-selection") : null; return s ? getComputedStyle(s).getPropertyValue("--reader-max-width").trim() : null; })()`,
  columnMaxWidth: `(() => { const o = ${activeOverlay}; const col = o ? o.querySelector(".reader-column") : null; return col ? getComputedStyle(col).maxWidth : null; })()`,
  // Settings panel
  hasSettingsButton: `(() => { const o = ${activeOverlay}; return !!o && Array.from(o.querySelectorAll("button")).some(b => b.textContent.trim() === "文字設定"); })()`,
  clickSettingsButton: click(`(() => { const o = ${activeOverlay}; const b = Array.from(o.querySelectorAll("button")).find(b => b.textContent.trim() === "文字設定"); if (!b) throw new Error("文字設定 button missing"); return b; })()`),
  panelHasGroups: `(() => { const o = ${activeOverlay}; return !!o && o.textContent.includes("文字サイズ") && o.textContent.includes("行間") && o.textContent.includes("列幅"); })()`,
  panelHasHint: `(() => { const o = ${activeOverlay}; return !!o && o.textContent.includes("元サイトの色や文字サイズの指定は読書画面では取り除かれ"); })()`,
  hasOpacitySwitch: `(() => { const o = ${activeOverlay}; return !!o && !!o.querySelector('button[role="switch"]'); })()`,
  // Find the segmented group by its label, then a button inside it by text.
  groupButton: (label, value) =>
    `(() => { const o = ${activeOverlay}; const root = Array.from(o.querySelectorAll("div")).find((d) => { const l = d.children[0]; return l && l.textContent && l.textContent.trim() === "${label}"; }); if (!root) return null; const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent.trim() === "${value}"); return b || null; })()`,
  clickGroupButton: (label, value) =>
    click(`(() => { const o = ${activeOverlay}; const root = Array.from(o.querySelectorAll("div")).find((d) => { const l = d.children[0]; return l && l.textContent && l.textContent.trim() === "${label}"; }); if (!root) throw new Error("group ${label} missing"); const b = Array.from(root.querySelectorAll("button")).find((x) => x.textContent.trim() === "${value}"); if (!b) throw new Error("button ${value} missing"); return b; })()`),
  // Color rows: a div whose first element child is a <span> with the label
  // text (SegmentedGroup labels are <div>s, so this only matches ColorRow).
  // Each row is a row of preset swatches; the hollow one is "テーマの色".
  colorSwatch: (label, presetLabel) =>
    `(() => { const o = ${activeOverlay}; const row = Array.from(o.querySelectorAll("div")).find((d) => { const s = d.children[0]; return s && s.tagName === "SPAN" && s.textContent.trim() === "${label}"; }); if (!row) return null; return Array.from(row.querySelectorAll("button")).find((b) => b.getAttribute("aria-label") === "${label}: ${presetLabel}") || null; })()`,
  colorSwatchColor: (label, presetLabel) =>
    `(() => { const o = ${activeOverlay}; const row = Array.from(o.querySelectorAll("div")).find((d) => { const s = d.children[0]; return s && s.tagName === "SPAN" && s.textContent.trim() === "${label}"; }); if (!row) return null; const b = Array.from(row.querySelectorAll("button")).find((x) => x.getAttribute("aria-label") === "${label}: ${presetLabel}"); return b ? b.getAttribute("data-color") : null; })()`,
  clickColorSwatch: (label, presetLabel) =>
    click(`(() => { const o = ${activeOverlay}; const row = Array.from(o.querySelectorAll("div")).find((d) => { const s = d.children[0]; return s && s.tagName === "SPAN" && s.textContent.trim() === "${label}"; }); if (!row) throw new Error("color row ${label} missing"); const b = Array.from(row.querySelectorAll("button")).find((x) => x.getAttribute("aria-label") === "${label}: ${presetLabel}"); if (!b) throw new Error("swatch ${label}: ${presetLabel} missing"); return b; })()`),
  bodyFontFamily: `(() => { const o = ${activeOverlay}; const c = o ? o.querySelector(".reader-content") : null; return c ? getComputedStyle(c).fontFamily : null; })()`,
  codeFontFamily: `(() => { const o = ${activeOverlay}; const c = o ? o.querySelector(".reader-content code") : null; return c ? getComputedStyle(c).fontFamily : null; })()`,
  bodyColor: `(() => { const o = ${activeOverlay}; const c = o ? o.querySelector(".reader-content") : null; return c ? getComputedStyle(c).color : null; })()`,
  h1Color: `(() => { const o = ${activeOverlay}; const h = o ? o.querySelector(".reader-content h1") : null; return h ? getComputedStyle(h).color : null; })()`,
  copyButtonText: `(() => { const o = ${activeOverlay}; const b = o ? o.querySelector('[data-testid="reader-copy-link"]') : null; return b ? b.textContent.trim() : null; })()`,
};

function dump(label, extra = {}) {
  return browser
    .execute(() => {
      const overlay = document.querySelector(".screen-overlay:not([inert])");
      return {
        bodyFontSize: overlay?.querySelector(".reader-content") ? getComputedStyle(overlay.querySelector(".reader-content")).fontSize : null,
        bodyLineHeight: overlay?.querySelector(".reader-content") ? getComputedStyle(overlay.querySelector(".reader-content")).lineHeight : null,
        colVar: overlay?.querySelector(".allow-text-selection") ? getComputedStyle(overlay.querySelector(".allow-text-selection")).getPropertyValue("--reader-max-width").trim() : null,
        panelOpen: overlay ? overlay.textContent.includes("文字サイズ") : false,
      };
    })
    .then((s) => {
      writeFileSync(`${shotDir}/reader-readability-${label}.json`, JSON.stringify({ ...s, ...extra }, null, 2), "utf8");
      return s;
    });
}

describe("reader readability: theme wins + adjustable typography", () => {
  before(async () => {
    await seedReaderData();
  });

  after(() => {
    unseedReaderData();
  });

  it("strips inline styles, wraps tables, and applies 文字設定 live", async () => {
    try {
      await browser.setWindowSize(420, 680);
    } catch (e) {
      console.log("setWindowSize failed:", e.message);
    }
    await browser.waitUntil(
      async () => (await browser.execute(() => !!document.querySelector(".app-filterbar"))) === true,
      { timeout: 20000, interval: 500 },
    );

    // Deterministic starting point: drop any reader settings a previous run
    // left in localStorage, then reload the frontend so the store re-reads.
    await browser.execute(() => localStorage.removeItem("gyroscope:appearance"));
    await browser.execute(() => location.reload());
    await browser.waitUntil(
      async () => (await browser.execute(() => !!document.querySelector(".app-filterbar"))) === true,
      { timeout: 20000, interval: 500 },
    );

    // 1. Open the seeded article in the reader.
    await browser.waitUntil(async () => (await browser.execute(S.hasTimelineRow)) === true, {
      timeout: 20000,
      interval: 500,
    });
    await browser.execute(S.clickTimelineRow);
    await browser.waitUntil(async () => (await browser.execute(S.readerOpen)) === true, {
      timeout: 20000,
      interval: 500,
    });
    await browser.pause(600);

    // 2. The author's inline style must be gone from every paragraph.
    expect(await browser.execute(S.hasNoInlineStyle)).toBe(true);

    // 3. Typography: body at a reader font size, headings larger than body.
    const bodyFont = await browser.execute(S.bodyFontSize);
    const bodyLine = await browser.execute(S.bodyLineHeight);
    const h1Font = await browser.execute(S.h1FontSize);
    if (!["13px", "15px", "17px", "19px"].includes(bodyFont)) {
      throw new Error(`unexpected reader body font-size: ${bodyFont}`);
    }
    if (parseFloat(h1Font) <= parseFloat(bodyFont)) {
      throw new Error(`heading not larger than body: h1=${h1Font} body=${bodyFont}`);
    }
    console.log("[reader-readability] bodyFontSize=", bodyFont, "h1=", h1Font, "lineHeight=", bodyLine);

    // 4. Blockquote no longer dimmed; table wrapped for horizontal scroll.
    expect(await browser.execute(S.blockquoteOpacity)).toBe("1");
    expect(await browser.execute(S.tableWrapped)).toBe(true);
    await browser.saveScreenshot(`${shotDir}/reader-readability-initial.png`);
    await dump("initial");

    // 5. Open 文字設定 and change every axis live.
    if (!(await browser.execute(S.hasSettingsButton))) throw new Error("no 文字設定 header button");
    await browser.execute(S.clickSettingsButton);
    await browser.waitUntil(async () => (await browser.execute(S.panelHasGroups)) === true, {
      timeout: 10000,
      interval: 500,
    });
    if (!(await browser.execute(S.panelHasHint))) throw new Error("panel hint text missing");
    // mono (default) is not floating -> the opacity toggle must be hidden.
    if (await browser.execute(S.hasOpacitySwitch)) throw new Error("opacity toggle shown for non-floating skin");

    await browser.execute(S.clickGroupButton("文字サイズ", "大"));
    await browser.pause(300);
    const bigFont = await browser.execute(S.bodyFontSize);
    if (bigFont !== "17px") throw new Error(`font-size did not become 17px: ${bigFont}`);

    await browser.execute(S.clickGroupButton("行間", "広い"));
    await browser.pause(300);
    const looseLine = await browser.execute(S.bodyLineHeight);
    const ratio = parseFloat(looseLine) / parseFloat(bigFont);
    if (Math.abs(ratio - 2.05) > 0.001) throw new Error(`line-height ratio not 2.05: ${looseLine}`);

    await browser.execute(S.clickGroupButton("列幅", "狭い"));
    await browser.pause(300);
    const colVar = await browser.execute(S.scrollMaxWidthVar);
    if (colVar !== "32em") throw new Error(`--reader-max-width not 32em: ${colVar}`);

    // 6. 本文フォント: アプリのフォント (default, inherits the app font) -> 明朝.
    // With no global font set in this clean state the reader inherits the app
    // default sans, so the same sans check still applies.
    const sansFamily = await browser.execute(S.bodyFontFamily);
    if (!/system-ui|Yu Gothic UI|Meiryo|sans-serif/i.test(sansFamily)) {
      throw new Error(`unexpected default body font: ${sansFamily}`);
    }
    await browser.execute(S.clickGroupButton("本文フォント", "明朝"));
    await browser.pause(300);
    const serifFamily = await browser.execute(S.bodyFontFamily);
    if (!/Yu Mincho|serif/i.test(serifFamily)) {
      throw new Error(`body font did not switch to serif: ${serifFamily}`);
    }

    // 7. コードフォント: 等幅 (default) -> 本文に合わせる (equals body).
    const monoFamily = await browser.execute(S.codeFontFamily);
    if (!/monospace|ui-monospace|Consolas/i.test(monoFamily)) {
      throw new Error(`code font not monospace by default: ${monoFamily}`);
    }
    await browser.execute(S.clickGroupButton("コードフォント", "本文に合わせる"));
    await browser.pause(300);
    const codeFollowsBody = await browser.execute(S.codeFontFamily);
    if (codeFollowsBody !== serifFamily) {
      throw new Error(`code font did not follow body: code=${codeFollowsBody} body=${serifFamily}`);
    }

    // 8. Element colors: a preset swatch tints the element (its data-color is
    // the exact resolved color for the active theme) and the テーマの色 swatch
    // resets it back to the theme.
    const bodyInfo = await browser.execute(S.colorSwatchColor("本文", "青"));
    if (!bodyInfo) throw new Error("no 青 swatch for 本文");
    await browser.execute(S.clickColorSwatch("本文", "青"));
    await browser.pause(300);
    const bodyColored = await browser.execute(S.bodyColor);
    if (bodyColored !== hexToRgb(bodyInfo)) {
      throw new Error(`body color not applied: ${bodyColored} expected ${hexToRgb(bodyInfo)}`);
    }
    const headingDanger = await browser.execute(S.colorSwatchColor("見出し", "赤"));
    if (!headingDanger) throw new Error("no 赤 swatch for 見出し");
    await browser.execute(S.clickColorSwatch("見出し", "赤"));
    await browser.pause(300);
    const headingColored = await browser.execute(S.h1Color);
    if (headingColored !== hexToRgb(headingDanger)) {
      throw new Error(`heading color not applied: ${headingColored} expected ${hexToRgb(headingDanger)}`);
    }
    await browser.execute(S.clickColorSwatch("本文", "テーマの色"));
    await browser.pause(300);
    const bodyReset = await browser.execute(S.bodyColor);
    if (bodyReset === hexToRgb(bodyInfo)) {
      throw new Error(`body color did not reset to theme: ${bodyReset}`);
    }

    // 9. リンクをコピー: a trusted click copies the article URL to the OS
    // clipboard and the button briefly shows コピーしました. (DOM click via
    // execute -- WebDriver element.click() is pathologically slow on this
    // harness, and the copy handler itself still runs navigator.clipboard.)
    await browser.execute(() => {
      const b = document.querySelector('[data-testid="reader-copy-link"]');
      if (!b) throw new Error("copy link button missing");
      b.click();
      return true;
    });
    await browser.pause(400);
    const copyLabel = await browser.execute(S.copyButtonText);
    if (copyLabel !== "コピーしました") throw new Error(`copy feedback missing: ${copyLabel}`);
    const { execSync } = await import("node:child_process");
    const clip = execSync("powershell -NoProfile -Command Get-Clipboard", { encoding: "utf8" }).trim();
    if (clip !== "https://example.com/article/1") {
      throw new Error(`clipboard does not contain the article link: ${JSON.stringify(clip)}`);
    }

    await browser.saveScreenshot(`${shotDir}/reader-readability-adjusted.png`);
    await dump("adjusted", { bigFont, looseLine, colVar });

    console.log(
      "[reader-readability] OK inlineStyleStripped blockquoteOpacity=1 tableWrapped font=",
      bigFont,
      "lineRatio=",
      ratio.toFixed(2),
      "col=",
      colVar,
    );
  });
});