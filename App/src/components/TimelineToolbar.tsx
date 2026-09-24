import { useEffect, useRef, useState } from "react";
import { useEntriesStore, type EntriesStoreHook, type ViewMode } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";
import { FeedPicker } from "./FeedPicker";
import { CardViewIcon, CompactViewIcon, ListViewIcon, RefreshIcon, SortIcon } from "./icons";

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "card", label: "カード" },
  { mode: "list", label: "リスト" },
  { mode: "compact", label: "コンパクト" },
];
const VIEW_ICONS = { card: CardViewIcon, list: ListViewIcon, compact: CompactViewIcon };

export function TimelineToolbar({ useStore = useEntriesStore }: { useStore?: EntriesStoreHook }) {
  const feeds = useFeedsStore((s) => s.feeds);
  const refreshFeeds = useFeedsStore((s) => s.refresh);
  const refreshingAll = useFeedsStore((s) => s.refreshingAll);
  const backgroundRefreshing = useFeedsStore((s) => s.backgroundRefreshing);
  const refreshAllFeeds = useFeedsStore((s) => s.refreshAllFeeds);
  const {
    filterFeedId,
    setFilterFeedId,
    filterFolder,
    setFilterFolder,
    viewMode,
    setViewMode,
    sortOrder,
    setSortOrder,
  } = useStore();
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
    <div className="timeline-toolbar flex shrink-0 flex-wrap items-center gap-1 border-b border-black/10 px-2 py-1 text-xs dark:border-white/10">

      <div className="relative shrink-0">
        <button
          type="button"
          onClick={handleRefreshClick}
          className="pill-button accent-text flex min-h-7 shrink-0 items-center gap-1 rounded px-1.5 py-1 transition-colors duration-150 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
        >
          <RefreshIcon className={`h-4 w-4 ${refreshingAll ? "animate-spin" : ""}`} />
          <span className="toolbar-label">記事を更新</span>

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


      <FeedPicker
        feeds={feeds}
        filterFeedId={filterFeedId}
        filterFolder={filterFolder}
        onSelectAll={() => setFilterFeedId(null)}
        onSelectFeed={(id) => setFilterFeedId(id)}
        onSelectFolder={(folder) => setFilterFolder(folder)}
      />


      <button
        type="button"
        onClick={() => setSortOrder(sortOrder === "asc" ? "desc" : "asc")}
        title={sortOrder === "asc" ? "昇順（クリックで降順に）" : "降順（クリックで昇順に）"}
        className="pill-button flex min-h-7 shrink-0 items-center gap-1 rounded px-1.5 py-1 transition-colors duration-150 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
      >
        <SortIcon className={`h-3.5 w-3.5 transition-transform duration-150 ${sortOrder === "asc" ? "rotate-180" : ""}`} />
        <span className="toolbar-label">{sortOrder === "asc" ? "昇順" : "降順"}</span>
      </button>

      <div className="segmented flex shrink-0 gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
        {VIEW_MODES.map(({ mode, label }) => {
          const ViewIcon = VIEW_ICONS[mode];
          return (
            <button
              key={mode}
              type="button"
              onClick={() => setViewMode(mode)}
              aria-label={`${label}表示`}
              aria-pressed={viewMode === mode}
              title={`${label}表示`}
              className={`min-h-6 items-center justify-center rounded px-1.5 py-0.5 transition-colors duration-150 ${
                viewMode === mode ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
              }`}
            >
              <ViewIcon className="view-mode-icon h-4 w-4" aria-hidden="true" />
              <span className="view-mode-label">{label}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
