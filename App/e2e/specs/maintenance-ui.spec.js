import { seedReaderData, unseedReaderData } from "../seed-reader-data.mjs";
import path from "node:path";

const skinIds = ["mono", "link-amber", "ordinary"];

describe("timeline maintenance surfaces", () => {
  before(async () => { await seedReaderData(); });
  after(() => { unseedReaderData(); });

  for (const skinId of skinIds) {
    it(`${skinId}: card fills pane and star remains usable`, async () => {
      await browser.setWindowSize(760, 700);
      await browser.execute((id) => {
        localStorage.setItem("gyroscope:appearance", JSON.stringify({ skinId: id, blockImages: true }));
        location.reload();
      }, skinId);
      await browser.waitUntil(async () => (await browser.execute(() => !!document.querySelector(".entry-card"))), { timeout: 20000 });
      await browser.pause(850);
      const result = await browser.execute(() => {
        const card = document.querySelector(".entry-card");
        const scroll = document.querySelector(".entry-list-scroll");
        const star = card?.querySelector('button[aria-label="スターを付ける"]');
        const c = card.getBoundingClientRect();
        const s = scroll.getBoundingClientRect();
        const b = star?.getBoundingClientRect();
        return {
          left: c.left - s.left,
          right: s.right - c.right,
          starW: b?.width ?? 0,
          starH: b?.height ?? 0,
          readCheckCount: card.querySelectorAll('button[aria-label="既読にする"], button[aria-label="未読にする"]').length,
          background: getComputedStyle(card).backgroundColor,
        };
      });
      if (result.left > 8 || result.right > 8) throw new Error(`${skinId}: card margins ${JSON.stringify(result)}`);
      if (result.starW < 28 || result.starH < 28) throw new Error(`${skinId}: small star ${JSON.stringify(result)}`);
      if (result.readCheckCount !== 0) throw new Error(`${skinId}: old read check remains`);
      if (result.background === "rgba(0, 0, 0, 0)") throw new Error(`${skinId}: card is transparent`);
      await browser.execute(() => document.querySelector('.entry-card button[aria-label="スターを付ける"]')?.click());
      await browser.waitUntil(async () => (await browser.execute(() => !!document.querySelector('.entry-card button[aria-label="スターを外す"]'))));
      await browser.execute(() => document.querySelector('.entry-card button[aria-label="スターを外す"]')?.click());
      await browser.saveScreenshot(path.join(process.env.TEMP, `gyroscope-maintenance-${skinId}.png`));
    });
  }

  it("split and close keep the first pane visible", async () => {
    await browser.execute(() => [...document.querySelectorAll(".pane-bar button")].find((b) => b.textContent === "並べて表示")?.click());
    await browser.waitUntil(async () => (await browser.execute(() => document.querySelectorAll(".timeline-toolbar").length)) === 2);
    const opacity = await browser.execute(() => getComputedStyle(document.querySelector(".timeline-pane")).opacity);
    if (opacity !== "1") throw new Error(`split timeline opacity=${opacity}`);
    await browser.execute(() => [...document.querySelectorAll(".pane-bar button")].find((b) => b.textContent === "1つに戻す")?.click());
    await browser.waitUntil(async () => (await browser.execute(() => document.querySelectorAll(".timeline-toolbar").length)) === 1);
    if (!(await browser.execute(() => !!document.querySelector(".entry-card")))) throw new Error("first pane lost its card");
  });

  it("narrow view switches show distinct icons and accessible names", async () => {
    await browser.setWindowSize(480, 700);
    const modes = await browser.execute(() => [...document.querySelectorAll(".timeline-toolbar .segmented button")].map((button) => ({
      label: button.getAttribute("aria-label"),
      icon: getComputedStyle(button.querySelector(".view-mode-icon")).display,
      text: getComputedStyle(button.querySelector(".view-mode-label")).display,
      svg: button.querySelector("svg")?.innerHTML,
    })));
    if (modes.length !== 3 || modes.some((mode) => !mode.label || mode.icon === "none" || mode.text !== "none")) {
      throw new Error(`narrow modes ${JSON.stringify(modes)}`);
    }
    if (new Set(modes.map((mode) => mode.svg)).size !== 3) throw new Error("view icons are not distinct");
    await browser.saveScreenshot(path.join(process.env.TEMP, "gyroscope-maintenance-narrow.png"));
    await browser.execute(() => document.querySelector('.timeline-toolbar button[aria-label="コンパクト表示"]')?.click());
    if (!(await browser.execute(() => document.querySelector('.timeline-toolbar button[aria-label="コンパクト表示"]')?.getAttribute("aria-pressed") === "true"))) {
      throw new Error("compact icon did not switch the view");
    }
    await browser.execute(() => document.querySelector('.timeline-toolbar button[aria-label="カード表示"]')?.click());
    await browser.setWindowSize(760, 700);
    await browser.execute(() => localStorage.removeItem("gyroscope:appearance"));
  });
});
