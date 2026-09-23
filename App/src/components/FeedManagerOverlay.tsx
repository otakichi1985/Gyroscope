import { useEffect, useRef } from "react";
import { refreshAllEntriesStores } from "../stores/entriesStore";
import { useUiStore } from "../stores/uiStore";
import { FeedManager } from "./FeedManager";
import { ScreenOverlay } from "./ScreenOverlay";

export function FeedManagerOverlay() {
  const isActive = useUiStore((s) => s.activeScreen === "feedManager");

  const wasActive = useRef(false);
  useEffect(() => {
    if (wasActive.current && !isActive) {
      refreshAllEntriesStores();
    }
    wasActive.current = isActive;
  }, [isActive]);

  return (
    <ScreenOverlay screen="feedManager" title="フィード管理">
      <FeedManager />
    </ScreenOverlay>
  );
}
