import { useEffect, useRef } from "react";
import { useEntriesStore } from "../stores/entriesStore";
import { useUiStore } from "../stores/uiStore";
import { FeedManager } from "./FeedManager";
import { CloseIcon } from "./icons";

export function FeedManagerOverlay() {
  const activeScreen = useUiStore((s) => s.activeScreen);
  const goHome = useUiStore((s) => s.goHome);
  const isActive = activeScreen === "feedManager";

  // Feeds may have been added/removed/refreshed while this screen was
  // active -- resync the entry list on the way out. This has to react to
  // *any* departure from this screen (× button, re-pressing the same
  // toolbar icon, or switching straight to a different screen), not just
  // an explicit close click, since the screen now stays mounted rather
  // than unmounting on close.
  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !isActive) {
      useEntriesStore.getState().refresh();
    }
    wasActive.current = isActive;
  }, [isActive]);

  return (
    <div
      className={`panel-bg absolute inset-0 z-10 flex flex-col transition-all duration-200 ease-out ${
        isActive ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0 pointer-events-none"
      }`}
      inert={!isActive}
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-black/10 px-2 text-sm font-medium dark:border-white/10">
        <span>フィード管理</span>
        <button
          type="button"
          onClick={goHome}
          className="flex items-center rounded p-1 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
          aria-label="閉じる"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FeedManager />
      </div>
    </div>
  );
}
