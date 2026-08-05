import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEntriesStore, type ViewMode } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";
import { useAppearanceStore, type CardSize } from "../stores/appearanceStore";
import { useUiStore } from "../stores/uiStore";
import { EntryRow } from "./EntryRow";
import { RssIcon, SearchIcon, StarIcon, WarningIcon } from "./icons";
import { StatePanel } from "./StatePanel";

const CARD_BASE_SIZE: Record<CardSize, number> = { small: 88, medium: 120, large: 168 };
const OTHER_BASE_SIZE: Record<Exclude<ViewMode, "card">, number> = { list: 56, compact: 32 };
/** Mirrors EntryRow's own card thumbnail sizing, for the skeleton below. */
const CARD_THUMB_SIZE: Record<CardSize, string> = {
  small: "h-12 w-12",
  medium: "h-16 w-16",
  large: "h-24 w-24",
};

const GAP_PX: Record<string, number> = {
  compact: 0,
  normal: 8,
  relaxed: 16,
};

/**
 * "No articles" is several different situations that want different words
 * -- and, in the first-run case, a way out. A brand new install used to
 * show a bare "記事がありません" with no hint that feeds are what is
 * missing or where to add them.
 */
function EmptyState() {
  const feeds = useFeedsStore((s) => s.feeds);
  const { searchQuery, starredOnly } = useEntriesStore();
  const toggleScreen = useUiStore((s) => s.toggleScreen);

  if (feeds.length === 0) {
    return (
      <StatePanel
        icon={<RssIcon className="h-7 w-7" />}
        title="フィードがまだありません"
        detail="読みたいサイトのURLを追加すると、新着記事がここに並びます"
        action={{ label: "フィードを追加", onClick: () => toggleScreen("feedManager") }}
      />
    );
  }
  if (searchQuery.trim()) {
    return (
      <StatePanel
        icon={<SearchIcon className="h-7 w-7" />}
        title="一致する記事がありません"
        detail={`「${searchQuery.trim()}」で検索しました`}
      />
    );
  }
  if (starredOnly) {
    return (
      <StatePanel
        icon={<StarIcon className="h-7 w-7" />}
        title="ブックマークがありません"
        detail="記事の☆を押すと、ここに集まります"
      />
    );
  }
  return (
    <StatePanel
      icon={<RssIcon className="h-7 w-7" />}
      title="記事がありません"
      detail="「記事を更新」を押すと最新の記事を取得します"
    />
  );
}

/** Placeholder rows shaped like the real ones for the current view mode. */
function EntrySkeleton({ mode, cardSize, gap }: { mode: ViewMode; cardSize: CardSize; gap: number }) {
  const rowHeight = mode === "card" ? CARD_BASE_SIZE[cardSize] : OTHER_BASE_SIZE[mode];
  const bar = "rounded bg-black/10 dark:bg-white/10";

  return (
    <div className="h-full overflow-hidden px-2 py-1" aria-hidden="true">
      {Array.from({ length: 8 }).map((_, i) => (
        <div
          key={i}
          className="flex animate-pulse items-center gap-2 rounded-lg px-2"
          style={{ height: rowHeight, marginBottom: gap }}
        >
          {mode === "card" && <div className={`${bar} ${CARD_THUMB_SIZE[cardSize]} shrink-0`} />}
          <div className="flex min-w-0 flex-1 flex-col gap-1.5">
            <div className={`${bar} h-3`} style={{ width: `${70 - ((i * 7) % 25)}%` }} />
            {mode !== "compact" && <div className={`${bar} h-2.5`} style={{ width: `${45 - ((i * 5) % 20)}%` }} />}
          </div>
        </div>
      ))}
    </div>
  );
}

export function EntryList() {
  const { entries, loading, loadingMore, hasMore, error, viewMode, starredOnly, refresh, fetchMore } =
    useEntriesStore();
  const feeds = useFeedsStore((s) => s.feeds);
  const cardSize = useAppearanceStore((s) => s.cardSize);
  const cardGap = useAppearanceStore((s) => s.cardGap);
  const gap = GAP_PX[cardGap];

  const feedTitleById = useMemo(() => {
    const map = new Map<number, string>();
    for (const feed of feeds) {
      map.set(feed.id, feed.custom_title ?? feed.title ?? feed.url);
    }
    return map;
  }, [feeds]);

  // Feed icon (favicon-ish) used as a thumbnail substitute in EntryRow's
  // card mode when an entry has no thumbnail of its own -- see
  // src-tauri/src/fetch/favicon.rs.
  const feedIconById = useMemo(() => {
    const map = new Map<number, string | null>();
    for (const feed of feeds) {
      map.set(feed.id, feed.icon_path);
    }
    return map;
  }, [feeds]);

  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parentRef = useRef<HTMLDivElement>(null);

  const baseSize = viewMode === "card" ? CARD_BASE_SIZE[cardSize] : OTHER_BASE_SIZE[viewMode];

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => baseSize + gap,
    overscan: 8,
  });

  const virtualItems = virtualizer.getVirtualItems();

  useEffect(() => {
    const last = virtualItems[virtualItems.length - 1];
    if (!last) return;
    if (last.index >= entries.length - 1 && hasMore && !loadingMore) {
      fetchMore();
    }
  }, [virtualItems, entries.length, hasMore, loadingMore, fetchMore]);

  if (error) {
    return (
      <StatePanel
        icon={<WarningIcon className="h-6 w-6" />}
        tone="error"
        title="記事を読み込めませんでした"
        detail={error}
        action={{ label: "再試行", onClick: () => refresh() }}
      />
    );
  }

  // Skeleton rows rather than a "読み込み中..." line: they occupy the shape
  // the real content is about to take, so the list does not visibly jump
  // when it arrives.
  if (loading && entries.length === 0) {
    return <EntrySkeleton mode={viewMode} cardSize={cardSize} gap={gap} />;
  }

  if (entries.length === 0) {
    return <EmptyState />;
  }

  return (
    // `key` forces a fresh DOM node (and a reset scroll position) whenever
    // the bookmark filter toggles, which is what lets `.timeline-enter`'s
    // `@starting-style` replay -- without it this div just re-renders in
    // place, and the list swap read as an abrupt in-place mutation rather
    // than entering a distinct view (user feedback: wanted the bookmark
    // filter to feel more like switching tabs, closer to how opening
    // Settings/History/etc. already animates).
    <div
      key={starredOnly ? "starred" : "all"}
      ref={parentRef}
      className="timeline-enter entry-list-scroll h-full overflow-y-auto px-2 py-1 text-sm"
    >
      <div
        style={{ height: virtualizer.getTotalSize(), position: "relative", width: "100%" }}
      >
        {virtualItems.map((virtualItem) => {
          const entry = entries[virtualItem.index];
          return (
            <div
              key={entry.id}
              ref={virtualizer.measureElement}
              data-index={virtualItem.index}
              style={{
                position: "absolute",
                top: 0,
                left: 0,
                width: "100%",
                paddingBottom: gap,
                transform: `translateY(${virtualItem.start}px)`,
              }}
            >
              <EntryRow
                entry={entry}
                mode={viewMode}
                feedTitle={feedTitleById.get(entry.feed_id) ?? ""}
                feedIconUrl={feedIconById.get(entry.feed_id) ?? null}
                cardSize={cardSize}
                showDelete={starredOnly}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
