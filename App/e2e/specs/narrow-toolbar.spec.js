// Regression: timeline chrome must stay reachable when the window is shrunk
// sideways (user report: controls clipped or squeezed unusable). Two layers:
// flex-wrap lets controls flow onto a second line, and under ~560px the long
// text labels collapse to icons via `.toolbar-label` (index.css).
//
// The window is resized and then restored to its exact prior size (captured
// up front), so later specs and DPI-dependent baselines are unaffected.

const toolbarHasOverflowExpr = `(() => {
  const bar = document.querySelector(".timeline-toolbar");
  if (!bar) return { missing: true };
  const picker = document.querySelector(".timeline-toolbar .picker-trigger");
  const pickerRect = picker ? picker.getBoundingClientRect() : null;
  const pickerLabel = picker ? picker.querySelector("span") : null;
  const pickerLabelRect = pickerLabel ? pickerLabel.getBoundingClientRect() : null;
  return {
    scrollW: bar.scrollWidth,
    clientW: bar.clientWidth,
    labelDisplay: [...document.querySelectorAll(".timeline-toolbar .toolbar-label")].map((el) => getComputedStyle(el).display),
    pickerW: pickerRect ? Math.round(pickerRect.width) : 0,
    pickerLabelW: pickerLabelRect ? Math.round(pickerLabelRect.width) : 0,
  };
})()`;

describe("narrow window: toolbar collapses instead of clipping", () => {
  let origW = 0;
  let origH = 0;

  it("captures the current window size", async () => {
    const size = await browser.getWindowSize();
    origW = size.width;
    origH = size.height;
  });

  it("collapses labels and avoids overflow at 480px", async () => {
    await browser.setWindowSize(480, origH);
    await browser.pause(600);
    const probe = await browser.execute(toolbarHasOverflowExpr);
    if (probe.missing) throw new Error("timeline toolbar not found");
    if (!probe.labelDisplay.length) throw new Error("no toolbar labels found");
    if (!probe.labelDisplay.every((d) => d === "none")) {
      throw new Error(`labels should hide at 480px, got ${JSON.stringify(probe.labelDisplay)}`);
    }
    if (probe.scrollW > probe.clientW + 1) {
      throw new Error(`toolbar overflows: scrollW=${probe.scrollW} clientW=${probe.clientW}`);
    }
    // The feed/genre picker must keep a readable width instead of being
    // squeezed to nothing by its shrink-0 siblings (user report).
    if (probe.pickerW < 100) {
      throw new Error(`picker trigger squeezed too narrow: ${probe.pickerW}px`);
    }
    if (probe.pickerLabelW <= 0) {
      throw new Error("picker selected label is not visible");
    }
  });

  it("restores labels at the original size", async () => {
    await browser.setWindowSize(origW, origH);
    await browser.pause(600);
    const probe = await browser.execute(toolbarHasOverflowExpr);
    if (!probe.labelDisplay.some((d) => d !== "none")) {
      throw new Error("labels should reappear at the original size");
    }
  });
});
