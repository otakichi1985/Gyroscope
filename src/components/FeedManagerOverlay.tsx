import { useEntriesStore } from "../stores/entriesStore";
import { useUiStore } from "../stores/uiStore";
import { FeedManager } from "./FeedManager";

export function FeedManagerOverlay() {
  const closeFeedManager = useUiStore((s) => s.closeFeedManager);

  function handleClose() {
    closeFeedManager();
    // Feeds may have been added/removed/refreshed while this was open —
    // resync the entry list rather than leaving it showing stale data.
    useEntriesStore.getState().refresh();
  }

  return (
    <div className="absolute inset-0 z-10 flex flex-col bg-white dark:bg-neutral-900">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-black/10 px-2 text-sm font-medium dark:border-white/10">
        <span>フィード管理</span>
        <button
          type="button"
          onClick={handleClose}
          className="rounded px-1 text-xs opacity-60 hover:opacity-100"
          aria-label="閉じる"
        >
          ×
        </button>
      </div>
      <div className="min-h-0 flex-1 overflow-hidden">
        <FeedManager />
      </div>
    </div>
  );
}
