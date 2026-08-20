import { useCallback, useRef } from "react";
import { registerScrollable, unregisterScrollable } from "../lib/scrollTarget";

/**
 * Callback ref that keeps the element in the scrollable registry (see
 * src/lib/scrollTarget.ts) while it's mounted, so the scroll-to-top button
 * and the Home/End/PageUp/PageDown keys can target the pane the user is
 * actually looking at. Combine it with another ref (e.g. the smooth-wheel
 * one) by calling both from a single callback:
 *
 *   const wheelRef = useSmoothWheelScroll(smoothScroll);
 *   const targetRef = useScrollTargetRef<HTMLDivElement>();
 *   const ref = useCallback(
 *     (el: HTMLDivElement | null) => { wheelRef(el); targetRef(el); },
 *     [wheelRef, targetRef],
 *   );
 */
export function useScrollTargetRef<T extends HTMLElement>() {
  const held = useRef<T | null>(null);
  return useCallback((el: T | null) => {
    if (held.current && held.current !== el) unregisterScrollable(held.current);
    held.current = el;
    if (el) registerScrollable(el);
  }, []);
}