import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEntriesStore, type ViewMode } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";
import { useAppearanceStore, type CardSize } from "../stores/appearanceStore";
import { useUiStore } from "../stores/uiStore";
import { EntryRow } from "./EntryRow";
import { RssIcon, SearchIcon, StarIcon, WarningIcon } from "./icons";
import { StatePanel } from "./StatePanel";

// Must match EntryRow's fixed CARD_ROW_HEIGHT. The gap is added separately
// below, so the initial estimate is already correct before measurement.
const CARD_BASE_SIZE: Record<CardSize, number> = { small: 72, medium: 96, large: 120 };
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

  // Reveal window for the row entrance animation (floating skins draw their
  // cards in rather than having them just be there).
  //
  // The animation CANNOT live on the row itself. Rows are virtualised, so
  // they mount and unmount constantly while scrolling, and an entrance on
  // the row would replay every time one scrolled back into view. Instead the
  // scroll container carries `list-reveal` for a short window and the CSS
  // targets rows only through that class -- so the rows present when a fresh
  // list arrives animate, and everything mounted later by scrolling does not.
  //
  // `loading` is the right trigger: refresh() sets it, fetchMore() uses
  // `loadingMore` instead, so this fires on a genuine list replacement
  // (first load, feed/genre change, search, view switch) and never on an
  // infinite-scroll append.
  const [revealing, setRevealing] = useState(false);
  const wasLoading = useRef(false);
  useEffect(() => {
    if (wasLoading.current && !loading) {
      setRevealing(true);
      const timer = setTimeout(() => setRevealing(false), 800);
      wasLoading.current = loading;
      return () => clearTimeout(timer);
    }
    wasLoading.current = loading;
  }, [loading]);

  const parentRef = useRef<HTMLDivElement>(null);

  const baseSize = viewMode === "card" ? CARD_BASE_SIZE[cardSize] : OTHER_BASE_SIZE[viewMode];

  // Identify a row the way React does -- by article, not by slot. The
  // virtualizer's default is to key everything by array index, and that
  // breaks in two separate ways once the list is replaced under it:
  //
  //  - Measured heights live in a cache keyed by that index which is never
  //    invalidated on a data change, so after a refresh slot 7 silently
  //    reuses whatever height the *previous* article in slot 7 had.
  //  - `measureElement` unobserves whatever node it had previously cached
  //    under an index. Rows are keyed by `entry.id` here, so a refresh that
  //    inserts an article at the top makes React reuse every existing row's
  //    DOM node and merely rewrite its `data-index` -- the ref is not called
  //    again, because its identity never changes. The newly mounted top row
  //    then claims index 0, finds the still-mounted old node cached there,
  //    and unobserves it. That row is left in the DOM with no ResizeObserver
  //    and no way back into the cache.
  //
  // Together those are the "cards overlap after a refresh and stay that way
  // until you scroll" bug: the shifted row keeps a wrong height, everything
  // below it is positioned one row too high, and only scrolling it out of
  // and back into the window (which remounts it, re-running the ref) repairs
  // it. Note that the mount path alone cannot repair anything -- when a
  // cached size exists, `measureElement` returns it instead of reading the
  // DOM, so the delta is zero. The ResizeObserver is the only corrective
  // path, which is exactly what gets torn off above.
  //
  // Keying by entry id makes both caches follow the row instead of the slot.
  const getItemKey = useCallback((index: number) => entries[index]?.id ?? index, [entries]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => baseSize + gap,
    getItemKey,
    overscan: 8,
  });

  // Row geometry is a function of these three settings, but changing
  // `estimateSize` invalidates nothing on its own: the measurements memo keys
  // off count/padding/gap and the size-cache version, never the estimator,
  // and a cached measurement always beats the estimate. So heights measured
  // in compact mode would still be driving layout after a switch to card
  // mode. Now that sizes are keyed by entry id they would follow the article
  // across that switch rather than being overwritten by the next occupant of
  // the slot, so the cache has to be dropped explicitly. Layout effect, not
  // a passive one, so the corrected positions land in the same paint as the
  // new row heights.
  useLayoutEffect(() => {
    virtualizer.measure();
  }, [virtualizer, viewMode, cardSize, cardGap]);

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
      className={`timeline-enter entry-list-scroll h-full overflow-y-auto px-2 py-1 text-sm ${
        revealing ? "list-reveal" : ""
      }`}
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
                // Discover-saved bookmarks are synthesized with feed_id 0
                // (see commands::entries) and belong to no real feed -- label
                // them as such instead of showing a blank source.
                feedTitle={entry.feed_id === 0 ? "保存した記事" : (feedTitleById.get(entry.feed_id) ?? "")}
                feedIconUrl={entry.feed_id === 0 ? null : (feedIconById.get(entry.feed_id) ?? null)}
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
