import { useEffect, useMemo, useRef } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEntriesStore, type ViewMode } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";
import { useAppearanceStore, type CardSize } from "../stores/appearanceStore";
import { EntryRow } from "./EntryRow";

const CARD_BASE_SIZE: Record<CardSize, number> = { small: 88, medium: 120, large: 168 };
const OTHER_BASE_SIZE: Record<Exclude<ViewMode, "card">, number> = { list: 56, compact: 32 };

const GAP_PX: Record<string, number> = {
  compact: 0,
  normal: 8,
  relaxed: 16,
};

export function EntryList() {
  const { entries, loading, loadingMore, hasMore, error, viewMode, refresh, fetchMore } =
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
    return <p className="p-3 text-xs text-red-500">{error}</p>;
  }

  if (loading && entries.length === 0) {
    return <p className="p-3 text-xs opacity-60">読み込み中...</p>;
  }

  if (entries.length === 0) {
    return <p className="p-3 text-xs opacity-60">記事がありません</p>;
  }

  return (
    <div ref={parentRef} className="h-full overflow-y-auto px-2 py-1 text-sm">
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
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
