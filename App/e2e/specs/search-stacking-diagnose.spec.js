// Second-order diagnostic: search-layout-diagnose.spec.js found the exact
// mechanism (`.skin-floating .entry-list-scroll` in index.css deliberately
// sinks itself -64px/height+64px so cards can slide "under" the toolbar
// glass). By z-index reasoning, `.app-filterbar` (position:relative,
// z-index:1) should still paint above that sunk region since the search
// input is its descendant -- but the real WebDriver click-intercept test
// showed the opposite. Get the browser's own paint-order answer
// (elementsFromPoint, full stack) plus the actual computed z-index/position
// chain, instead of re-guessing.

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

describe("検索欄と記事リストの重なり: ペイント順の実測", () => {
  it("既定サイズへ合わせ、カーディナリティへ切り替えて検索を開く", async () => {
    try {
      await browser.setWindowSize(420, 680);
    } catch (e) {
      console.log("[stacking-diagnose] setWindowSize failed:", e.message);
    }
    await browser.pause(300);
    expect(await clickByAriaLabel("外観設定を開く")).toBe(true);
    await browser.pause(300);
    expect(await clickByText("カーディナリティ")).toBe(true);
    await browser.pause(300);
    expect(await clickByAriaLabel("閉じる")).toBe(true);
    await browser.pause(300);

    // `$()` + waitForClickable flaked here ("stale element reference" /
    // "Cannot read properties of null") because a React re-render can
    // replace the button's DOM node between the element handle and the
    // click. Re-query inside execute() instead, same as the other specs.
    const opened = await browser.execute(() => {
      const btn = document.querySelector('button[aria-label="記事を検索"]');
      if (!btn) return false;
      btn.click();
      return true;
    });
    expect(opened).toBe(true);
    await browser.pause(500);
  });

  it("重なり帯の中心点における実際のペイント順を記録する", async () => {
    // Ensure the search box is actually open -- the previous test's click
    // can race the skin-switch re-render that happened just before it.
    const hasInput = await browser.execute(() => !!document.querySelector('input[placeholder="記事を検索"]'));
    if (!hasInput) {
      const opened = await browser.execute(() => {
        const btn = document.querySelector('button[aria-label="記事を検索"]');
        if (!btn) return false;
        btn.click();
        return true;
      });
      await browser.pause(500);
    }
    const report = await browser.execute(() => {
      function describe(el) {
        if (!el) return null;
        const cs = getComputedStyle(el);
        const r = el.getBoundingClientRect();
        return {
          tag: el.tagName,
          className: typeof el.className === "string" ? el.className : String(el.className),
          zIndex: cs.zIndex,
          position: cs.position,
          transform: cs.transform,
          isolation: cs.isolation,
          top: r.top,
          bottom: r.bottom,
        };
      }

      const input = document.querySelector('input[placeholder="記事を検索"]');
      const scroll = document.querySelector(".entry-list-scroll");
      // `.entry-list-scroll` only exists when the timeline has entries -- on
      // an empty DB there is no scroll region to probe, so report that
      // rather than throwing (the diagnostic then degrades to a note).
      if (!input || !scroll) {
        return { emptyTimeline: !scroll, inputMissing: !input };
      }
      const filterBar = document.querySelector(".app-filterbar");
      const timelinePane = document.querySelector(".timeline-pane");
      const paneWrapper = timelinePane ? timelinePane.parentElement : null;
      const root = document.querySelector(".panel-bg");

      const inputRect = input.getBoundingClientRect();
      // Overlap band center: between scroll's sunk top and input's bottom.
      const cy = (scroll.getBoundingClientRect().top + inputRect.bottom) / 2;
      const cx = inputRect.left + inputRect.width / 2;

      const stack = document.elementsFromPoint(cx, cy).map((el) => ({
        tag: el.tagName,
        className: typeof el.className === "string" ? el.className.slice(0, 60) : String(el.className),
      }));

      return {
        probePoint: { x: cx, y: cy },
        stackTopToBottom: stack,
        root: describe(root),
        filterBar: describe(filterBar),
        input: describe(input),
        paneWrapper: describe(paneWrapper),
        timelinePane: describe(timelinePane),
        scroll: describe(scroll),
      };
    });
    console.log("[stacking-diagnose]", JSON.stringify(report, null, 2));
  });
});
