import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useEntriesStore, type EntriesStoreHook, type ViewMode } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";
import { useAppearanceStore, type CardSize } from "../stores/appearanceStore";
import { useUiStore } from "../stores/uiStore";
import { useSmoothWheelScroll } from "../hooks/useSmoothWheelScroll";
import { useScrollTargetRef } from "../hooks/useScrollTargetRef";
import { EntryRow } from "./EntryRow";
import { RssIcon, SearchIcon, StarIcon, WarningIcon } from "./icons";
import { StatePanel } from "./StatePanel";

const CARD_BASE_SIZE: Record<CardSize, number> = { small: 72, medium: 96, large: 120 };
const OTHER_BASE_SIZE: Record<Exclude<ViewMode, "card">, number> = { list: 56, compact: 32 };

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

function EmptyState({ useStore = useEntriesStore }: { useStore?: EntriesStoreHook }) {
  const feeds = useFeedsStore((s) => s.feeds);
  const { searchQuery, starredOnly } = useStore();
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

export function EntryList({ useStore = useEntriesStore }: { useStore?: EntriesStoreHook }) {
  const { entries, loading, loadingMore, hasMore, error, viewMode, starredOnly, refresh, fetchMore } =
    useStore();
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

  /* 仮想行の再mountではなく、一覧を置き換えた直後だけ登場motionを許可する。 */
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
  const smoothScroll = useAppearanceStore((s) => s.smoothScroll);
  const wheelRef = useSmoothWheelScroll(smoothScroll, parentRef);
  const targetRef = useScrollTargetRef<HTMLDivElement>();
  const scrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      wheelRef(el);
      targetRef(el);
    },
    [wheelRef, targetRef],
  );

  const baseSize = viewMode === "card" ? CARD_BASE_SIZE[cardSize] : OTHER_BASE_SIZE[viewMode];

  /* 測定cacheを表示位置でなく記事IDへ結び、更新後の高さ誤再利用を防ぐ。 */
  const getItemKey = useCallback((index: number) => entries[index]?.id ?? index, [entries]);

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => baseSize + gap,
    getItemKey,
    overscan: 8,
  });

  useLayoutEffect(() => {
    /* 行の形を変える設定では、paint前に測定cacheを更新する。 */
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

  if (loading && entries.length === 0) {
    return <EntrySkeleton mode={viewMode} cardSize={cardSize} gap={gap} />;
  }

  if (entries.length === 0) {
    return <EmptyState useStore={useStore} />;
  }

  return (
    <div
      key={starredOnly ? "starred" : "all"}
      ref={scrollRef}
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
                useStore={useStore}
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
