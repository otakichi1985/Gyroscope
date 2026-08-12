// Diagnostic follow-up: the previous geometry measurement ran at
// windowInnerHeight=1114 / width=682, far from the app's configured default
// (420x680, tauri.conf.json). Before assuming a CSS/layout bug, rule out
// that the overlap was an artifact of the WebDriver session's own window
// sizing. This spec resizes to the configured default first, then
// re-measures the same rects plus the intermediate containers so the exact
// broken link in the layout chain can be identified.

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

function rectOf(el) {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, width: r.width, height: r.height };
}

describe("検索欄/記事リスト重なりの原因切り分け", () => {
  it("ウィンドウを既定サイズ(420x680)へ合わせ、カーディナリティへ切り替えて検索を開く", async () => {
    try {
      await browser.setWindowSize(420, 680);
    } catch (e) {
      console.log("[layout-diagnose] setWindowSize failed:", e.message);
    }
    await browser.pause(300);

    expect(await clickByAriaLabel("外観設定を開く")).toBe(true);
    await browser.pause(300);
    expect(await clickByText("カーディナリティ")).toBe(true);
    await browser.pause(300);
    expect(await clickByAriaLabel("閉じる")).toBe(true);
    await browser.pause(300);

    const searchButton = await $('button[aria-label="記事を検索"]');
    await searchButton.waitForClickable({ timeout: 10000 });
    await searchButton.click();
    await browser.pause(500);
  });

  it("レイアウトの各コンテナの矩形を記録する", async () => {
    const report = await browser.execute(() => {
      function rectOf(el) {
        if (!el) return null;
        const r = el.getBoundingClientRect();
        const cs = getComputedStyle(el);
        return {
          top: r.top, bottom: r.bottom, left: r.left, right: r.right,
          width: r.width, height: r.height,
          position: cs.position, display: cs.display,
        };
      }
      const filterBar = document.querySelector(".app-filterbar");
      const searchWrapperOuter = filterBar ? filterBar.querySelector('input[placeholder="記事を検索"]')?.closest(".overflow-hidden") : null;
      const input = document.querySelector('input[placeholder="記事を検索"]');
      const paneWrapper = document.querySelector(".timeline-pane")?.parentElement; // ".relative.min-h-0.flex-1"
      const timelinePane = document.querySelector(".timeline-pane");
      const toolbar = document.querySelector(".timeline-toolbar");
      const scroll = document.querySelector(".entry-list-scroll");
      const scrollParent = scroll ? scroll.parentElement : null; // the "relative min-h-0 flex-1" div directly wrapping EntryList
      const scrollParentCs = scrollParent ? getComputedStyle(scrollParent) : null;
      const scrollCs = scroll ? getComputedStyle(scroll) : null;

      return {
        windowInnerWidth: window.innerWidth,
        windowInnerHeight: window.innerHeight,
        filterBar: rectOf(filterBar),
        searchWrapperOuter: rectOf(searchWrapperOuter),
        input: rectOf(input),
        paneWrapper: rectOf(paneWrapper),
        timelinePane: rectOf(timelinePane),
        toolbar: rectOf(toolbar),
        scrollParent: rectOf(scrollParent),
        scrollParentClass: scrollParent ? scrollParent.className : null,
        scrollParentComputed: scrollParentCs
          ? { height: scrollParentCs.height, minHeight: scrollParentCs.minHeight, flex: scrollParentCs.flex, display: scrollParentCs.display, position: scrollParentCs.position }
          : null,
        scroll: rectOf(scroll),
        scrollComputed: scrollCs
          ? { height: scrollCs.height, minHeight: scrollCs.minHeight, maxHeight: scrollCs.maxHeight }
          : null,
      };
    });
    console.log("[layout-diagnose]", JSON.stringify(report, null, 2));
  });
});
