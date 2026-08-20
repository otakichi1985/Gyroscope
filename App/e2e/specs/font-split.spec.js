// Global font split regression spec. The app splits the UI's Latin and
// Japanese glyphs between two @font-face aliases (RssWidgetLatin /
// RssWidgetJapanese, built in App.tsx) whose `src:` only lists `local(...)`
// names. Chromium matches local() against a *face* (full/PostScript) name,
// not reliably against the family name, and the Yu family is a known
// casualty -- local("Yu Gothic UI") / local("Yu Mincho") fail while the
// weight-qualified full names resolve. App.tsx now expands each family's src
// with the real face names it fetches from Rust (list_font_face_names), so
// picking a Yu font no longer silently drops it (face status "error", which
// read to the user as "changed the font but nothing happens"). Yu Gothic UI
// and Yu Mincho ship with every Windows 10/11, so this can assert on them
// unconditionally in the WebView2 environment. The same face-name trap also
// hits the per-user "SAO UI" family (verified: local("SAO UI") fails while
// local("SAO UI Regular") resolves), covered here as a conditional test.

function appearance(latin, japanese) {
  return {
    opacity: 0.85,
    skinId: "mono",
    cardSize: "medium",
    cardGap: "normal",
    latinFontId: latin,
    japaneseFontId: japanese,
    alwaysOnTop: false,
    positionLocked: false,
    titleBarVisible: false,
    minimizeToTray: true,
    blockImages: false,
    clickBehavior: "reader",
    showIconLabels: true,
    titleMarquee: true,
    themeMode: "light",
    readerFontSize: "medium",
    readerLineHeight: "normal",
    readerColumnWidth: "normal",
    readerKeepOpacity: false,
    readerFontFamily: "app",
    readerCodeFont: "mono",
    readerColors: { body: null, heading: null, quote: null, code: null, link: null },
  };
}

const faceStatus = (family) =>
  `(() => { const f = Array.from(document.fonts).find((x) => x.family === "${family}"); return f ? f.status : null; })()`;

async function setAppearance(store) {
  await browser.execute((s) => {
    localStorage.setItem("gyroscope:appearance", JSON.stringify(s));
    location.reload();
  }, store);
  await browser.pause(3000);
}

// The face-name map is fetched over a Tauri invoke after the page reload, so
// the face may take a moment to (re)load -- poll instead of asserting once.
async function expectFaceLoaded(label, family) {
  await browser.waitUntil(
    async () => (await browser.execute(faceStatus(family))) === "loaded",
    {
      timeout: 10000,
      timeoutMsg: `${label}: ${family} face should be loaded`,
    },
  );
}

// SAO UI is a per-user font (not a Windows standard one), so it may be absent
// on other machines. The full name "SAO UI Regular" is the name Chromium's
// local() reliably matches for the family; if it doesn't resolve the font
// simply isn't installed here, and the regression test below skips.
async function saoUiInstalled() {
  return browser.executeAsync((done) => {
    const style = document.createElement("style");
    style.textContent = '@font-face{font-family:"SAOProbe";src:local("SAO UI Regular");}';
    document.head.appendChild(style);
    document.fonts
      .load('20px "SAOProbe"', "AAAAA")
      .then((faces) => done(faces.length > 0))
      .catch(() => done(false));
  });
}

describe("global font split resolves local() for the Yu family", () => {
  it("Yu Gothic UI as Latin font loads RssWidgetLatin", async () => {
    try {
      await browser.setWindowSize(420, 680);
    } catch (e) {
      console.log("setWindowSize failed:", e.message);
    }
    await browser.pause(2000);

    await setAppearance(appearance("Yu Gothic UI", ""));
    await expectFaceLoaded("latin=Yu Gothic UI", "RssWidgetLatin");
    const latinCheck = await browser.execute(
      () => document.fonts.check("20px RssWidgetLatin", "AAAAA"),
    );
    if (!latinCheck) throw new Error("RssWidgetLatin should cover Latin text");

    // The Japanese face must not be affected by the Latin-only change: on the
    // default (non-terminal) skin there is no Japanese alias at all.
    const jpFace = await browser.execute(faceStatus("RssWidgetJapanese"));
    if (jpFace !== null) throw new Error(`unexpected Japanese face status: ${jpFace}`);
  });

  it("Yu Mincho as Japanese font loads RssWidgetJapanese", async () => {
    await setAppearance(appearance("", "Yu Mincho"));
    await expectFaceLoaded("japanese=Yu Mincho", "RssWidgetJapanese");
    const jpCheck = await browser.execute(
      () => document.fonts.check("20px RssWidgetJapanese", "あ"),
    );
    if (!jpCheck) throw new Error("RssWidgetJapanese should cover Japanese text");

    const latFace = await browser.execute(faceStatus("RssWidgetLatin"));
    if (latFace !== null) throw new Error(`unexpected Latin face status: ${latFace}`);
  });

  it("both Yu fonts set load both aliases", async () => {
    await setAppearance(appearance("Yu Gothic UI", "Yu Mincho"));
    await expectFaceLoaded("latin=Yu Gothic UI", "RssWidgetLatin");
    await expectFaceLoaded("japanese=Yu Mincho", "RssWidgetJapanese");
  });

  it("SAO UI as Latin font loads RssWidgetLatin (skips if not installed)", async function () {
    if (!(await saoUiInstalled())) {
      this.skip();
      return;
    }
    await setAppearance(appearance("SAO UI", ""));
    await expectFaceLoaded("latin=SAO UI", "RssWidgetLatin");
    const latinCheck = await browser.execute(
      () => document.fonts.check("20px RssWidgetLatin", "AAAAA"),
    );
    if (!latinCheck) throw new Error("RssWidgetLatin should cover Latin text with SAO UI");
  });

  after(() => {
    browser.execute(() => localStorage.removeItem("gyroscope:appearance"));
  });
});