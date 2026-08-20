// Observation harness for the reported bug: in a floating skin
// (カーディナリティ / オーディナリー), the search box's own <input> is
// supposedly only typeable right when it is expanded from the search icon.
// This does not assert a fix -- it records what actually happens on the
// real Tauri window (focus target, document.hasFocus(), keystrokes reaching
// the input) so the root cause can be confirmed before touching any code.
//
// Setup steps (opening Settings, switching skin, closing the overlay) are
// driven via browser.execute() + native DOM .click() rather than WebdriverIO
// element clicks: this app keeps every screen overlay mounted at all times
// (just `inert` + translated off-screen when inactive -- see
// ScreenOverlay.tsx), and WebdriverIO's isDisplayed()/click() geometry
// checks don't treat that the same way a real user's mouse would, which
// made pure-WebdriverIO setup unreliable. The actual thing under test --
// clicking the search icon and typing into the input -- stays on real
// WebdriverIO commands so it exercises the same input path a real user does.

async function clickByText(text) {
  const clicked = await browser.execute((t) => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent.trim() === t,
    );
    if (!btn) return false;
    btn.click();
    return true;
  }, text);
  return clicked;
}

async function clickByAriaLabel(label) {
  const clicked = await browser.execute((l) => {
    const btn = document.querySelector(`button[aria-label="${l}"]`);
    if (!btn) return false;
    btn.click();
    return true;
  }, label);
  return clicked;
}

// WebDriver element operations (`$()` findElement and `element.click()`) are
// pathologically slow on this tauri-driver + msedgedriver + WebView2 harness
// (~15s / ~23s each, regardless of skin -- measured), while `browser.execute`
// and `browser.keys` are fast. Click/query through execute + DOM and send real
// input via keys(), so the search-focus/input path is still exercised without
// the harness stalls.
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

describe("浮遊スキンの検索欄フォーカス", () => {
  it("設定を開いてカーディナリティへ切り替え、閉じる", async () => {
    expect(await clickByAriaLabel("設定を開く")).toBe(true);
    await browser.pause(300);
    expect(await clickByText("カーディナリティ")).toBe(true);
    await browser.pause(300);
    expect(await clickByAriaLabel("閉じる")).toBe(true);
    await browser.pause(300);

    const skinApplied = await browser.execute(
      () => document.querySelector(".skin-cardinality") !== null,
    );
    expect(skinApplied).toBe(true);
  });

  it("検索アイコンをクリックした直後のフォーカス状態を記録する", async () => {
    await waitForSelector('button[aria-label="記事を検索"]');
    await clickBySelector('button[aria-label="記事を検索"]');

    // Give the app's own requestAnimationFrame-deferred focus() a real
    // chance to run -- the real window is visible/foregrounded here,
    // unlike the earlier plain-browser probe.
    await browser.pause(500);

    const state = await browser.execute(() => {
      const input = document.querySelector('input[placeholder="記事を検索"]');
      return {
        hasWindowFocus: document.hasFocus(),
        visibilityState: document.visibilityState,
        activeTag: document.activeElement && document.activeElement.tagName,
        activeIsSearchInput: document.activeElement === input,
        inputExists: !!input,
      };
    });
    console.log("[search-focus] after icon click:", JSON.stringify(state));

    expect(state.inputExists).toBe(true);
    // Not asserted as pass/fail on purpose yet -- this run is for
    // observation. Once the cause is confirmed, tighten this into a real
    // assertion (expect(state.activeIsSearchInput).toBe(true)).
  });

  it("フォーカスされた状態でキー入力が実際に届くか確認する", async () => {
    await waitForSelector('input[placeholder="記事を検索"]');
    await browser.keys(["t", "e", "s", "t"]);
    await browser.pause(200);
    const value = await readValue('input[placeholder="記事を検索"]');
    console.log(
      "[search-focus] input value after keys() (no explicit focus/click):",
      JSON.stringify(value),
    );
  });

  it("検索欄をクリックし直した場合のフォーカス状態を記録する（アイコン経由ではない再フォーカス）", async () => {
    await waitForSelector('input[placeholder="記事を検索"]');
    await clickBySelector('input[placeholder="記事を検索"]');
    await browser.pause(200);

    const state = await browser.execute(() => {
      const el = document.querySelector('input[placeholder="記事を検索"]');
      return {
        activeIsSearchInput: document.activeElement === el,
        activeTag: document.activeElement && document.activeElement.tagName,
      };
    });
    console.log("[search-focus] after direct input click:", JSON.stringify(state));

    await browser.keys(["m", "o", "r", "e"]);
    await browser.pause(200);
    const value = await readValue('input[placeholder="記事を検索"]');
    console.log("[search-focus] input value after second keys():", JSON.stringify(value));
  });
});

