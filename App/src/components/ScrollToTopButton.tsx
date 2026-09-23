import { useEffect, useState } from "react";
import { activeScrollable, subscribeScrollables } from "../lib/scrollTarget";
import { ArrowUpIcon } from "./icons";

const SHOW_AFTER_PX = 320;

export function ScrollToTopButton() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const refresh = () => {
      const el = activeScrollable();
      setVisible(
        Boolean(el && el.scrollTop > SHOW_AFTER_PX && el.scrollHeight > el.clientHeight),
      );
    };
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
