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
};

// Tailwind's own spacing scale -- every numeric drag/slider below snaps to
// this so a value always lands on a "real" number instead of an arbitrary
// pixel (UI-TOOLING.md's snapping requirement, folded into the sliders
// themselves rather than a separate drag-handle system for this milestone).
const SPACING_STEP = 4;

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

export function EditorOverlay() {
  const active = useDevEditorStore((s) => s.active);
  const [selected, setSelected] = useState<HTMLElement | null>(null);
  const [hovered, setHovered] = useState<HTMLElement | null>(null);
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
  const dragRef = useRef<{ startX: number; startY: number; panelX: number; panelY: number } | null>(null);
  // Snapshots taken the first time an element is edited, so "revert" always
  // has a known-good state to go back to regardless of how many properties
  // were touched.
  const originalStyleRef = useRef(new Map<HTMLElement, string>());
  const originalImgSrcRef = useRef(new Map<HTMLImageElement, string>());
  const originalRootVarsRef = useRef(new Map<string, string>());

  function snapshotOnce(el: HTMLElement) {
    if (!originalStyleRef.current.has(el)) {
      originalStyleRef.current.set(el, el.getAttribute("style") ?? "");
    }
  }

  function panelRoot(): HTMLElement | null {
    return document.querySelector<HTMLElement>("[data-app-root]");
  }

  function recordChange(targetLabel: string, source: string, property: string, from: string, to: string) {
    const id = `${targetLabel}::${property}`;
    setChanges((prev) => {
      const existing = prev.find((c) => c.id === id);
      if (existing) {
        return prev.map((c) => (c.id === id ? { ...c, to } : c));
      }
      return [...prev, { id, targetLabel, source, property, from, to }];
    });
  }

  function applyElementProperty(property: string, value: string) {
    if (!selected) return;
    const before = getComputedStyle(selected).getPropertyValue(property);
    snapshotOnce(selected);
    selected.style.setProperty(property, value);
    forceRerender((n) => n + 1);
    const loc = resolveElementSource(selected);
    recordChange(
      selected.tagName.toLowerCase() + (selected.className ? `.${String(selected.className).split(" ")[0]}` : ""),
      formatSourceLocation(loc),
      PROPERTY_LABELS[property] ?? property,
      before.trim(),
      value,
    );
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

  function revertElement(el: HTMLElement) {
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

  useEffect(() => {
    if (!active) return;
    function onClick(e: MouseEvent) {
      if (isInsideEditorChrome(e.target, panelRef.current)) return;
      e.preventDefault();
      e.stopPropagation();
      if (e.target instanceof HTMLElement) setSelected(e.target);
    }
    function onOver(e: MouseEvent) {
      if (isInsideEditorChrome(e.target, panelRef.current)) return;
      if (e.target instanceof HTMLElement) setHovered(e.target);
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
      <div
        ref={panelRef}
        style={{
          position: "fixed",
          left: panelPos.x,
          top: panelPos.y,
          width: 260,
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

        <div style={{ overflowY: "auto", padding: 12 }}>
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

        {!selected && <div style={{ opacity: 0.6 }}>画面上の要素をクリックして選んでください</div>}

        {selected && computed && (
          <section style={{ marginBottom: 12 }}>
            <div style={{ opacity: 0.7, marginBottom: 2 }}>選択中の要素</div>
            <div style={{ marginBottom: 8, wordBreak: "break-all", opacity: 0.8 }}>
              {formatSourceLocation(resolveElementSource(selected))}
            </div>

            {(["padding-top", "padding-bottom", "padding-left", "padding-right"] as const).map((prop) => (
              <div key={prop} style={{ marginBottom: 6 }}>
                <div>{PROPERTY_LABELS[prop]}</div>
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
              <div>{PROPERTY_LABELS["border-radius"]}</div>
              <input
                type="range"
                min={0}
                max={48}
                step={2}
                defaultValue={Math.round(parseFloat(computed.getPropertyValue("border-radius")) || 0)}
                onChange={(e) => applyElementProperty("border-radius", `${e.target.value}px`)}
                style={{ width: "100%" }}
              />
            </div>

            <div style={{ marginBottom: 6 }}>
              <div>{PROPERTY_LABELS.opacity}</div>
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
                {PROPERTY_WARNINGS["box-shadow"] && (
                  <span title={PROPERTY_WARNINGS["box-shadow"]} style={{ marginLeft: 4, color: "#f5a623" }}>
                    ⚠
                  </span>
                )}
              </div>
              <input
                type="range"
                min={0}
                max={3}
                step={1}
                defaultValue={0}
                onChange={(e) => applyElementProperty("box-shadow", shadowForStrength(Number(e.target.value)))}
                style={{ width: "100%" }}
              />
            </div>

            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span>{PROPERTY_LABELS["background-color"]}</span>
              <input
                type="color"
                defaultValue={rgbToHex(computed.getPropertyValue("background-color"))}
                onChange={(e) => applyElementProperty("background-color", e.target.value)}
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 6 }}>
              <span>{PROPERTY_LABELS.color}</span>
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
      </div>
    </div>
  );
}
