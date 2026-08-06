import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Feed } from "../lib/types";
import { ChevronDownIcon } from "./icons";

interface FeedPickerProps {
  feeds: Feed[];
  filterFeedId: number | null;
  filterFolder: string | null;
  onSelectAll: () => void;
  onSelectFeed: (id: number) => void;
  onSelectFolder: (folder: string) => void;
}

const GAP_PX = 4;
const MAX_LIST_HEIGHT_PX = 260;
const MIN_LIST_HEIGHT_PX = 100;
const POPUP_BORDER_PX = 2;

// Same portal-positioned-popup architecture as FontPicker.tsx (see its own
// doc comment for why a native <select> doesn't work here either: its
// popup is an OS-level surface Chromium positions on its own, ignoring
// this window's bounds). The other half of the motivation this time is
// purely visual -- a native <select> popup can't be animated or styled at
// all, which stood out as the one dropdown in this app that just snapped
// open instantly while everything else here got a slide/fade treatment
// (user feedback).
export function FeedPicker({ feeds, filterFeedId, filterFolder, onSelectAll, onSelectFeed, onSelectFolder }: FeedPickerProps) {
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  // Groups feeds by their (optional) genre/folder so the popup can offer
  // "this whole genre" as well as individual feeds -- feeds.folder is set
  // per-feed in FeedManager.tsx (via the genre picker there) or via OPML
  // import.
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

  const selectedLabel = useMemo(() => {
    if (filterFolder) return `ジャンル: ${filterFolder}`;
    if (filterFeedId != null) {
      const feed = feeds.find((f) => f.id === filterFeedId);
      return feed ? (feed.custom_title ?? feed.title ?? feed.url) : "全フィード";
    }
    return "全フィード";
  }, [filterFeedId, filterFolder, feeds]);

  function handleOpen() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - GAP_PX;
    const spaceAbove = rect.top - GAP_PX;
    const openUpward = spaceBelow < MIN_LIST_HEIGHT_PX + POPUP_BORDER_PX && spaceAbove > spaceBelow;
    // Never force the minimum height when the viewport genuinely has less
    // room. Doing so pushes the fixed popup past the native window edge,
    // where no amount of scrolling can reveal the clipped portion.
    const available = Math.max(
      0,
      Math.min(MAX_LIST_HEIGHT_PX, (openUpward ? spaceAbove : spaceBelow) - POPUP_BORDER_PX),
    );
    setPos({
      left: rect.left,
      width: rect.width,
      top: openUpward ? rect.top - GAP_PX - available - POPUP_BORDER_PX : rect.bottom + GAP_PX,
      maxHeight: available,
    });
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (listRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // Scroll events are observed in the capture phase, so the popup's own
    // overflow container arrives here too. Ignore those; otherwise the
    // first wheel tick closes the list before it can actually scroll.
    function handleScroll(e: Event) {
      const target = e.target;
      if (target instanceof Node && listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  function pick(action: () => void) {
    action();
    setOpen(false);
  }

  const itemClass = (selected: boolean) =>
    `block w-full truncate rounded px-2 py-1 text-left text-xs text-neutral-900 transition-colors duration-150 hover:bg-black/5 dark:text-neutral-100 dark:hover:bg-white/10 ${
      selected ? "font-medium" : ""
    }`;

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : handleOpen())}
        // No `backdrop-blur` on the trigger: it sits on `.panel-bg`, a
        // fully opaque solid colour, so blurring it returns the same colour
        // (see EntryRow.tsx for the full note). The popup below is the one
        // place it earns its cost, since that really does overlap content.
        className="flex min-w-0 flex-1 items-center justify-between gap-1 rounded border border-black/10 bg-black/5 px-2 py-1 text-left text-xs outline-none dark:border-white/10 dark:bg-white/5"
      >
        <span className="truncate">{selectedLabel}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {open &&
        pos &&
        createPortal(
          // Solid-ish translucent surface + blur rather than this app's
          // .panel-bg/.accent-* skin-tinted utilities: those read CSS
          // custom properties set inline on the App root div, which don't
          // cascade into a document.body portal (same constraint as
          // FontPicker.tsx). Frosted-glass look achieved with a plain
          // fixed white/black tint instead, so it doesn't depend on that
          // scope at all.
          <div
            ref={listRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="dropdown-enter z-50 flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white/85 shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-neutral-900/85"
          >
            <div style={{ maxHeight: pos.maxHeight }} className="overflow-y-auto p-1">
              <button
                type="button"
                onClick={() => pick(onSelectAll)}
                className={itemClass(filterFeedId == null && filterFolder == null)}
              >
                全フィード
              </button>
              {folders.map((folder) => (
                <button
                  key={folder}
                  type="button"
                  onClick={() => pick(() => onSelectFolder(folder))}
                  className={itemClass(filterFolder === folder)}
                >
                  ジャンル: {folder}
                </button>
              ))}
              {unfiledFeeds.map((feed) => (
                <button
                  key={feed.id}
                  type="button"
                  onClick={() => pick(() => onSelectFeed(feed.id))}
                  className={itemClass(filterFeedId === feed.id)}
                >
                  {feed.custom_title ?? feed.title ?? feed.url}
                </button>
              ))}
              {folders.map((folder) => (
                <div key={folder} className="mt-1 border-t border-black/10 pt-1 dark:border-white/10">
                  <div className="px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                    {folder}
                  </div>
                  {feedsByFolder.get(folder)!.map((feed) => (
                    <button
                      key={feed.id}
                      type="button"
                      onClick={() => pick(() => onSelectFeed(feed.id))}
                      className={itemClass(filterFeedId === feed.id)}
                    >
                      {feed.custom_title ?? feed.title ?? feed.url}
                    </button>
                  ))}
                </div>
              ))}
              {feeds.length === 0 && <p className="px-2 py-1 text-xs text-neutral-500">フィードがありません</p>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
