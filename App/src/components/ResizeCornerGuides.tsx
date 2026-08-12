import { useEffect, useRef } from "react";

// Floating skins (see Skin.floating) render no window border at all, so the
// native OS resize margin -- a handful of pixels that already works, same as
// every other skin -- is invisible and effectively unfindable by feel alone
// (user feedback). This never drives the resize itself (that's still the OS
// hit-testing the raw window edge, unrelated to anything in the DOM); it only
// paints a soft L-bracket on whichever corner the cursor is currently near.
//
// Corners only, not full edges: the reported friction was specifically
// diagonal (corner) resizing, and a full-edge glow (an earlier version) drew
// attention to edge-only resizing nobody had actually complained about
// (user: "四つ角をドラッグして拡大縮小するときであって、上下左右のガイドは
// あまりいらない").
const PROXIMITY_PX = 48;
const ARM_PX = 18;

type Corner = "tl" | "tr" | "bl" | "br";
const CORNERS: Corner[] = ["tl", "tr", "bl", "br"];

export function ResizeCornerGuides() {
  const refs = {
    tl: useRef<HTMLDivElement>(null),
    tr: useRef<HTMLDivElement>(null),
    bl: useRef<HTMLDivElement>(null),
    br: useRef<HTMLDivElement>(null),
  };

  useEffect(() => {
    function cornerPositions(): Record<Corner, [number, number]> {
      const w = window.innerWidth;
      const h = window.innerHeight;
      return { tl: [0, 0], tr: [w, 0], bl: [0, h], br: [w, h] };
    }

    // Written straight to the DOM via refs rather than React state, same
    // reasoning as the mouse-spotlight in App.tsx: mousemove fires far too
    // often to re-render on.
    function handleMove(e: MouseEvent) {
      const corners = cornerPositions();
      for (const corner of CORNERS) {
        const [cx, cy] = corners[corner];
        const distance = Math.hypot(e.clientX - cx, e.clientY - cy);
        const strength = Math.max(0, 1 - distance / PROXIMITY_PX);
        refs[corner].current?.style.setProperty("--corner-glow", strength.toFixed(3));
      }
    }
    // The window's real border sits a few native, undecorated pixels beyond
    // where the WebView's own client area ends -- reaching for the corner
    // to actually grab it crosses out of that client area, which fires a
    // DOM `mouseleave` indistinguishable from genuinely leaving the window.
    // Zeroing every corner on any `mouseleave` (an earlier version) made
    // the highlight vanish at the exact moment the user reached the corner
    // to resize (user report). `e.clientX/clientY` is still the last real
    // position, right at the edge, so only clear corners the pointer
    // *wasn't* near -- the one it was near is presumably still being
    // reached for and stays lit until a later `mousemove` (post-drag, or
    // genuinely elsewhere) says otherwise.
    function handleLeave(e: MouseEvent) {
      const corners = cornerPositions();
      for (const corner of CORNERS) {
        const [cx, cy] = corners[corner];
        const distance = Math.hypot(e.clientX - cx, e.clientY - cy);
        if (distance > PROXIMITY_PX) {
          refs[corner].current?.style.setProperty("--corner-glow", "0");
        }
      }
    }

    window.addEventListener("mousemove", handleMove);
    document.addEventListener("mouseleave", handleLeave);
    return () => {
      window.removeEventListener("mousemove", handleMove);
      document.removeEventListener("mouseleave", handleLeave);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="resize-corner-guides" style={{ zIndex: 9999 }} aria-hidden="true">
      <div ref={refs.tl} className="resize-corner-guide resize-corner-guide-tl" style={{ width: ARM_PX, height: ARM_PX }} />
      <div ref={refs.tr} className="resize-corner-guide resize-corner-guide-tr" style={{ width: ARM_PX, height: ARM_PX }} />
      <div ref={refs.bl} className="resize-corner-guide resize-corner-guide-bl" style={{ width: ARM_PX, height: ARM_PX }} />
      <div ref={refs.br} className="resize-corner-guide resize-corner-guide-br" style={{ width: ARM_PX, height: ARM_PX }} />
    </div>
  );
}
