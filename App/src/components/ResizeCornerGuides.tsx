import { useEffect, useRef } from "react";

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

    function handleMove(e: MouseEvent) {
      const corners = cornerPositions();
      for (const corner of CORNERS) {
        const [cx, cy] = corners[corner];
        const distance = Math.hypot(e.clientX - cx, e.clientY - cy);
        const strength = Math.max(0, 1 - distance / PROXIMITY_PX);
        refs[corner].current?.style.setProperty("--corner-glow", strength.toFixed(3));
      }
    }
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
