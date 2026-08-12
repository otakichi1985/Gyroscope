describe("debug probe", () => {
  it("dumps basic window/page state", async () => {
    const url = await browser.getUrl();
    const title = await browser.getTitle();
    const bodyText = await browser.execute(() => document.body ? document.body.innerText.slice(0, 2000) : "(no body)");
    const readyState = await browser.execute(() => document.readyState);
    const rootHtml = await browser.execute(() => {
      const root = document.getElementById("root");
      return root ? root.innerHTML.slice(0, 500) : "(no #root)";
    });
    console.log("[debug-probe] url:", url);
    console.log("[debug-probe] title:", title);
    console.log("[debug-probe] readyState:", readyState);
    console.log("[debug-probe] bodyText:", JSON.stringify(bodyText));
    console.log("[debug-probe] rootHtml:", JSON.stringify(rootHtml));
  });
});
