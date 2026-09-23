import { useCallback, useEffect, useRef } from "react";

const EASING = 0.18;
const WHEEL_SENSITIVITY = 1.6;
const STOP_DISTANCE = 0.4;
const EXTERNAL_SCROLL_TOLERANCE = 12;

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
        if (e.ctrlKey || e.metaKey || e.shiftKey) return;
        if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return;
        const max = el.scrollHeight - el.clientHeight;
        if (max <= 0) return;
        e.preventDefault();
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
