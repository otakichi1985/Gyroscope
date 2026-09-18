// Timeline multi-pane: the PaneBar can open a second timeline, switch the
// split direction (左右/上下), and close back to a single pane. Each pane
// carries its own toolbar, so assert on toolbar count rather than article
// rows -- the E2E database may be empty.
//
// All clicks go through browser.execute + DOM (el.click()), the standard
// workaround for this harness's slow WebDriver element operations
// (see VERIFY.md: Tauriウィンドウ実機E2E).

const paneBarBtnExpr = `(() => {
  const btns = [...document.querySelectorAll(".pane-bar button")];
  const main = btns.find((b) => b.textContent === "並べて表示" || b.textContent === "1つに戻す");
  return main ? main.textContent : null;
})()`;

const clickPaneBarMainExpr = `(() => {
  const btns = [...document.querySelectorAll(".pane-bar button")];
  const main = btns.find((b) => b.textContent === "並べて表示" || b.textContent === "1つに戻す");
  if (!main) return null;
  main.click();
  return main.textContent;
})()`;

const probeExpr = `(() => ({
  toolbars: document.querySelectorAll(".timeline-toolbar").length,
  dirButtons: [...document.querySelectorAll(".pane-bar button")].filter((b) => b.textContent === "左右" || b.textContent === "上下").length,
  local: localStorage.getItem("gyroscope:timeline-panes"),
}))()`;

const clickDirectionExpr = (label) => `(() => {
  const btn = [...document.querySelectorAll(".pane-bar button")].find((b) => b.textContent === ${JSON.stringify(label)});
  if (!btn) return false;
  btn.click();
  return true;
})()`;

const splitAxisExpr = `(() => {
  const pane = document.querySelector(".timeline-pane > div:last-child");
  if (!pane) return null;
  const cs = getComputedStyle(pane);
  return cs.flexDirection;
})()`;

describe("timeline multi-pane open / direction / close", () => {
  it("shows the pane bar on the timeline", async () => {
    await browser.waitUntil(
      async () => (await browser.execute(paneBarBtnExpr)) === "並べて表示",
      { timeout: 20000, interval: 500 },
    );
  });

  it("opens a second pane with its own toolbar", async () => {
    await browser.execute(clickPaneBarMainExpr);
    await browser.waitUntil(async () => (await browser.execute(probeExpr)).toolbars === 2, {
      timeout: 10000,
      interval: 300,
    });
    const probe = await browser.execute(probeExpr);
    if (probe.dirButtons !== 2) throw new Error(`direction toggle should appear, got ${probe.dirButtons}`);
    const stored = JSON.parse(probe.local || "{}");
    if (stored.dual !== true) throw new Error(`dual=true should persist, got ${probe.local}`);
  });

  it("switches split direction to 上下 and persists it", async () => {
    const clicked = await browser.execute(clickDirectionExpr("上下"));
    if (!clicked) throw new Error("上下 button not found");
    await browser.pause(400);
    const axis = await browser.execute(splitAxisExpr);
    if (axis !== "column") throw new Error(`expected flex-direction column, got ${axis}`);
    const probe = await browser.execute(probeExpr);
    const stored = JSON.parse(probe.local || "{}");
    if (stored.direction !== "column") throw new Error(`direction should persist, got ${probe.local}`);
    // Back to 左右 for a clean persisted state.
    await browser.execute(clickDirectionExpr("左右"));
    await browser.pause(400);
  });

  it("closes back to a single pane", async () => {
    await browser.execute(clickPaneBarMainExpr);
    await browser.waitUntil(async () => (await browser.execute(probeExpr)).toolbars === 1, {
      timeout: 10000,
      interval: 300,
    });
  });
});
