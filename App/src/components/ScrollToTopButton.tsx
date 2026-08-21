import { useEffect, useState } from "react";
import { activeScrollable, subscribeScrollables } from "../lib/scrollTarget";
import { ArrowUpIcon } from "./icons";

// A pane has to be scrolled past this many px before the button appears --
// at the top there's nowhere to jump, so showing it would just be noise.
const SHOW_AFTER_PX = 320;

/**
 * Floating "back to top" button (user request: 一気に上に戻れる機能). Appears
 * over whichever content pane is on screen once it's scrolled down far
 * enough, and clicking it glides the pane back to the top. The pane is
 * resolved through the scrollable registry (scrollTarget.ts) so it always
 * targets the list/overlay the user is actually looking at.
 */
export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const el = activeScrollable();
      setVisible(
        Boolean(el && el.scrollTop > SHOW_AFTER_PX && el.scrollHeight > el.clientHeight),
      );
    };
    // Registry changes (screen switch, overlay open/close) swap which pane is
    // active; the capture-phase scroll listener catches scrolls on whatever
    // pane it happens to be.
    const unsubscribe = subscribeScrollables(refresh);
    window.addEventListener("scroll", refresh, true);
    refresh();
    return () => {
      unsubscribe();
      window.removeEventListener("scroll", refresh, true);
    };
  }, []);

  if (!visible) return null;

  const handleClick = () => {
    const el = activeScrollable();
    el?.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label="一番上に戻る"
      title="一番上に戻る"
      className="scroll-to-top-btn accent-bg fixed right-4 bottom-4 z-40 flex h-9 w-9 items-center justify-center rounded-full text-white shadow-lg transition-opacity duration-150 hover:opacity-90 active:opacity-70"
    >
      <ArrowUpIcon className="h-4 w-4" />
    </button>
  );
}