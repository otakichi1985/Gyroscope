import { useCallback, useRef } from "react";
import { registerScrollable, unregisterScrollable } from "../lib/scrollTarget";

export function useScrollTargetRef<T extends HTMLElement>() {
  const held = useRef<T | null>(null);
  return useCallback((el: T | null) => {
    if (held.current && held.current !== el) unregisterScrollable(held.current);
    held.current = el;
    if (el) registerScrollable(el);
  }, []);
}
