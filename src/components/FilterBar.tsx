import { useEffect, useMemo } from "react";
import { useEntriesStore, type ViewMode } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";
import type { Feed } from "../lib/types";
import { useAppearanceStore } from "../stores/appearanceStore";
import { useUiStore } from "../stores/uiStore";
import { ClockIcon, CloseIcon, PaletteIcon, RssIcon, StarIcon } from "./icons";

const VIEW_MODES: { mode: ViewMode; label: string }[] = [
  { mode: "card", label: "カード" },
  { mode: "list", label: "リスト" },
  { mode: "compact", label: "コンパクト" },
];

export function FilterBar() {
  const feeds = useFeedsStore((s) => s.feeds);
  const refreshFeeds = useFeedsStore((s) => s.refresh);
  const {
    filterFeedId,
    setFilterFeedId,
    filterFolder,
    setFilterFolder,
    starredOnly,
    setStarredOnly,
    searchQuery,
    setSearchQuery,
    viewMode,
    setViewMode,
    markAllRead,
    markAllUnread,
  } = useEntriesStore();
  const toggleScreen = useUiStore((s) => s.toggleScreen);
  const positionLocked = useAppearanceStore((s) => s.positionLocked);
  const titleBarVisible = useAppearanceStore((s) => s.titleBarVisible);

  useEffect(() => {
    refreshFeeds();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // When the title bar is hidden there'd otherwise be no way to drag the
  // window at all -- let this bar's own (mostly-empty, since it wraps)
  // background act as a fallback drag handle too. Skipped when the title
  // bar is showing so we don't have two overlapping drag regions doing the
  // same thing for no reason, and always skipped when locked.
  const dragRegion = !positionLocked && !titleBarVisible ? true : undefined;

  // Groups feeds by their (optional) genre/folder so the timeline picker can
  // offer "this whole genre" as well as individual feeds -- feeds.folder is
  // set per-feed in FeedManager.tsx or via OPML import.
  const { folders, feedsByFolder, unfiledFeeds } = useMemo(() => {
    const byFolder = new Map<string, Feed[]>();
    const unfiled: Feed[] = [];
    for (const feed of feeds) {
      if (feed.folder) {
        const list = byFolder.get(feed.folder) ?? [];
        list.push(feed);
        byFolder.set(feed.folder, list);
      } else {
        unfiled.push(feed);
      }
    }
    return {
      folders: [...byFolder.keys()].sort(),
      feedsByFolder: byFolder,
      unfiledFeeds: unfiled,
    };
  }, [feeds]);

  const selectValue = filterFolder ? `folder:${filterFolder}` : (filterFeedId ?? "");

  function handleFilterChange(value: string) {
    if (value === "") {
      setFilterFeedId(null);
    } else if (value.startsWith("folder:")) {
      setFilterFolder(value.slice("folder:".length));
    } else {
      setFilterFeedId(Number(value));
    }
  }

  return (
    <div
      data-tauri-drag-region={dragRegion}
      className="flex shrink-0 flex-wrap items-center gap-1 border-b border-black/10 px-2 py-1 text-xs dark:border-white/10"
    >
      <select
        value={selectValue}
        onChange={(e) => handleFilterChange(e.target.value)}
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
        {folders.map((folder) => (
          <option key={folder} value={`folder:${folder}`} className="text-black">
            ジャンル: {folder}
          </option>
        ))}
        {unfiledFeeds.map((feed) => (
          <option key={feed.id} value={feed.id} className="text-black">
            {feed.custom_title ?? feed.title ?? feed.url}
          </option>
        ))}
        {folders.map((folder) => (
          <optgroup key={folder} label={folder} className="text-black">
            {feedsByFolder.get(folder)!.map((feed) => (
              <option key={feed.id} value={feed.id} className="text-black">
                {feed.custom_title ?? feed.title ?? feed.url}
              </option>
            ))}
          </optgroup>
        ))}
      </select>

      <div className="flex shrink-0 gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
        {VIEW_MODES.map(({ mode, label }) => (
          <button
            key={mode}
            type="button"
            onClick={() => setViewMode(mode)}
            className={`rounded px-1.5 py-0.5 transition-colors duration-150 ${
              viewMode === mode
                ? "accent-bg-soft accent-text font-medium"
                : "opacity-60 hover:opacity-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="flex w-full items-center gap-1">
        <button
          type="button"
          onClick={() => setStarredOnly(!starredOnly)}
          className={`flex shrink-0 items-center rounded p-1 transition-colors duration-150 active:bg-black/10 dark:active:bg-white/10 ${
            starredOnly ? "accent-text" : "opacity-60 hover:opacity-100"
          }`}
          aria-label={starredOnly ? "ブックマークの絞り込みを解除" : "ブックマークのみ表示"}
          title="ブックマークのみ表示"
        >
          <StarIcon filled={starredOnly} className="h-4 w-4" />
        </button>

        <div className="relative min-w-0 flex-1">
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="記事を検索"
            className="w-full rounded border border-black/10 bg-black/5 py-1 pl-2 pr-6 text-xs outline-none dark:border-white/10 dark:bg-white/5"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-1 top-1/2 flex -translate-y-1/2 items-center rounded p-0.5 opacity-60 transition-colors duration-150 hover:opacity-100"
              aria-label="検索をクリア"
            >
              <CloseIcon className="h-3 w-3" />
            </button>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={() => markAllRead()}
        className="shrink-0 rounded px-1.5 py-1 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
      >
        すべて既読
      </button>

      <button
        type="button"
        onClick={() => markAllUnread()}
        className="shrink-0 rounded px-1.5 py-1 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
      >
        すべて未読
      </button>

      <button
        type="button"
        onClick={() => toggleScreen("history")}
        className="flex shrink-0 items-center rounded p-1 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
        aria-label="既読履歴を開く"
      >
        <ClockIcon className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => toggleScreen("feedManager")}
        className="flex shrink-0 items-center rounded p-1 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
        aria-label="フィード管理を開く"
      >
        <RssIcon className="h-4 w-4" />
      </button>

      <button
        type="button"
        onClick={() => toggleScreen("settings")}
        className="flex shrink-0 items-center rounded p-1 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
        aria-label="外観設定を開く"
      >
        <PaletteIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
