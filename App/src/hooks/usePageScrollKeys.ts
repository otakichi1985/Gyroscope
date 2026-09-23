import { useEffect } from "react";
import { activeScrollable, scrollActiveBy, scrollActiveTo } from "../lib/scrollTarget";

const EDITABLE = "input, textarea, [contenteditable='true']";

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
