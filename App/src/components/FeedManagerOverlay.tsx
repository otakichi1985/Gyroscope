import { useEffect, useRef } from "react";
import { useEntriesStore } from "../stores/entriesStore";
import { useUiStore } from "../stores/uiStore";
import { FeedManager } from "./FeedManager";
import { ScreenOverlay } from "./ScreenOverlay";

export function FeedManagerOverlay() {
  const isActive = useUiStore((s) => s.activeScreen === "feedManager");

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
    <ScreenOverlay screen="feedManager" title="フィード管理">
      <div className="min-h-0 flex-1 overflow-hidden">
        <FeedManager />
      </div>
    </ScreenOverlay>
  );
}
