// Milestone 1 of the in-app "edit mode" from UI-TOOLING.md / the plan this
// was built from: select any element, adjust a curated set of visual
// properties live, and get back a precise, exportable change record instead
// of having to describe what changed in words.
//
// Dev-only: only reachable via App.tsx's `import.meta.env.DEV`-gated lazy
// import, so none of this ships in a production build.
//
// Everything here edits the DOM directly (inline `style` overrides, plus
// CSS custom properties on the panel root for skin colors) rather than
// writing to any file. That is what makes "try without fear" (UI-TOOLING.md
// §3.3) free: turning edit mode off just restores every snapshot, no
// separate "discard" logic needed.
import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { open as openFileDialog } from "@tauri-apps/plugin-dialog";
import { convertFileSrc } from "@tauri-apps/api/core";
import { useDevEditorStore } from "./devEditorStore";
import {
  getActiveSkinColorTokens,
  PROPERTY_WARNINGS,
  STATE_PRESETS,
  type SkinColorToken,
} from "./gyroscopeManifest";
import { formatSourceLocation, resolveElementSource } from "./useElementSource";

interface ChangeRecord {
  id: string;
  targetLabel: string;
  source: string;
  property: string;
  from: string;
  to: string;
}

/** One element found by the shadow scan, plus which kind(s) of shadow it
 * turned out to have -- see scanForShadows. */
interface ShadowHit {
  el: StyleableElement;
  kinds: string[];
  value: string;
}

const PROPERTY_LABELS: Record<string, string> = {
  "padding-top": "内側の余白（上）",
  "padding-bottom": "内側の余白（下）",
  "padding-left": "内側の余白（左）",
  "padding-right": "内側の余白（右）",
  "border-radius": "角の丸み",
  "background-color": "背景色",
  color: "文字色",
  opacity: "不透明度",
  "box-shadow": "影の強さ",
  transform: "位置のずらし",
};

// Was 4 (Tailwind's spacing scale, UI-TOOLING.md's snapping requirement)
// but that made every adjustment jump in 4px increments with no way to
// land in between -- reported as too coarse in practice. 1px steps still
// let you *aim* for a multiple of 4 by eye; a real snap-to-grid (only
// pulling toward the nearest multiple, not forcing every step onto one) is
// left for a later pass rather than reintroducing this problem.
const SPACING_STEP = 1;

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/);
  if (!m) return "#000000";
  const toHex = (n: string) => Number(n).toString(16).padStart(2, "0");
  return `#${toHex(m[1])}${toHex(m[2])}${toHex(m[3])}`;
}

function shadowForStrength(n: number): string {
  if (n <= 0) return "none";
  return `0 ${n * 2}px ${n * 8}px ${n}px rgba(0, 0, 0, ${(0.08 + n * 0.05).toFixed(2)})`;
}

/** Elements never to intercept for selection -- the overlay's own chrome. */
function isInsideEditorChrome(target: EventTarget | null, panel: HTMLElement | null): boolean {
  return target instanceof Node && !!panel?.contains(target);
}

// Icons in this app are inline SVG (icons.tsx), not raster <img>s -- an
// SVGElement is not an HTMLElement, so clicking directly on an icon's <svg>
// or <path> used to fail the old `instanceof HTMLElement` check silently
// (reported: icons/glyphs couldn't be selected at all). Both interfaces
// carry `.style` (the DOM's ElementCSSInlineStyle mixin), which is all this
// file actually needs from the selected node.
type StyleableElement = HTMLElement | SVGElement;

function elementLabel(el: StyleableElement): string {
  const cls = el.getAttribute("class");
  return el.tagName.toLowerCase() + (cls ? `.${cls.split(" ")[0]}` : "");
}

/** Small "↺" next to each control -- removes *this one property's* inline
 * override only, independent of the other properties being edited and of
 * the whole-element "取り消し" list below. See resetElementProperty. */
function ResetButton({ property, onReset }: { property: string; onReset: (property: string) => void }) {
  return (
    <button
      onClick={() => onReset(property)}
      title="この項目だけ元の値に戻す"
      style={{
        background: "none",
        border: "none",
        color: "#8ab4f8",
        cursor: "pointer",
        fontSize: 11,
        marginLeft: 4,
        padding: 0,
      }}
    >
      ↺
    </button>
  );
}

