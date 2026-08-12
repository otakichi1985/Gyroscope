// Follow-up to search-focus.spec.js: that run showed a real WebDriver
// "element click intercepted" error when re-clicking the already-open
// search input in the cardinality (floating) skin -- the entry list behind
// it received the click instead. This spec captures the bounding rects of
// both elements at the moment of failure to tell apart two different bugs
// that would look identical in that error message:
//   (a) a real stacking/z-index bug: the two rects visually overlap, so
//       the entry list is genuinely painted on top of the search input, or
//   (b) a coordinate/layout-timing race: the rects do NOT overlap, meaning
//       the click was computed against a stale position before a reflow
//       moved things.

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

describe("検索欄と記事リストの重なりを計測する", () => {
  it("カーディナリティへ切り替え、検索を開いた状態を作る", async () => {
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

  it("検索欄の矩形と、そこに実際に重なる要素を記録する", async () => {
    const report = await browser.execute(() => {
      const input = document.querySelector('input[placeholder="記事を検索"]');
      const scroll = document.querySelector(".entry-list-scroll");
      const inputRect = input ? input.getBoundingClientRect() : null;
      const scrollRect = scroll ? scroll.getBoundingClientRect() : null;

      let topElementAtInputCenter = null;
      if (inputRect) {
        const cx = inputRect.left + inputRect.width / 2;
        const cy = inputRect.top + inputRect.height / 2;
        const el = document.elementFromPoint(cx, cy);
        topElementAtInputCenter = el
          ? {
              tag: el.tagName,
              className: typeof el.className === "string" ? el.className : String(el.className),
              isInput: el === input,
            }
          : null;
      }

      return {
        inputRect: inputRect
          ? { top: inputRect.top, left: inputRect.left, width: inputRect.width, height: inputRect.height }
          : null,
        scrollRect: scrollRect
          ? { top: scrollRect.top, left: scrollRect.left, width: scrollRect.width, height: scrollRect.height }
          : null,
        topElementAtInputCenter,
        windowInnerHeight: window.innerHeight,
        windowInnerWidth: window.innerWidth,
      };
    });
    console.log("[search-geometry]", JSON.stringify(report, null, 2));
  });
});
