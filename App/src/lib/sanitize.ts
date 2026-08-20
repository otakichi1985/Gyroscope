import DOMPurify from "dompurify";

// Video-embed players we're willing to frame inside the reader. DOMPurify's
// default profile strips every <iframe> (a deliberate safety default), and
// the app's CSP locks frame-src to these same hosts -- so an article's
// YouTube/Vimeo/etc. embed survives only if its src matches one of these.
const VIDEO_HOSTS = [
  "youtube.com",
  "youtube-nocookie.com",
  "youtu.be",
  "player.vimeo.com",
  "vimeo.com",
  "dailymotion.com",
  "dmcdn.net",
  "player.bilibili.com",
  "bilibili.com",
  "embed.nicovideo.jp",
  "drive.google.com",
  "open.spotify.com",
  "soundcloud.com",
];

function isVideoHost(url: string): boolean {
  return VIDEO_HOSTS.some((host) => url.includes(host));
}

// Media tags whose intrinsic width/height attributes are worth keeping: they
// give the browser the aspect ratio before the image/video loads, so layout
// doesn't jump when it arrives. Every other element's width/height is a
// presentational leftover from the source page -- and on layout boxes like
// <table> it is the main cause of content overflowing the reader pane.
const MEDIA_TAGS = new Set(["IMG", "VIDEO", "SOURCE", "SVG"]);

// Registered once at module load (this file is imported once, so the hook is
// global and runs for every sanitize call). Re-validates iframes after
// sanitizing: keeps only known players, and normalizes the attributes
// embedded players expect. Also strips the article author's own visual
// styling -- inline `style` and legacy presentational attributes (align/
// bgcolor/color/face/size/clear) -- so the reader's typography and the
// light/dark theme actually win. Without this, a feed that hard-codes
// `color:#333` renders nearly invisible text in dark mode, and hard-coded
// font-size/background declarations override every reader setting (the main
// reason "記事を開くと読みにくい" happened on a per-article basis).
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "IFRAME") {
    const src = node.getAttribute("src") || "";
    if (!isVideoHost(src)) {
      node.remove();
      return;
    }
    node.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
    node.setAttribute("allowfullscreen", "");
    node.setAttribute("frameborder", "0");
  }
  node.removeAttribute("style");
  node.removeAttribute("align");
  node.removeAttribute("bgcolor");
  node.removeAttribute("color");
  node.removeAttribute("face");
  node.removeAttribute("size");
  node.removeAttribute("clear");
  if (!MEDIA_TAGS.has(node.tagName)) {
    node.removeAttribute("width");
    node.removeAttribute("height");
  }
});

// Wide tables were overflowing the reader pane horizontally and getting cut
// off at the window edge (the scroll container only scrolls vertically).
// Wrapping each table in a scrollable div keeps the table's own layout
// intact while letting the overflow scroll horizontally instead of clipping.
function wrapTables(html: string): string {
  if (!html) return html;
  const template = document.createElement("template");
  template.innerHTML = html;
  template.content.querySelectorAll("table").forEach((table) => {
    const wrap = document.createElement("div");
    wrap.className = "reader-table-wrap";
    table.parentNode?.insertBefore(wrap, table);
    wrap.appendChild(table);
  });
  return template.innerHTML;
}

// Shared sanitization for article bodies (reader pane, discover full text).
// `blockImages` keeps the pane consistent with EntryRow's "外部画像を読み込まない"
// setting. Video players (iframe/video/source) and their attrs are allowed on
// top of DOMPurify's defaults; the afterSanitizeAttributes hook then drops
// any iframe that isn't a known player.
export function sanitizeArticleHtml(raw: string, blockImages: boolean): string {
  return wrapTables(
    DOMPurify.sanitize(raw, {
      FORBID_TAGS: blockImages ? ["img"] : [],
      ADD_TAGS: ["iframe", "video", "source"],
      ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "controls", "playsinline", "poster", "preload"],
    }),
  );
}
