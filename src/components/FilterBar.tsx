import { useEffect } from "react";
import { useEntriesStore, type ViewMode } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";
import { useUiStore } from "../stores/uiStore";

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "card", label: "カード" },
  { mode: "list", label: "リスト" },
  { mode: "compact", label: "コンパクト" },
];

export function FilterBar() {
  const feeds = useFeedsStore((s) => s.feeds);
  const refreshFeeds = useFeedsStore((s) => s.refresh);
  const { filterFeedId, setFilterFeedId, viewMode, setViewMode, markAllRead, markAllUnread } =
    useEntriesStore();
  const toggleFeedManager = useUiStore((s) => s.toggleFeedManager);
  const toggleHistory = useUiStore((s) => s.toggleHistory);
  const toggleSettings = useUiStore((s) => s.toggleSettings);

  useEffect(() => {
    refreshFeeds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="flex shrink-0 flex-wrap items-center gap-1 border-b border-black/10 px-2 py-1 text-xs dark:border-white/10">
      <select
        value={filterFeedId ?? ""}
        onChange={(e) => setFilterFeedId(e.target.value === "" ? null : Number(e.target.value))}
        // The closed box's displayed text uses the <select>'s own `color`
        // (so it must stay dark:-aware to read against the panel), but that
        // same `color` also cascades into the dropdown *popup*'s <option>
        // list -- which Chromium renders with its own light background,
        // regardless of our theme. Fixing the popup by forcing the select's
        // own color (previous attempt) broke the closed-box display in dark
        // mode instead. The actual fix: leave the select's color theme-aware,
        // and set a fixed dark `color` directly on each <option> below --
        // Chromium's native popup *does* honor per-option color/background,
        // and that styling only applies inside the open list, not the closed
        // box.
        className="min-w-0 max-w-[45%] flex-1 rounded border border-black/10 bg-black/5 px-1 py-1 text-xs outline-none dark:border-white/10 dark:bg-white/5"
      >
        <option value="" className="text-black">
          全フィード
        </option>
        {feeds.map((feed) => (
          <option key={feed.id} value={feed.id} className="text-black">
            {feed.custom_title ?? feed.title ?? feed.url}
          </option>
        ))}
      </select>

      <div className="flex shrink-0 gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
        {VIEW_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded px-1.5 py-0.5 ${
              viewMode === mode
                ? "bg-black/10 dark:bg-white/10"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => markAllRead()}
        className="shrink-0 rounded px-1.5 py-1 opacity-60 hover:opacity-100"
      >
        すべて既読
      </button>

      <button
        type="button"
        onClick={() => markAllUnread()}
        className="shrink-0 rounded px-1.5 py-1 opacity-60 hover:opacity-100"
      >
        すべて未読
      </button>

      <button
        type="button"
        onClick={toggleHistory}
        className="shrink-0 rounded px-1.5 py-1 opacity-60 hover:opacity-100"
        aria-label="既読履歴を開く"
      >
        🕘
      </button>

      <button
        type="button"
        onClick={toggleFeedManager}
        className="shrink-0 rounded px-1.5 py-1 opacity-60 hover:opacity-100"
        aria-label="フィード管理を開く"
      >
        ⚙
      </button>

      <button
        type="button"
        onClick={toggleSettings}
        className="shrink-0 rounded px-1.5 py-1 opacity-60 hover:opacity-100"
        aria-label="外観設定を開く"
      >
        🎨
      </button>
    </div>
  );
}
