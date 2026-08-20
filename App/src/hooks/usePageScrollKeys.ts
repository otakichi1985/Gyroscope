import { useEffect } from "react";
import { activeScrollable, scrollActiveBy, scrollActiveTo } from "../lib/scrollTarget";

const EDITABLE = "input, textarea, [contenteditable='true']";

/**
 * Global page-scroll keys for the active content pane (see scrollTarget.ts):
 * Home jumps to the top, End to the bottom, PageUp/PageDown scroll by roughly
 * a viewport. Ignored while typing in an editable field, where Home/End move
 * the caret and the browser's own page keys do the expected thing.
 */
export function usePageScrollKeys() {
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      const target = e.target;
      if (target instanceof HTMLElement && target.closest(EDITABLE)) return;
      switch (e.key) {
        case "Home":
          e.preventDefault();
          scrollActiveTo("top");
          break;
        case "End":
          e.preventDefault();
          scrollActiveTo("bottom");
          break;
        case "PageUp":
        case "PageDown": {
          const el = activeScrollable();
          const amount = (el?.clientHeight ?? window.innerHeight) * 0.9;
          e.preventDefault();
          scrollActiveBy(e.key === "PageUp" ? -amount : amount);
          break;
        }
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}