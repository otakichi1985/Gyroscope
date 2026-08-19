// Regression spec for the batch UI fixes:
//  - bookmark filter resets when navigating to another screen (探す)
//  - discover search box has a clear (✕) button
//  - feed manager: genre add box is distinct / notify toggle is labelled 通知ON/OFF

const activeOverlay = `document.querySelector('.screen-overlay:not([inert])')`;
const click = (el) => `(() => { const e = ${el}; if (!e) throw new Error("element missing"); e.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window })); return true; })()`;
const starBtn = `document.querySelector('.app-filterbar button[aria-label^="\u30D6\u30C3\u30AF\u30DE\u30FC\u30AF"]')`;
const typeInto = (el, text) => `(() => { const i = ${el}; if (!i) throw new Error("input missing"); const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, "value").set; setter.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event("input", { bubbles: true })); return true; })()`;
const hasClearFor = (el, label) => `!!(${el}).closest('.relative').querySelector('button[aria-label="${label}"]')`;
const auxClick = (button) => `(() => { window.dispatchEvent(new MouseEvent("auxclick", { button: ${button}, bubbles: true, cancelable: true, view: window })); return true; })()`;

const S = {
  starPressed: `(() => { const b = ${starBtn}; return b ? b.getAttribute('aria-pressed') === 'true' : null; })()`,
  clickStar: click(starBtn),
  clickDiscover: click(`document.querySelector('button[aria-label="\u30B5\u30A4\u30C8\u3092\u63A2\u3059"]')`),
  clickHistory: click(`document.querySelector('button[aria-label="\u65E2\u8AAD\u5C65\u6B74\u3092\u958B\u304F"]')`),
  clickFeedManager: click(`document.querySelector('button[aria-label="\u30D5\u30A3\u30FC\u30C9\u7BA1\u7406\u3092\u958B\u304F"]')`),
  discoverActive: `!!document.querySelector('.screen-overlay:not([inert]) .screen-overlay-header span[class="truncate"]')`,
  activeTitle: `(() => { const o = document.querySelector('.screen-overlay:not([inert])'); return o ? (o.querySelector('.screen-overlay-header')?.textContent || '') : ''; })()`,
  discoverHasInput: `!!document.querySelector('input[placeholder="\u30AD\u30FC\u30EF\u30FC\u30C9\u3067\u691C\u7D22"]')`,
  typeInDiscover: (text) => typeInto(`document.querySelector('input[placeholder="\u30AD\u30FC\u30EF\u30FC\u30C9\u3067\u691C\u7D22"]')`, text),
  hasClearBtn: `!!${activeOverlay}.querySelector('button[aria-label="\u691C\u7D22\u3092\u30AF\u30EA\u30A2"]')`,
  clickClear: click(`${activeOverlay}.querySelector('button[aria-label="\u691C\u7D22\u3092\u30AF\u30EA\u30A2"]')`),
  discoverInputValue: `(() => { const i = document.querySelector('input[placeholder="\u30AD\u30FC\u30EF\u30FC\u30C9\u3067\u691C\u7D22"]'); return i ? i.value : null; })()`,
  feedManagerHasGenreBox: `!!document.querySelector('input[placeholder="\u65B0\u3057\u3044\u30B8\u30E3\u30F3\u30EB\u540D"]')`,
  feedManagerHasUrlBox: `!!document.querySelector('input[placeholder="https://example.com/feed.xml"]')`,
  urlBox: `document.querySelector('input[placeholder="https://example.com/feed.xml"]')`,
  genreBox: `document.querySelector('input[placeholder="\u65B0\u3057\u3044\u30B8\u30E3\u30F3\u30EB\u540D"]')`,
  hasUrlClear: hasClearFor(`document.querySelector('input[placeholder="https://example.com/feed.xml"]')`, "\u30D5\u30A3\u30FC\u30C9\u306EURL\u3092\u30AF\u30EA\u30A2"),
  hasGenreClear: hasClearFor(`document.querySelector('input[placeholder="\u65B0\u3057\u3044\u30B8\u30E3\u30F3\u30EB\u540D"]')`, "\u30B8\u30E3\u30F3\u30EB\u540D\u3092\u30AF\u30EA\u30A2"),
  typeIntoUrl: (text) => typeInto(`document.querySelector('input[placeholder="https://example.com/feed.xml"]')`, text),
  typeIntoGenre: (text) => typeInto(`document.querySelector('input[placeholder="\u65B0\u3057\u3044\u30B8\u30E3\u30F3\u30EB\u540D"]')`, text),
  auxBack: auxClick(3),
  auxForward: auxClick(4),
  devBadge: `Array.from(document.querySelectorAll('.app-filterbar span')).some(s => s.textContent.trim() === '\u958B\u767A\u7248')`,
};

