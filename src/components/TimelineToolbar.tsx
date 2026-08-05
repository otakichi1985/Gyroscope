import { useEffect, useRef, useState } from "react";
import { useEntriesStore, type ViewMode } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";
import { FeedPicker } from "./FeedPicker";
import { RefreshIcon } from "./icons";

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "card", label: "カード" },
  { mode: "list", label: "リスト" },
  { mode: "compact", label: "コンパクト" },
];

// Feed/genre scope and display mode both used to live in FilterBar, mixed
// in with search/mark-all-read/screen-nav controls -- moved here, directly
// above EntryList (see App.tsx), since unlike those, both only ever affect
// what the timeline shows and how it's arranged, and conventionally a
// list's own scope/display controls sit right on top of the list itself
// (user feedback).
export function TimelineToolbar() {
  const feeds = useFeedsStore((s) => s.feeds);
  const refreshFeeds = useFeedsStore((s) => s.refresh);
  const refreshingAll = useFeedsStore((s) => s.refreshingAll);
  const backgroundRefreshing = useFeedsStore((s) => s.backgroundRefreshing);
  const refreshAllFeeds = useFeedsStore((s) => s.refreshAllFeeds);
  const { filterFeedId, setFilterFeedId, filterFolder, setFilterFolder, viewMode, setViewMode } =
    useEntriesStore();
  // Transient "更新はありません" toast -- a manual refresh that silently
  // finds nothing new was indistinguishable from a broken/no-op button
  // (user feedback). Only for the manual trigger; the scheduler's silent
  // tick stays silent even when it finds nothing, same as before.
  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => {
    refreshFeeds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function handleRefreshClick() {
    const newCount = await refreshAllFeeds();
    if (newCount === 0) {
      setToast("更新はありません");
      clearTimeout(toastTimer.current);
      toastTimer.current = setTimeout(() => setToast(null), 2200);
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1 border-b border-black/10 px-2 py-1 text-xs dark:border-white/10">
      {/* Moved here from FilterBar's icon cluster -- an icon-only button
          sitting among bookmark/search/nav icons was too easy to hit by
          accident (user feedback). Paired with a text label and given its
          own row/left position instead, away from the denser icon row above. */}
      <div className="relative shrink-0">
        <button
          type="button"
          onClick={handleRefreshClick}
          className="accent-text flex shrink-0 items-center gap-1 rounded px-1.5 py-1 transition-colors duration-150 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
        >
          <RefreshIcon className={`h-4 w-4 ${refreshingAll ? "animate-spin" : ""}`} />
          記事を更新
          {/* Background-activity pulse, moved here next to the button it's
              actually about (was floating in FilterBar's icon row, which
              read as unrelated to this button -- user feedback). Reserves
              its slot even when idle so the button doesn't shift width
              when it turns on. */}
          <span
            className={`h-1.5 w-1.5 shrink-0 rounded-full accent-bg transition-opacity duration-300 ${
              backgroundRefreshing ? "opacity-100 animate-pulse" : "opacity-0"
            }`}
            aria-hidden="true"
          />
        </button>
        {toast && (
          <div className="timeline-enter absolute left-0 top-full z-20 mt-1 whitespace-nowrap rounded bg-black/80 px-2 py-1 text-[11px] text-white shadow-md dark:bg-white/90 dark:text-black">
            {toast}
          </div>
        )}
      </div>

      {/* Custom dropdown (FeedPicker.tsx) instead of a native <select> --
          the native popup can't be positioned to the window bounds
          (same reasoning FontPicker.tsx already documents) or animated at
          all, which stood out next to the rest of this app's animated
          dropdowns/overlays (user feedback). */}
      <FeedPicker
        feeds={feeds}
        filterFeedId={filterFeedId}
        filterFolder={filterFolder}
        onSelectAll={() => setFilterFeedId(null)}
        onSelectFeed={(id) => setFilterFeedId(id)}
        onSelectFolder={(folder) => setFilterFolder(folder)}
      />

      <div className="flex shrink-0 gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
        {VIEW_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded px-1.5 py-0.5 transition-colors duration-150 ${
              viewMode === mode ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}
