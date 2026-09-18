// Opens a snapshot of the user's development DB, never the live database.
// This is intentionally a small diagnostic: it confirms that AI-driven UI
// checks can observe the real article density/content without mutating it.
describe("実データスナップショット: ホーム", () => {
  it("記事が入った状態でタイムラインと読書画面を操作できる", async () => {
    await browser.waitUntil(
      async () => (await browser.execute(() => !!document.querySelector(".app-filterbar"))) === true,
      { timeout: 20000, interval: 500 },
    );
    await browser.waitUntil(
      async () => (await browser.execute(() => document.querySelectorAll(".app-content div[role='button']").length)) > 0,
      { timeout: 20000, interval: 500 },
    );
    const summary = await browser.execute(() => {
      const rows = [...document.querySelectorAll(".app-content div[role='button']")];
      return { count: rows.length, first: rows[0]?.textContent?.trim().slice(0, 160) ?? "" };
    });
    console.log(`[real-data] timelineRows=${summary.count} first=${summary.first}`);
    if (summary.count < 1) throw new Error("実データのタイムラインが空です");
    await browser.execute(() => document.querySelector(".app-content div[role='button']")?.click());
    await browser.waitUntil(
      async () => (await browser.execute(() => !!document.querySelector(".screen-overlay:not([inert])"))) === true,
      { timeout: 10000, interval: 500 },
    );
    const readerText = await browser.execute(() => document.querySelector(".screen-overlay:not([inert])")?.textContent?.trim() ?? "");
    if (!readerText) throw new Error("実データ記事の読書画面が空です");
    await browser.saveScreenshot("C:/Users/chika/AppData/Local/Temp/gyroscope-real-data-home.png");
  });
});
