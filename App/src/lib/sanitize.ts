import DOMPurify from "dompurify";

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

const MEDIA_TAGS = new Set(["IMG", "VIDEO", "SOURCE", "SVG"]);

DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  /* iframeはCSPと同じ許可先へ限定し、記事由来の見た目指定はReader側へ戻す。 */
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

function wrapTables(html: string): string {
  /* 表自身を崩さず、表だけ横scrollできる境界を追加する。 */
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

export function sanitizeArticleHtml(raw: string, blockImages: boolean): string {
  return wrapTables(
    DOMPurify.sanitize(raw, {
      FORBID_TAGS: blockImages ? ["img"] : [],
      ADD_TAGS: ["iframe", "video", "source"],
      ADD_ATTR: ["allow", "allowfullscreen", "frameborder", "controls", "playsinline", "poster", "preload"],
    }),
  );
}
