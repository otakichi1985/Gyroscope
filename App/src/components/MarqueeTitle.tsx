import { useEffect, useRef, useState } from "react";
import { useAppearanceStore } from "../stores/appearanceStore";

const PX_PER_SEC = 70;

const MIN_DISTANCE_PX = 6;

const HOVER_DELAY_MS = 700;

const START_HOLD_SEC = 2;

const END_HOLD_SEC = 2.5;

const GAP_PX = 64;

interface MarqueeTitleProps {
  text: string;

  textClassName: string;

  className?: string;
}

export function MarqueeTitle({ text, textClassName, className = "" }: MarqueeTitleProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const measureRef = useRef<HTMLSpanElement>(null);
  const trackRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const delayTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const enabled = useAppearanceStore((s) => s.titleMarquee);


  function overflowPx() {
    const container = containerRef.current;
    const textEl = measureRef.current;
    if (!container || !textEl) return 0;
    return textEl.scrollWidth - container.clientWidth;
  }

  useEffect(() => () => clearTimeout(delayTimer.current), []);

  useEffect(() => {
    if (!active) return;
    const container = containerRef.current;
    const track = trackRef.current;
    const textEl = measureRef.current;
    if (!container || !track || !textEl) return;

    const textWidth = Math.round(textEl.offsetWidth);
    const revealPx = textWidth - container.clientWidth;
    if (revealPx < MIN_DISTANCE_PX) return;
    const lapPx = textWidth + GAP_PX;

    const revealSec = revealPx / PX_PER_SEC;
    const exitSec = (lapPx - revealPx) / PX_PER_SEC;
    const totalSec = START_HOLD_SEC + revealSec + END_HOLD_SEC + exitSec;
    const at = (elapsedSec: number) => elapsedSec / totalSec;

    const atX = (px: number) => `translate3d(-${px}px, 0, 0)`;

    let animation: Animation;
    try {
      animation = track.animate(
        [
          { transform: atX(0), offset: 0, easing: "linear" },
          { transform: atX(0), offset: at(START_HOLD_SEC), easing: "linear" },
          { transform: atX(revealPx), offset: at(START_HOLD_SEC + revealSec), easing: "linear" },
          {
            transform: atX(revealPx),
            offset: at(START_HOLD_SEC + revealSec + END_HOLD_SEC),
            easing: "linear",
          },
          { transform: atX(lapPx), offset: 1 },
        ],
        {
          duration: totalSec * 1000,
          iterations: Infinity,
          easing: "linear",
          delay: -START_HOLD_SEC * 1000,
        },
      );
    } catch (err) {
      console.error("MarqueeTitle: failed to start animation", err);
      return;
    }
    return () => animation.cancel();
  }, [active, text]);

  function handleEnter() {
    if (!enabled || overflowPx() < MIN_DISTANCE_PX) return;
    delayTimer.current = setTimeout(() => setActive(true), HOVER_DELAY_MS);
  }

  function handleLeave() {
    clearTimeout(delayTimer.current);
    setActive(false);
  }

  return (
    <div
      ref={containerRef}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      className={`min-w-0 overflow-hidden ${className}`}
    >

      <div ref={trackRef} className={active ? "flex w-max" : "block"}>
        <span ref={measureRef} className={`whitespace-nowrap ${active ? "" : "block truncate"} ${textClassName}`}>
          {text}
        </span>

        {active && (
          <span
            aria-hidden="true"
            style={{ paddingLeft: GAP_PX }}
            className={`whitespace-nowrap ${textClassName}`}
          >
            {text}
          </span>
        )}
      </div>
    </div>
  );
}
