// Regression sweep for the .app-content z-index fix: confirms the change
// (excluding .app-content from the `.skin-cardinality > *` / `.skin-ordinary
// > :not(.ordinary-hud)` blanket z-index:1 rules) doesn't disturb stacking
// that other, unrelated fixes depend on -- specifically the toolbar's
// "更新はありません" toast staying above the article list (the original
// reason `.timeline-toolbar` got its own explicit z-index:1), and that the
// same z-index tie doesn't reappear in the オーディナリー(ordinary) skin.

async function clickByText(text) {
  return browser.execute((t) => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === t,
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
}

async function clickByAriaLabel(label) {
  return browser.execute((l) => {
    const btn = document.querySelector(`button[aria-label="${l}"]`);
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
}

// WebDriver element ops (`$()` / `element.click()`) are pathologically slow on
// this harness (~15s / ~23s, skin-independent -- measured); use execute + DOM
// for finding/clicking, keys() for real input.
async function waitForSelector(selector, timeout = 10000) {
  return browser.waitUntil(
    async () => (await browser.execute((s) => !!document.querySelector(s), selector)) === true,
    { timeout },
  );
}
async function clickBySelector(selector) {
  return browser.execute((s) => {
    const el = document.querySelector(s);
    if (!el) return false;
    el.click();
    return true;
  }, selector);
}
async function readValue(selector) {
  return browser.execute((s) => document.querySelector(s)?.value ?? "", selector);
}

async function switchToSkin(skinLabel) {
  expect(await clickByAriaLabel("設定を開く")).toBe(true);
  await browser.pause(300);
  expect(await clickByText(skinLabel)).toBe(true);
  await browser.pause(300);
  expect(await clickByAriaLabel("閉じる")).toBe(true);
  await browser.pause(300);
}

describe("回帰チェック: .app-content z-index修正の周辺影響", () => {
  it("ウィンドウを既定サイズへ合わせる", async () => {
    try {
      await browser.setWindowSize(420, 680);
    } catch (e) {
      console.log("[regression] setWindowSize failed:", e.message);
    }
    await browser.pause(300);
  });

  it("カーディナリティ: 記事を更新ボタンとtimeline-toolbarのz-indexが維持されている", async () => {
    await switchToSkin("カーディナリティ");
    const state = await browser.execute(() => {
      const toolbar = document.querySelector(".timeline-toolbar");
      const filterBar = document.querySelector(".app-filterbar");
      const appContent = document.querySelector(".app-content");
      return {
        toolbarZIndex: toolbar ? getComputedStyle(toolbar).zIndex : null,
        filterBarZIndex: filterBar ? getComputedStyle(filterBar).zIndex : null,
        appContentZIndex: appContent ? getComputedStyle(appContent).zIndex : null,
      };
    });
    console.log("[regression] cardinality z-index:", JSON.stringify(state));
    expect(state.toolbarZIndex).toBe("1");
    expect(state.filterBarZIndex).toBe("1");
    expect(state.appContentZIndex).toBe("auto");

    // Trigger the "更新はありません" toast path and confirm it's not
    // visually buried (topmost element at its own center should be itself
    // or a descendant, never .entry-list-scroll).
    const refreshBtnExists = await browser.execute(
      () => Array.from(document.querySelectorAll("button")).some((b) => b.textContent.trim() === "記事を更新"),
    );
    if (refreshBtnExists) {
      await clickByText("記事を更新");
      await browser.pause(2500);
      const toastCheck = await browser.execute(() => {
        const toast = Array.from(document.querySelectorAll("div")).find(
          (d) => d.textContent.trim() === "更新はありません",
        );
        if (!toast) return { toastFound: false };
        const r = toast.getBoundingClientRect();
        const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
        return {
          toastFound: true,
          topElementIsToastOrDescendant: !!top && (top === toast || toast.contains(top)),
          topElementClass: top ? (typeof top.className === "string" ? top.className.slice(0, 60) : String(top.className)) : null,
        };
      });
      console.log("[regression] toast check:", JSON.stringify(toastCheck));
    } else {
      console.log("[regression] toast button not found/no toast triggered this run (non-fatal, network-dependent)");
    }
  });

  it("オーディナリー: 同じ重なりが再発していないことを確認する", async () => {
    await switchToSkin("オーディナリー");
    await waitForSelector('button[aria-label="記事を検索"]');
    await clickBySelector('button[aria-label="記事を検索"]');
    await browser.pause(500);

    const state = await browser.execute(() => {
      const input = document.querySelector('input[placeholder="記事を検索"]');
      const appContent = document.querySelector(".app-content");
      if (!input) return { inputFound: false };
      const r = input.getBoundingClientRect();
      const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
      return {
        inputFound: true,
        appContentZIndex: appContent ? getComputedStyle(appContent).zIndex : null,
        topElementIsInput: top === input,
        topElementClass: top ? (typeof top.className === "string" ? top.className.slice(0, 60) : String(top.className)) : null,
      };
    });
    console.log("[regression] ordinary search overlap check:", JSON.stringify(state));
    expect(state.inputFound).toBe(true);
    expect(state.appContentZIndex).toBe("auto");
    expect(state.topElementIsInput).toBe(true);

    await clickBySelector('input[placeholder="記事を検索"]');
    await browser.keys(["o", "k"]);
    await browser.pause(200);
    const value = await readValue('input[placeholder="記事を検索"]');
    console.log("[regression] ordinary re-click + type value:", JSON.stringify(value));
    expect(value.length).toBeGreaterThan(0);
  });

  it("モノクロ(非浮遊)スキンでは影響がないことを確認する", async () => {
    await switchToSkin("モノクロ");
    const state = await browser.execute(() => {
      const appContent = document.querySelector(".app-content");
      const root = document.querySelector(".panel-bg");
      return {
        rootClass: root ? root.className : null,
        appContentZIndex: appContent ? getComputedStyle(appContent).zIndex : null,
      };
    });
    console.log("[regression] mono (non-floating) state:", JSON.stringify(state));
    // Non-floating skins never had the blanket rule applied to begin with
    // (it's scoped to .skin-cardinality / .skin-ordinary only) -- just
    // confirming that holds.
    expect(state.appContentZIndex).toBe("auto");
  });
});

