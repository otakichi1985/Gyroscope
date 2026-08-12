// Step one of the editing tool: point at the app, get back the few things
// that are actually there. No editing yet -- if the list does not show what
// you meant, nothing built on top of it would be worth having.
//
// Shape agreed with the user:
// - the app stays live; holding Ctrl is what turns pointing on (same feel as
//   holding space for the hand tool in CLIP STUDIO PAINT)
// - click picks a spot, drag picks an area
// - what comes back is a handful of rows in the app's own words
//
// Styled with inline styles on purpose. Tailwind scans source text, and a
// file about styles is full of bare property names it would mistake for class
// names -- index.css excludes this directory from that scan for the same
// reason. Fixed colors, not skin colors, so the tool stays readable whichever
// skin is being worked on.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { probePoint, probeRect, type Thing } from "./probe";

const Z = 2147483000;
const DRAG_THRESHOLD = 5;
const PANEL_WIDTH = 300;

type Box = { left: number; top: number; width: number; height: number };

function boxBetween(a: { x: number; y: number }, b: { x: number; y: number }): Box {
  return {
    left: Math.min(a.x, b.x),
    top: Math.min(a.y, b.y),
    width: Math.abs(a.x - b.x),
    height: Math.abs(a.y - b.y),
  };
}

function Outline({ box, color }: { box: Box; color: string }) {
  return (
    <div
      style={{
        position: "fixed",
        left: box.left,
        top: box.top,
        width: box.width,
        height: box.height,
        outline: `1px solid ${color}`,
        outlineOffset: 1,
        background: `${color}1f`,
        pointerEvents: "none",
        zIndex: Z,
      }}
    />
  );
}

