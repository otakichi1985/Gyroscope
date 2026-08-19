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

// Registered once at module load (this file is imported once, so the hook is
// global and runs for every sanitize call). Re-validates iframes after
// sanitizing: keeps only known players, and normalizes the attributes
// embedded players expect.
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName !== "IFRAME") return;
  const src = node.getAttribute("src") || "";
  if (!isVideoHost(src)) {
    node.remove();
    return;
  }
  node.setAttribute("allow", "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share");
  node.setAttribute("allowfullscreen", "");
  node.setAttribute("frameborder", "0");
});

// Shared sanitization for article bodies (reader pane, discover full text).
// `blockImages` keeps the pane consistent with EntryRow's "外部画像を読み込まない"
// setting. Video players (iframe/video/source) and their attrs are allowed on
// top of DOMPurify's defaults; the afterSanitizeAttributes hook then drops
// any iframe that isn't a known player.
export function sanitizeArticleHtml(raw: string, blockImages: boolean): string {
  return DOMPurify.sanitize(raw, {
    FORBID_TAGS: blockImages ? ["img"] : [],
    ADD_TAGS: ["iframe", "video", "source"],
    ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "controls", "playsinline", "poster", "preload"],
  });
}
