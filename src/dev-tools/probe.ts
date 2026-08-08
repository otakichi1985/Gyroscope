// Turns a point (or a dragged rectangle) on the running app into the short
// list of things that are actually there.
//
// Two rules shape everything here:
//
// 1. Only what is really painted gets listed. Layout-only wrappers produce no
//    features and so never appear -- that is what keeps the list at a handful
//    of rows instead of the whole ancestor chain. The previous two attempts at
//    this tool drowned in exactly that.
// 2. Things you cannot click are still things. Shadows, ::before/::after
//    decoration and the pointer-events:none ambience (.idle-bg,
//    .mouse-spotlight, .ordinary-hud, .terminal-data-stream) are unreachable
//    by a plain hit test, and they are precisely what has been hard to reach
//    by hand. They are collected separately and folded into the same list.
//
// Dev-only; see names.ts.

import { describeElement } from "./names";

export type Thing = {
  id: string;
  label: string;
  detail: string;
  swatch: string | null;
  tags: string[];
  element: Element;
  pseudo: string;
  rect: { left: number; top: number; width: number; height: number };
};

const MAX_PER_ELEMENT = 5;
const MAX_TOTAL = 14;

function boxOf(el: Element) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

function isVisible(el: Element, cs: CSSStyleDeclaration) {
  if (cs.display === "none" || cs.visibility === "hidden") return false;
  if (Number(cs.opacity) === 0) return false;
  const r = el.getBoundingClientRect();
  return r.width > 0 && r.height > 0;
}

/** Split a comma-separated CSS value without breaking inside rgb(...)/oklch(...). */
function splitTopLevel(value: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < value.length; i += 1) {
    const c = value[i];
    if (c === "(") depth += 1;
    else if (c === ")") depth -= 1;
    else if (c === "," && depth === 0) {
      out.push(value.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(value.slice(start).trim());
  return out.filter(Boolean);
}

/**
 * Alpha of a computed color. Tailwind v4 authors in oklch and Chromium can
 * hand it back unresolved, so the `/ a` form is handled alongside rgba().
 */
function alphaOf(color: string): number {
  if (!color || color === "transparent") return 0;
  const rgb = /^rgba?\(([^)]+)\)$/.exec(color);
  if (rgb) {
    const parts = rgb[1].split(/[,/]/).map((s) => s.trim());
    return parts.length >= 4 ? Number.parseFloat(parts[3]) : 1;
  }
  const slash = /\/\s*([\d.]+%?)\s*\)\s*$/.exec(color);
  if (slash) {
    const v = slash[1];
    return v.endsWith("%") ? Number.parseFloat(v) / 100 : Number.parseFloat(v);
  }
  return 1;
}

function px(n: number) {
  return `${Math.round(n)}px`;
}

function percentIfFaded(color: string) {
  const a = alphaOf(color);
  return a < 0.995 ? `・${Math.round(a * 100)}%` : "";
}

function describeShadow(value: string) {
  const layers = splitTopLevel(value);
  const first = layers[0].replace(/[a-z-]+\([^)]*\)/gi, " ");
  const lengths = first.match(/-?[\d.]+px/g) ?? [];
  const stack = layers.length > 1 ? `・${layers.length}重` : "";
  const [x = "0px", y = "0px", blur = "0px"] = lengths;
  if (lengths.length < 3) return `${layers.length}件${stack}`;
  const dir = Number.parseFloat(y) >= 0 ? "下" : "上";
  const side = Math.abs(Number.parseFloat(x)) >= 0.5 ? `・横${x}` : "";
  return `${dir}へ${y.replace("-", "")}・ぼかし${blur}${side}${stack}`;
}

function describeBlur(value: string) {
  const m = /blur\(([^)]+)\)/.exec(value);
  return m ? `ぼかし ${m[1]}` : value.slice(0, 24);
}

function borderSummary(cs: CSSStyleDeclaration) {
  const sides = [
    ["上", cs.borderTopWidth, cs.borderTopStyle, cs.borderTopColor],
    ["右", cs.borderRightWidth, cs.borderRightStyle, cs.borderRightColor],
    ["下", cs.borderBottomWidth, cs.borderBottomStyle, cs.borderBottomColor],
    ["左", cs.borderLeftWidth, cs.borderLeftStyle, cs.borderLeftColor],
  ] as const;
  const live = sides.filter(
    ([, w, style, color]) =>
      Number.parseFloat(w) > 0 && style !== "none" && alphaOf(color) > 0.01,
  );
  if (live.length === 0) return null;
  const where = live.length === 4 ? "四辺" : live.map(([name]) => name).join("");
  return { where, width: live[0][1], color: live[0][3] };
}

function directText(el: Element) {
  let text = "";
  el.childNodes.forEach((node) => {
    if (node.nodeType === Node.TEXT_NODE) text += node.nodeValue ?? "";
  });
  return text.replace(/\s+/g, " ").trim();
}

function clip(text: string, max = 14) {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}