export function DevPointer() {
  const [armed, setArmed] = useState(false);
  const [drag, setDrag] = useState<{ from: { x: number; y: number }; to: { x: number; y: number } } | null>(null);
  const [preview, setPreview] = useState<Box | null>(null);
  const [things, setThings] = useState<Thing[] | null>(null);
  const [anchor, setAnchor] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [active, setActive] = useState<string | null>(null);
  const [pinned, setPinned] = useState<string | null>(null);
  const layerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function down(e: KeyboardEvent) {
      if (e.key === "Control") setArmed(true);
      if (e.key === "Escape") {
        setThings(null);
        setPinned(null);
      }
    }
    function up(e: KeyboardEvent) {
      if (e.key === "Control") {
        setArmed(false);
        setDrag(null);
        setPreview(null);
      }
    }
    function blur() {
      setArmed(false);
      setDrag(null);
      setPreview(null);
    }
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    window.addEventListener("blur", blur);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
      window.removeEventListener("blur", blur);
    };
  }, []);

  // The capture layer sits over everything, so it has to step out of the way
  // for the duration of the hit test or it would be the only thing found.
  const withoutLayer = useCallback(<T,>(run: () => T): T => {
    const layer = layerRef.current;
    const previous = layer?.style.pointerEvents ?? "";
    if (layer) layer.style.pointerEvents = "none";
    try {
      return run();
    } finally {
      if (layer) layer.style.pointerEvents = previous;
    }
  }, []);

  const appRoot = () => document.getElementById("root");

  function handleMove(e: React.PointerEvent) {
    if (drag) {
      setDrag({ ...drag, to: { x: e.clientX, y: e.clientY } });
      return;
    }
    const hit = withoutLayer(() => document.elementFromPoint(e.clientX, e.clientY));
    if (!hit) return setPreview(null);
    const r = hit.getBoundingClientRect();
    setPreview({ left: r.left, top: r.top, width: r.width, height: r.height });
  }

  function handleUp(e: React.PointerEvent) {
    const root = appRoot();
    const from = drag?.from ?? { x: e.clientX, y: e.clientY };
    const to = { x: e.clientX, y: e.clientY };
    setDrag(null);
    if (!root) return;

    const dragged =
      Math.abs(from.x - to.x) > DRAG_THRESHOLD || Math.abs(from.y - to.y) > DRAG_THRESHOLD;
    const found = withoutLayer(() =>
      dragged ? probeRect(root, boxBetween(from, to)) : probePoint(root, to.x, to.y),
    );
    setThings(found);
    setAnchor(to);
    setActive(null);
    setPinned(null);
  }

  const shown = things?.find((t) => t.id === (active ?? pinned));
  const panelLeft = Math.max(
    8,
    Math.min(anchor.x + 20, window.innerWidth - PANEL_WIDTH - 8),
  );
  const panelTop = Math.max(8, Math.min(anchor.y - 40, window.innerHeight - 260));

  return createPortal(
    <>
      {armed && (
        <div
          ref={layerRef}
          onPointerDown={(e) => {
            e.preventDefault();
            setDrag({ from: { x: e.clientX, y: e.clientY }, to: { x: e.clientX, y: e.clientY } });
          }}
          onPointerMove={handleMove}
          onPointerUp={handleUp}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: Z,
            cursor: "crosshair",
            background: "rgba(20,24,33,0.06)",
          }}
        />
      )}

      {armed && !drag && preview && <Outline box={preview} color="#38bdf8" />}
      {drag && <Outline box={boxBetween(drag.from, drag.to)} color="#38bdf8" />}
      {shown && <Outline box={shown.rect} color="#fb923c" />}

      {armed && !things && (
        <div style={{ ...hintStyle, zIndex: Z + 1 }}>
          クリックで1点 / ドラッグで範囲 ・ Ctrl を離すと戻る
        </div>
      )}

      {things && (
        <div
          style={{
            position: "fixed",
            left: panelLeft,
            top: panelTop,
            width: PANEL_WIDTH,
            maxHeight: 320,
            overflowY: "auto",
            zIndex: Z + 2,
            background: "#111827",
            color: "#e5e7eb",
            border: "1px solid #374151",
            borderRadius: 10,
            boxShadow: "0 10px 30px rgba(0,0,0,0.45)",
            font: "13px/1.5 system-ui, sans-serif",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "8px 10px",
              borderBottom: "1px solid #374151",
              position: "sticky",
              top: 0,
              background: "#111827",
            }}
          >
            <span style={{ fontSize: 12, color: "#9ca3af" }}>
              ここにあるもの {things.length}
            </span>
            <button
              onClick={() => {
                setThings(null);
                setPinned(null);
              }}
              style={{
                background: "transparent",
                border: "1px solid #4b5563",
                borderRadius: 6,
                color: "#e5e7eb",
                cursor: "pointer",
                fontSize: 11,
                padding: "2px 8px",
              }}
            >
              閉じる
            </button>
          </div>

          {things.length === 0 && (
            <div style={{ padding: "14px 10px", color: "#9ca3af", fontSize: 12 }}>
              ここには何も描かれていない。
              <br />
              少しずらすか、範囲で囲んでみて。
            </div>
          )}

          {things.map((thing) => (
            <div
              key={thing.id}
              onMouseEnter={() => setActive(thing.id)}
              onMouseLeave={() => setActive(null)}
              onClick={() => setPinned(pinned === thing.id ? null : thing.id)}
              style={{
                padding: "7px 10px",
                cursor: "pointer",
                borderBottom: "1px solid #1f2937",
                background: pinned === thing.id ? "#1f2937" : "transparent",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                {thing.swatch && (
                  <span
                    style={{
                      width: 11,
                      height: 11,
                      borderRadius: 3,
                      background: thing.swatch,
                      border: "1px solid #4b5563",
                      flexShrink: 0,
                    }}
                  />
                )}
                <span>{thing.label}</span>
                {thing.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 10,
                      color: "#fbbf24",
                      border: "1px solid #78350f",
                      borderRadius: 4,
                      padding: "0 4px",
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
              <div style={{ fontSize: 11, color: "#9ca3af", marginTop: 1 }}>{thing.detail}</div>
            </div>
          ))}
        </div>
      )}
    </>,
    document.body,
  );
}

const hintStyle: React.CSSProperties = {
  position: "fixed",
  left: "50%",
  bottom: 14,
  transform: "translateX(-50%)",
  background: "#111827",
  color: "#e5e7eb",
  border: "1px solid #374151",
  borderRadius: 999,
  padding: "5px 12px",
  font: "12px/1 system-ui, sans-serif",
  pointerEvents: "none",
  whiteSpace: "nowrap",
};
