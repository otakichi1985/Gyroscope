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
        // The dropdown *popup* (options list) is rendered natively by the OS/
        // browser, largely ignoring our Tailwind classes -- only `color`
        // cascades into it. `color-scheme:light dark` alone still left
        // unselected options showing our inherited dark-mode text color
        // (near-white) on the browser's light popup background, unreadable
        // except on hover (where Chromium forces its own contrast). Pinning
        // this control to `color-scheme:light` + a fixed dark text color
        // (not `dark:`-swapped) keeps the popup always light-with-dark-text,
        // matching what's actually achievable for a native <select>, instead
        // of trying to make it follow the app's own dark theme.
        className="min-w-0 max-w-[45%] flex-1 rounded border border-black/10 bg-black/5 px-1 py-1 text-xs text-neutral-900 outline-none [color-scheme:light] dark:border-white/10 dark:bg-white/5"
      >
        <option value="">全フィード</option>
        {feeds.map((feed) => (
          <option key={feed.id} value={feed.id}>
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