function thingsForLayer(el: Element, pseudo: string, tags: string[]): Thing[] {
  const cs = getComputedStyle(el, pseudo || undefined);
  if (pseudo && (cs.content === "none" || cs.content === "normal")) return [];

  const name = describeElement(el);
  const rect = boxOf(el);
  const key = `${pseudo}${name}`;
  const out: Thing[] = [];
  const add = (part: string, detail: string, swatch: string | null = null) =>
    out.push({
      id: `${key}|${part}|${rect.left},${rect.top}`,
      label: part ? `${name}の${part}` : name,
      detail,
      swatch,
      tags,
      element: el,
      pseudo,
      rect,
    });

  if (!pseudo) {
    const text = directText(el);
    if (text) add("文字", `${cs.fontSize}・「${clip(text)}」`, cs.color);
    if (el instanceof HTMLImageElement) {
      add(
        "画像",
        el.naturalWidth === 0
          ? "読み込めていない"
          : `${el.naturalWidth} × ${el.naturalHeight}`,
      );
    }
  } else {
    const literal = /^"(.*)"$/s.exec(cs.content);
    if (literal && literal[1].trim()) {
      add("文字", `${cs.fontSize}・「${clip(literal[1].trim())}」`, cs.color);
    }
  }

  if (cs.backgroundImage !== "none") add("背景", "画像・グラデーション", null);
  else if (alphaOf(cs.backgroundColor) > 0.01) {
    add("背景", `${cs.backgroundColor}${percentIfFaded(cs.backgroundColor)}`, cs.backgroundColor);
  }

  const border = borderSummary(cs);
  if (border) add("枠", `${border.where}・${border.width}`, border.color);

  if (cs.boxShadow && cs.boxShadow !== "none") add("影", describeShadow(cs.boxShadow), null);
  if (cs.filter && cs.filter.includes("drop-shadow")) add("影", "文字・図形の影", null);

  const blur = [cs.backdropFilter, cs.filter].find((v) => v && v.includes("blur("));
  if (blur) add("ぼかし", describeBlur(blur), null);

  if (out.length === 0) return [];

  // The element itself goes first, and only when something above proved it is
  // actually painted -- that check is what keeps invisible layout wrappers off
  // the list. Its detail is the size, because "grab the edge and stretch" is
  // one of the operations this is for.
  if (!pseudo) {
    out.unshift({
      id: `${key}|本体|${rect.left},${rect.top}`,
      label: name,
      detail: `${px(rect.width)} × ${px(rect.height)}`,
      swatch: null,
      tags,
      element: el,
      pseudo,
      rect,
    });
  }
  return out.slice(0, MAX_PER_ELEMENT);
}

function thingsForElement(el: Element, passthrough: boolean): Thing[] {
  const tags = passthrough ? ["すり抜け"] : [];
  return [
    ...thingsForLayer(el, "", tags),
    ...thingsForLayer(el, "::before", [...tags, "飾り"]),
    ...thingsForLayer(el, "::after", [...tags, "飾り"]),
  ];
}

/** Visible pointer-events:none elements a hit test can never return. */
function passthroughElementsIn(
  root: Element,
  hit: (el: Element) => boolean,
  seen: Set<Element>,
) {
  const found: Element[] = [];
  root.querySelectorAll("*").forEach((el) => {
    if (seen.has(el)) return;
    const cs = getComputedStyle(el);
    if (cs.pointerEvents !== "none") return;
    if (!isVisible(el, cs)) return;
    if (!hit(el)) return;
    found.push(el);
  });
  return found.reverse();
}

function build(elements: Element[], passthrough: Set<Element>) {
  const out: Thing[] = [];
  for (const el of elements) {
    out.push(...thingsForElement(el, passthrough.has(el)));
    if (out.length >= MAX_TOTAL) break;
  }
  return out.slice(0, MAX_TOTAL);
}

export function probePoint(root: Element, x: number, y: number): Thing[] {
  const hit = document
    .elementsFromPoint(x, y)
    .filter((el) => el === root || root.contains(el));
  const seen = new Set<Element>(hit);
  const extras = passthroughElementsIn(
    root,
    (el) => {
      const r = el.getBoundingClientRect();
      return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
    },
    seen,
  );
  // Pass-through decoration is drawn over the app, so it is listed first.
  return build([...extras, ...hit], new Set(extras));
}

export function probeRect(
  root: Element,
  box: { left: number; top: number; width: number; height: number },
): Thing[] {
  const right = box.left + box.width;
  const bottom = box.top + box.height;
  const overlaps = (el: Element) => {
    const r = el.getBoundingClientRect();
    return r.right >= box.left && r.left <= right && r.bottom >= box.top && r.top <= bottom;
  };

  const inside: Element[] = [];
  const passthrough = new Set<Element>();
  root.querySelectorAll("*").forEach((el) => {
    const cs = getComputedStyle(el);
    if (!isVisible(el, cs) || !overlaps(el)) return;
    if (cs.pointerEvents === "none") passthrough.add(el);
    inside.push(el);
  });
  // Deepest first, matching how the point probe reads top-down.
  return build(inside.reverse(), passthrough);
}