export function EditorOverlay() {
  const active = useDevEditorStore((s) => s.active);
  const [selected, setSelected] = useState<StyleableElement | null>(null);
  const [hovered, setHovered] = useState<StyleableElement | null>(null);
  const [changes, setChanges] = useState<ChangeRecord[]>([]);
  const [, forceRerender] = useState(0);
  const panelRef = useRef<HTMLDivElement>(null);
  // Panel is draggable (by its header) and closable on its own -- it used
  // to dock full-height along the right edge, which on Gyroscope's narrow
  // window covered the very UI being edited, and had no way to close it
  // from inside itself (the only exit was the Settings toggle, and that
  // button lives in the app tree, so the selection-capture listener below
  // was itself swallowing clicks on it -- reported stuck-open bug).
  const [panelPos, setPanelPos] = useState(() => ({
    x: Math.max(12, window.innerWidth - 300),
    y: 12,
  }));
  // Collapse to a small pill so the whole app UI can be seen unobstructed
  // without leaving edit mode (reported: the panel itself made it hard to
  // judge the overall look). Alt+click selection keeps working while
  // collapsed -- only the panel's own body is hidden.
  const [collapsed, setCollapsed] = useState(false);
  // Nudge (transform: translate) -- reported need: small icons/glyphs
  // couldn't be repositioned with the spacing/size controls alone. Kept as
  // its own controlled state (not read from computed style like the other
  // sliders) since it's synthetic -- there's no single existing CSS value
  // to initialize a "how far has this been nudged" slider from.
  const [nudge, setNudge] = useState({ x: 0, y: 0 });
  useEffect(() => {
    setNudge({ x: 0, y: 0 });
  }, [selected]);
  // Same reasoning as nudge above -- the shadow slider used an uncontrolled
  // `defaultValue={0}` and was reported stuck at zero / not tracking
  // negative-or-off state properly. A controlled value removes the
  // ambiguity outright rather than relying on the browser's own slider
  // state staying in sync across re-renders.
  const [shadowStrength, setShadowStrength] = useState(0);
  // "Which thing is casting that shadow?" -- picking an element only tells
  // you about *that* element, so a shadow arriving from a neighbour (the
  // toolbar's downward shadow landing on the first article card, the case
  // that prompted this) is invisible to the picker no matter what you
  // click. This scans every element for any kind of shadow at once, which
  // is UI-TOOLING.md §4.5's "make visible what a screenshot cannot show".
  const [shadowHits, setShadowHits] = useState<ShadowHit[] | null>(null);
  useEffect(() => {
    setShadowStrength(0);
  }, [selected]);
  const dragRef = useRef<{ startX: number; startY: number; panelX: number; panelY: number } | null>(null);
  // Snapshots taken the first time an element is edited, so "revert" always
  // has a known-good state to go back to regardless of how many properties
  // were touched.
  const originalStyleRef = useRef(new Map<StyleableElement, string>());
  const originalImgSrcRef = useRef(new Map<HTMLImageElement, string>());
  const originalRootVarsRef = useRef(new Map<string, string>());

  function snapshotOnce(el: StyleableElement) {
    if (!originalStyleRef.current.has(el)) {
      originalStyleRef.current.set(el, el.getAttribute("style") ?? "");
    }
  }

  function panelRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>("[data-app-root]");
  }

  // Checks pseudo-elements too, not just the element itself: several skins
  // draw their decoration entirely in ::before/::after (e.g. the amber tab
  // on Ordinary's cards), and a shadow living there is completely
  // unreachable by clicking, since a pseudo-element is not a DOM node.
  function scanForShadows() {
    const root = panelRoot();
    if (!root) return;
    const hits: ShadowHit[] = [];
    for (const el of Array.from(root.querySelectorAll("*"))) {
      if (!(el instanceof HTMLElement || el instanceof SVGElement)) continue;
      if (isInsideEditorChrome(el, panelRef.current)) continue;
      const rect = el.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) continue;

      const kinds: string[] = [];
      const values: string[] = [];
      for (const pseudo of [null, "::before", "::after"] as const) {
        const cs = getComputedStyle(el, pseudo ?? undefined);
        const where = pseudo ? `${pseudo} の` : "";
        if (cs.boxShadow && cs.boxShadow !== "none") {
          kinds.push(`${where}box-shadow`);
          values.push(cs.boxShadow);
        }
        if (cs.textShadow && cs.textShadow !== "none") {
          kinds.push(`${where}text-shadow`);
          values.push(cs.textShadow);
        }
        if (cs.filter && cs.filter.includes("drop-shadow")) {
          kinds.push(`${where}drop-shadow`);
          values.push(cs.filter);
        }
      }
      if (kinds.length > 0) hits.push({ el, kinds, value: values.join(" / ") });
    }
    setShadowHits(hits);
  }

  function recordChange(targetLabel: string, source: string, property: string, from: string, to: string) {
    const id = `${targetLabel}::${property}`;
    setChanges((prev) => {
      const existing = prev.find((c) => c.id === id);
      // Keep the *original* from, not whatever the previous drag step
      // happened to be, so repeated adjustments compare against the true
      // starting point below.
      const baselineFrom = existing ? existing.from : from;
      if (to === baselineFrom) {
        // Settled back to exactly where it started -- drop the record
        // rather than keep a "changed from X to X" no-op entry (reported
        // concern: fiddling with something and undoing it by hand
        // shouldn't leave a trace in the exported change list).
        return prev.filter((c) => c.id !== id);
      }
      if (existing) {
        return prev.map((c) => (c.id === id ? { ...c, to } : c));
      }
      return [...prev, { id, targetLabel, source, property, from: baselineFrom, to }];
    });
  }

  function applyElementProperty(property: string, value: string) {
    if (!selected) return;
    const before = getComputedStyle(selected).getPropertyValue(property);
    snapshotOnce(selected);
    selected.style.setProperty(property, value);
    forceRerender((n) => n + 1);
    const loc = resolveElementSource(selected);
    recordChange(elementLabel(selected), formatSourceLocation(loc), PROPERTY_LABELS[property] ?? property, before.trim(), value);
  }

  function applyNudge(next: { x: number; y: number }) {
    if (!selected) return;
    setNudge(next);
    const value = next.x === 0 && next.y === 0 ? "" : `translate(${next.x}px, ${next.y}px)`;
    // Overwrites `transform` outright rather than composing with whatever
    // was already there -- fine for icons/glyphs (this tool's stated use
    // case), but anything with its own base transform would lose it while
    // nudged. Not attempting to parse/merge arbitrary existing transforms
    // for this pass.
    applyElementProperty("transform", value || "none");
  }

  // Reverts just this one property (removes the inline override, letting
  // whatever CSS/class already applied to the element take back over) --
  // distinct from the whole-element "取り消し" below. Added because the
  // sliders had no way to represent or return to a value *below* wherever
  // they started (reported: shadow could only be made stronger than the
  // element's real starting shadow, never weaker, and had no way to remove
  // it outright).
  function resetElementProperty(property: string) {
    if (!selected) return;
    if (property === "transform") setNudge({ x: 0, y: 0 });
    if (property === "box-shadow") setShadowStrength(0);
    selected.style.removeProperty(property);
    forceRerender((n) => n + 1);
    const id = `${elementLabel(selected)}::${property}`;
    setChanges((prev) => prev.filter((c) => c.id !== id));
  }

  function applySkinColor(token: SkinColorToken, hex: string) {
    const root = panelRoot();
    if (!root) return;
    if (!originalRootVarsRef.current.has(token.cssVar)) {
      originalRootVarsRef.current.set(token.cssVar, root.style.getPropertyValue(token.cssVar));
    }
    const r = parseInt(hex.slice(1, 3), 16);
    const g = parseInt(hex.slice(3, 5), 16);
    const b = parseInt(hex.slice(5, 7), 16);
    const rgbTriplet = `${r} ${g} ${b}`;
    root.style.setProperty(token.cssVar, rgbTriplet);
    forceRerender((n) => n + 1);
    recordChange(token.label, token.source, token.cssVar, token.value, rgbTriplet);
  }

  function applyImage(path: string) {
    if (!(selected instanceof HTMLImageElement)) return;
    if (!originalImgSrcRef.current.has(selected)) {
      originalImgSrcRef.current.set(selected, selected.src);
    }
    const before = selected.src;
    selected.src = convertFileSrc(path);
    const loc = resolveElementSource(selected);
    recordChange(selected.tagName.toLowerCase(), formatSourceLocation(loc), "画像", before, path);
  }

  function revertElement(el: StyleableElement) {
    const original = originalStyleRef.current.get(el);
    if (original !== undefined) {
      if (original) el.setAttribute("style", original);
      else el.removeAttribute("style");
      originalStyleRef.current.delete(el);
    }
    const imgOriginal = el instanceof HTMLImageElement ? originalImgSrcRef.current.get(el) : undefined;
    if (imgOriginal !== undefined && el instanceof HTMLImageElement) {
      el.src = imgOriginal;
      originalImgSrcRef.current.delete(el);
    }
  }

  function revertAll() {
    for (const el of originalStyleRef.current.keys()) revertElement(el);
    const root = panelRoot();
    if (root) {
      for (const [cssVar, value] of originalRootVarsRef.current) {
        if (value) root.style.setProperty(cssVar, value);
        else root.style.removeProperty(cssVar);
      }
    }
    originalRootVarsRef.current.clear();
    setChanges([]);
    forceRerender((n) => n + 1);
  }

  function onDragStart(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startX: e.clientX, startY: e.clientY, panelX: panelPos.x, panelY: panelPos.y };
  }
  function onDragMove(e: ReactPointerEvent<HTMLDivElement>) {
    if (!dragRef.current) return;
    const { startX, startY, panelX, panelY } = dragRef.current;
    setPanelPos({
      x: Math.min(Math.max(0, panelX + (e.clientX - startX)), window.innerWidth - 40),
      y: Math.min(Math.max(0, panelY + (e.clientY - startY)), window.innerHeight - 40),
    });
  }
  function onDragEnd(e: ReactPointerEvent<HTMLDivElement>) {
    e.currentTarget.releasePointerCapture(e.pointerId);
    dragRef.current = null;
  }

  function revertOne(record: ChangeRecord) {
    if (selected && record.id.startsWith(selected.tagName.toLowerCase())) {
      revertElement(selected);
    }
    setChanges((prev) => prev.filter((c) => c.id !== record.id));
    forceRerender((n) => n + 1);
  }

  // Auto-revert everything the instant edit mode turns off -- this is what
  // makes "try without fear" true rather than aspirational.
  useEffect(() => {
    if (active) return;
    revertAll();
    setSelected(null);
    setHovered(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  // Selecting only intercepts the click while Alt is held (reported bug:
  // intercepting *every* click made it impossible to switch screens or do
  // anything else in the app while edit mode was on). A plain click always
  // falls through untouched, so normal navigation keeps working the whole
  // time edit mode is active -- Alt+click on whatever you want to edit,
  // release Alt to use the app normally, no separate mode toggle to
  // remember to flip back.
  useEffect(() => {
    if (!active) return;
    function onClick(e: MouseEvent) {
      if (!e.altKey) return;
      if (isInsideEditorChrome(e.target, panelRef.current)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.target instanceof HTMLElement || e.target instanceof SVGElement) setSelected(e.target);
    }
    function onOver(e: MouseEvent) {
      if (isInsideEditorChrome(e.target, panelRef.current)) return;
      if (!e.altKey) {
        setHovered(null);
        return;
      }
      if (e.target instanceof HTMLElement || e.target instanceof SVGElement) setHovered(e.target);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSelected(null);
    }
    document.addEventListener("click", onClick, true);
    document.addEventListener("mouseover", onOver, true);
    document.addEventListener("keydown", onKey, true);
    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("mouseover", onOver, true);
      document.removeEventListener("keydown", onKey, true);
    };
  }, [active]);

  if (!active) return null;

  const selectedRect = selected?.getBoundingClientRect();
  const hoveredRect = hovered && hovered !== selected ? hovered.getBoundingClientRect() : null;
  const computed = selected ? getComputedStyle(selected) : null;
  const skinTokens = getActiveSkinColorTokens();

  return (
    <div style={{ position: "fixed", inset: 0, zIndex: 999999, pointerEvents: "none" }}>
      {hoveredRect && (
        <div
          style={{
            position: "fixed",
            left: hoveredRect.left,
            top: hoveredRect.top,
            width: hoveredRect.width,
            height: hoveredRect.height,
            outline: "1px dashed rgba(59,130,246,0.6)",
            pointerEvents: "none",
          }}
        />
      )}
      {selectedRect && (
        <div
          style={{
            position: "fixed",
            left: selectedRect.left,
            top: selectedRect.top,
            width: selectedRect.width,
            height: selectedRect.height,
            outline: "2px solid #f97316",
            pointerEvents: "none",
          }}
        />
      )}
      {/* Shadow-scan results: every element carrying any kind of shadow,
          outlined at once with a clickable badge, so a shadow cast *onto*
          the thing you're looking at (rather than by it) is findable. */}
      {shadowHits?.map((hit, i) => {
        const rect = hit.el.getBoundingClientRect();
        return (
          <div
            key={i}
            style={{
              position: "fixed",
              left: rect.left,
              top: rect.top,
              width: rect.width,
              height: rect.height,
              outline: "2px dashed #22d3ee",
              pointerEvents: "none",
            }}
          >
            <button
              onClick={() => {
                setSelected(hit.el);
                setShadowHits(null);
              }}
              title={`${hit.kinds.join(", ")}\n${hit.value}`}
              style={{
                position: "absolute",
                left: 0,
                top: 0,
                pointerEvents: "auto",
                background: "#22d3ee",
                color: "#00323c",
                border: "none",
                borderRadius: 3,
                fontSize: 10,
                fontWeight: 700,
                padding: "1px 4px",
                cursor: "pointer",
                fontFamily: "system-ui, sans-serif",
              }}
            >
              {i + 1}. {hit.kinds[0]}
            </button>
          </div>
        );
      })}
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          left: panelPos.x,
          top: panelPos.y,
          width: collapsed ? "auto" : 260,
          maxHeight: "70vh",
          display: "flex",
          flexDirection: "column",
          background: "#1c1c1e",
          color: "#f2f2f2",
          borderRadius: 8,
          fontSize: 12,
          fontFamily: "system-ui, sans-serif",
          pointerEvents: "auto",
          boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
        }}
      >
        {/* Drag handle doubles as the only reliable close control -- see
            the note on panelPos above. touch-action:none stops the browser
            from treating the drag as a scroll/pan gesture. */}
        <div
          onPointerDown={onDragStart}
          onPointerMove={onDragMove}
          onPointerUp={onDragEnd}
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "8px 10px",
            borderBottom: "1px solid #3a3a3c",
            cursor: "grab",
            touchAction: "none",
            userSelect: "none",
            flexShrink: 0,
          }}
        >
          <span style={{ fontWeight: 600 }}>編集モード（ドラッグで移動）</span>
          <div style={{ display: "flex", gap: 4 }}>
            <button
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => setCollapsed((c) => !c)}
              title={collapsed ? "パネルを開く" : "パネルを畳んで全体を確認"}
              style={{
                background: "none",
                border: "none",
                color: "#f2f2f2",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: "2px 4px",
              }}
            >
              {collapsed ? "▸" : "▾"}
            </button>
            <button
              // Stops the header's onPointerDown (drag start) from firing for
              // this click -- setPointerCapture() on the header was
              // re-targeting the eventual click event away from this button
              // entirely, which is why closing didn't work (reported bug).
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => useDevEditorStore.getState().toggle()}
              title="編集モードを終了"
              style={{
                background: "none",
                border: "none",
                color: "#f2f2f2",
                cursor: "pointer",
                fontSize: 14,
                lineHeight: 1,
                padding: "2px 4px",
              }}
            >
              ✕
            </button>
          </div>
        </div>

        {!collapsed && (
        <div style={{ overflowY: "auto", padding: 12 }}>
        <section style={{ marginBottom: 12 }}>
          <div style={{ opacity: 0.7, marginBottom: 4 }}>調べる</div>
          <button
            onClick={() => (shadowHits ? setShadowHits(null) : scanForShadows())}
            style={{
              fontSize: 11,
              padding: "4px 8px",
              borderRadius: 4,
              background: shadowHits ? "#22d3ee" : "#3a3a3c",
              color: shadowHits ? "#00323c" : "#f2f2f2",
              border: "none",
              cursor: "pointer",
            }}
          >
            {shadowHits ? `影のある要素 ${shadowHits.length} 件（消す）` : "影のある要素を探す"}
          </button>
          <div style={{ marginTop: 4, opacity: 0.6, fontSize: 10 }}>
            影が付いている要素を全部囲みます。番号のバッジを押すとその要素を選択できます。
          </div>
        </section>

        <section style={{ marginBottom: 12 }}>
          <div style={{ opacity: 0.7, marginBottom: 4 }}>状態を確認</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
            {STATE_PRESETS.map((preset) => (
              <button
                key={preset.id}
                onClick={preset.apply}
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: "#3a3a3c",
                  color: "#f2f2f2",
                  border: "none",
                  cursor: "pointer",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </section>

        <section style={{ marginBottom: 12 }}>
          <div style={{ opacity: 0.7, marginBottom: 4 }}>配色（現在のスキン）</div>
          {skinTokens.map((token) => (
            <label key={token.id} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }} title={token.source}>
              <input
                type="color"
                defaultValue={rgbToHex(`rgb(${token.value})`)}
                onChange={(e) => applySkinColor(token, e.target.value)}
                style={{ width: 24, height: 20, padding: 0, border: "none", background: "none" }}
              />
              <span style={{ flex: 1, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {token.label}
              </span>
            </label>
          ))}
        </section>

        {!selected && (
          <div style={{ opacity: 0.6 }}>
            Alt を押しながら要素をクリックして選んでください。押していない普通のクリックはいつも通りアプリを操作できます（画面の切り替えなど）。
          </div>
        )}

        {selected && computed && (
          <section style={{ marginBottom: 12 }}>
            <div style={{ opacity: 0.7, marginBottom: 2 }}>選択中の要素</div>
            <div style={{ marginBottom: 8, wordBreak: "break-all", opacity: 0.8 }}>
              {formatSourceLocation(resolveElementSource(selected))}
            </div>

            <div style={{ marginBottom: 6 }}>
              <div>
                位置（横にずらす）
                <ResetButton property="transform" onReset={resetElementProperty} />
              </div>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={nudge.x}
                onChange={(e) => applyNudge({ ...nudge, x: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </div>
            <div style={{ marginBottom: 6 }}>
              <div>位置（縦にずらす）</div>
              <input
                type="range"
                min={-100}
                max={100}
                step={1}
                value={nudge.y}
                onChange={(e) => applyNudge({ ...nudge, y: Number(e.target.value) })}
                style={{ width: "100%" }}
              />
            </div>

            {(["padding-top", "padding-bottom", "padding-left", "padding-right"] as const).map((prop) => (
              <div key={prop} style={{ marginBottom: 6 }}>
                <div>
                  {PROPERTY_LABELS[prop]}
                  <ResetButton property={prop} onReset={resetElementProperty} />
                </div>
                <input
                  type="range"
                  min={0}
                  max={64}
                  step={SPACING_STEP}
                  defaultValue={Math.round(parseFloat(computed.getPropertyValue(prop)) || 0)}
                  onChange={(e) => applyElementProperty(prop, `${e.target.value}px`)}
                  style={{ width: "100%" }}
                />
              </div>
            ))}

            <div style={{ marginBottom: 6 }}>
              <div>
                {PROPERTY_LABELS["border-radius"]}
                <ResetButton property="border-radius" onReset={resetElementProperty} />
              </div>
              <input
                type="range"
                min={0}
                max={48}
                step={1}
                defaultValue={Math.round(parseFloat(computed.getPropertyValue("border-radius")) || 0)}
                onChange={(e) => applyElementProperty("border-radius", `${e.target.value}px`)}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <div>
                {PROPERTY_LABELS.opacity}
                <ResetButton property="opacity" onReset={resetElementProperty} />
              </div>
              <input
                type="range"
                min={0}
                max={1}
                step={0.05}
                defaultValue={parseFloat(computed.getPropertyValue("opacity")) || 1}
                onChange={(e) => applyElementProperty("opacity", e.target.value)}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <div>
                {PROPERTY_LABELS["box-shadow"]}
                <ResetButton property="box-shadow" onReset={resetElementProperty} />
                {PROPERTY_WARNINGS["box-shadow"] && (
                  <span title={PROPERTY_WARNINGS["box-shadow"]} style={{ marginLeft: 4, color: "#f5a623" }}>
                    ⚠
                  </span>
                )}
              </div>
              {/* The slider always starts at 0 regardless of the element's
                  real shadow -- there's no way to reverse an arbitrary
                  existing box-shadow (possibly several layers, from a
                  shared class rule) into a position on a 0-3 synthetic
                  scale. Without this line, "0" reads as "no shadow is
                  applied" even when a real one is (reported: looked like
                  no shadow was set on a card that in fact has one via its
                  shared .entry-card rule -- the slider was the misleading
                  part, not the CSS). Showing the raw computed value removes
                  the ambiguity regardless of what the slider can represent. */}
              <div style={{ marginBottom: 4, opacity: 0.6, wordBreak: "break-all" }}>
                現在の値: {computed.getPropertyValue("box-shadow") || "none"}
              </div>
              {/* Sliding this only ever *adds* an invented shadow on top of
                  (or in place of) whatever real shadow the element started
                  with -- there's no way to represent "a bit less than
                  what's already there" on a 0-3 synthetic scale, so an
                  explicit "なし" (remove outright) sits next to it instead
                  of trying to make the slider itself reach zero-and-below
                  (reported: shadow couldn't be removed / only ever got
                  stronger than the starting point). ResetButton above still
                  covers "put the real original back".*/}
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="range"
                  min={0}
                  max={3}
                  step={1}
                  value={shadowStrength}
                  onChange={(e) => {
                    const n = Number(e.target.value);
                    setShadowStrength(n);
                    applyElementProperty("box-shadow", shadowForStrength(n));
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  onClick={() => {
                    setShadowStrength(0);
                    applyElementProperty("box-shadow", "none");
                  }}
                  style={{ fontSize: 11, background: "#3a3a3c", color: "#f2f2f2", border: "none", borderRadius: 4, padding: "2px 6px", cursor: "pointer" }}
                >
                  なし
                </button>
              </div>
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ flex: 1 }}>
                {PROPERTY_LABELS["background-color"]}
                <ResetButton property="background-color" onReset={resetElementProperty} />
              </span>
              <input
                type="color"
                defaultValue={rgbToHex(computed.getPropertyValue("background-color"))}
                onChange={(e) => applyElementProperty("background-color", e.target.value)}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span style={{ flex: 1 }}>
                {PROPERTY_LABELS.color}
                <ResetButton property="color" onReset={resetElementProperty} />
              </span>
              <input
                type="color"
                defaultValue={rgbToHex(computed.getPropertyValue("color"))}
                onChange={(e) => applyElementProperty("color", e.target.value)}
              />
            </label>

            {selected instanceof HTMLImageElement && (
              <button
                onClick={async () => {
                  const path = await openFileDialog({
                    filters: [{ name: "画像", extensions: ["png", "jpg", "jpeg", "gif", "webp"] }],
                    multiple: false,
                  });
                  if (typeof path === "string") applyImage(path);
                }}
                style={{
                  fontSize: 11,
                  padding: "4px 8px",
                  borderRadius: 4,
                  background: "#3a3a3c",
                  color: "#f2f2f2",
                  border: "none",
                  cursor: "pointer",
                  marginTop: 4,
                }}
              >
                画像を選ぶ
              </button>
            )}
          </section>
        )}

        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4 }}>
            <span style={{ opacity: 0.7 }}>ここまでの変更（{changes.length}）</span>
            {changes.length > 0 && (
              <div style={{ display: "flex", gap: 4 }}>
                <button
                  onClick={() => navigator.clipboard.writeText(JSON.stringify(changes, null, 2))}
                  style={{ fontSize: 11, background: "none", color: "#8ab4f8", border: "none", cursor: "pointer" }}
                >
                  コピー
                </button>
                <button
                  onClick={revertAll}
                  style={{ fontSize: 11, background: "none", color: "#f28b82", border: "none", cursor: "pointer" }}
                >
                  全て取り消し
                </button>
              </div>
            )}
          </div>
          {changes.map((c) => (
            <div key={c.id} style={{ borderTop: "1px solid #3a3a3c", padding: "4px 0" }}>
              <div style={{ fontWeight: 600 }}>{c.targetLabel}</div>
              <div style={{ opacity: 0.7, fontSize: 10 }}>{c.source}</div>
              <div>
                {c.property}: {c.from || "(既定)"} → {c.to}
              </div>
              <button
                onClick={() => revertOne(c)}
                style={{ fontSize: 10, background: "none", color: "#f28b82", border: "none", cursor: "pointer", padding: 0 }}
              >
                取り消し
              </button>
            </div>
          ))}
        </section>
        </div>
        )}
      </div>
    </div>
  );
}
