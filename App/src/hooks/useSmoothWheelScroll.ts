import { useCallback, useEffect, useRef } from "react";

// なめらかスクロール ("マウスホイールころころ疲れないようにするやつ"):
// the wheel no longer snaps the list by its raw delta each notch -- instead
// each tick nudges the scroll toward a target that eases in over a few
// frames. The same distance needs noticeably fewer ころころ rolls, and the
// motion reads as a glide instead of a jolt. A single wheel tick still moves
// only as far as one delta, so the mapping stays predictable.
const EASING = 0.18;
// Wheel deltas are scaled up a touch so a short roll covers more ground.
const WHEEL_SENSITIVITY = 1.6;
// Below this remaining distance (px) the animation stops snapping.
const STOP_DISTANCE = 0.4;
// If the scroll position differs from what the animation believes by more
// than this, something scrolled externally (scrollbar, keyboard, programmatic
// scroll -- e.g. the virtualizer resetting on refresh) -- adopt reality and
// re-derive the target from it instead of fighting the user.
const EXTERNAL_SCROLL_TOLERANCE = 12;

/**
 * Returns a callback ref that makes a scroll container glide: wheel input is
 * converted into an eased scroll animation instead of the native per-notch
 * jump. When `enabled` is false (or toggles off), the container scrolls
 * natively.
 *
 * The optional `elementRef` is also populated with the same element, so a
 * virtualizer's `getScrollElement` keeps working when the ref is swapped for
 * this one.
 */
export function useSmoothWheelScroll<E extends HTMLElement>(
  enabled: boolean,
  elementRef?: { current: E | null },
) {
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;
  const cleanupRef = useRef<(() => void) | null>(null);

  useEffect(() => () => cleanupRef.current?.(), []);

  return useCallback(
    (el: E | null) => {
      cleanupRef.current?.();
      if (elementRef) elementRef.current = el;
      if (!el || !enabledRef.current) return;

      let raf = 0;
      let target = el.scrollTop;
      let current = el.scrollTop;

      const stop = () => {
        if (raf !== 0) cancelAnimationFrame(raf);
        raf = 0;
      };

      const onWheel = (e: WheelEvent) => {
        if (!enabledRef.current) return;
        // Zoom (ctrl/cmd) and horizontal scroll (shift / trackpad) stay native.
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) return;
        e.preventDefault();
        // If the user scrolls externally mid-glide, adopt the real position.
        if (Math.abs(el.scrollTop - current) > EXTERNAL_SCROLL_TOLERANCE) {
          current = el.scrollTop;
          target = el.scrollTop;
        }
        target = Math.min(max, Math.max(0, target + e.deltaY * WHEEL_SENSITIVITY));
        if (raf !== 0) return;
        const step = () => {
          const diff = target - current;
          if (Math.abs(diff) < STOP_DISTANCE) {
            current = target;
            el.scrollTop = target;
            raf = 0;
            return;
          }
          current += diff * EASING;
          el.scrollTop = current;
          raf = requestAnimationFrame(step);
        };
        raf = requestAnimationFrame(step);
      };

      el.addEventListener("wheel", onWheel, { passive: false });
      cleanupRef.current = () => {
        stop();
        el.removeEventListener("wheel", onWheel);
      };
    },
    [elementRef],
  );
}