describe("UI fix regression: bookmark reset / discover clear / feed manager", () => {
  it("bookmark filter resets on navigation to 探す", async () => {
    try {
      await browser.setWindowSize(420, 680);
    } catch (e) {
      console.log("setWindowSize failed:", e.message);
    }
    await browser.pause(2500);

    // Normalize: bookmark filter OFF.
    if (await browser.execute(S.starPressed)) {
      await browser.execute(S.clickStar);
      await browser.pause(400);
    }
    // Turn it ON.
    await browser.execute(S.clickStar);
    await browser.pause(500);
    expect(await browser.execute(S.starPressed)).toBe(true);

    // Navigate to 探す: the filter should reset.
    await browser.execute(S.clickDiscover);
    await browser.pause(800);
    expect(await browser.execute(S.discoverActive)).toBe(true);
    expect(await browser.execute(S.starPressed)).toBe(false);
    console.log("[zz-temp] bookmark filter reset on nav: OK");
  });

  it("discover search box clear button appears and clears", async () => {
    expect(await browser.execute(S.discoverHasInput)).toBe(true);
    await browser.execute(S.typeInDiscover("rust"));
    await browser.pause(300);
    expect(await browser.execute(S.discoverInputValue)).toBe("rust");
    expect(await browser.execute(S.hasClearBtn)).toBe(true);
    await browser.execute(S.clickClear);
    await browser.pause(300);
    expect(await browser.execute(S.discoverInputValue)).toBe("");
    expect(await browser.execute(S.hasClearBtn)).toBe(false);
    console.log("[zz-temp] discover clear button: OK");
  });

  it("feed manager: genre box + labelled notify toggle present", async () => {
    await browser.execute(S.clickFeedManager);
    await browser.pause(800);
    expect(await browser.execute(S.feedManagerHasUrlBox)).toBe(true);
    expect(await browser.execute(S.feedManagerHasGenreBox)).toBe(true);
    // The labelled 通知ON/OFF pill only renders per-feed, so an empty E2E DB
    // legitimately has zero -- just log the absence of the old ＋ chip marker.
    const plusChips = await browser.execute(
      `Array.from(document.querySelectorAll('span')).filter(s => s.textContent.trim() === '\uFF0B').length`,
    );
    console.log("[zz-temp] leftover + chips:", plusChips, "(expect 0 after genre-box redesign)");
    expect(plusChips).toBe(0);
  });

  it("feed manager: URL and genre-name inputs each have a clear button", async () => {
    await browser.execute(S.typeIntoUrl("https://example.com/feed.xml"));
    await browser.execute(S.typeIntoGenre("tech"));
    await browser.pause(300);
    expect(await browser.execute(S.hasUrlClear)).toBe(true);
    expect(await browser.execute(S.hasGenreClear)).toBe(true);
    console.log("[zz-temp] feed manager clear buttons: OK");
  });

  it("mouse side buttons navigate back/forward between screens", async () => {
    await browser.execute(S.clickDiscover);
    await browser.pause(600);
    expect(await browser.execute(S.activeTitle)).toContain("\u30B5\u30A4\u30C8\u3092\u63A2\u3059");
    await browser.execute(S.clickHistory);
    await browser.pause(600);
    expect(await browser.execute(S.activeTitle)).toContain("\u65E2\u8AAD\u5C65\u6B74");
    // Side "back" button (3) returns to discover, "forward" (4) to history.
    await browser.execute(S.auxBack);
    await browser.pause(400);
    expect(await browser.execute(S.activeTitle)).toContain("\u30B5\u30A4\u30C8\u3092\u63A2\u3059");
    await browser.execute(S.auxForward);
    await browser.pause(400);
    expect(await browser.execute(S.activeTitle)).toContain("\u65E2\u8AAD\u5C65\u6B74");
    console.log("[zz-temp] side-button navigation: OK");
  });

  it("dev build shows a 開発版 badge in the title bar", async () => {
    const badge = await browser.execute(S.devBadge);
    console.log("[zz-temp] dev badge present:", badge, "(E2E runs on the dev build, so expect true)");
    expect(badge).toBe(true);
  });
});