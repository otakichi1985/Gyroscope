import { useEffect, useRef, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEntriesStore, type EntriesStoreHook, type ViewMode } from "../stores/entriesStore";
import { entrySnippet, formatPublished } from "../lib/text";
import { ENTRY_LAMP_LABEL, getEntryLamp } from "../lib/entryStatus";
import { useAppearanceStore, type CardSize } from "../stores/appearanceStore";
import { useUiStore } from "../stores/uiStore";
import { fetchArticleThumb } from "../lib/articleThumb";
import type { Entry } from "../lib/types";
import { ImageOffIcon, StarIcon, TrashIcon } from "./icons";
import { MarqueeTitle } from "./MarqueeTitle";

const HTTP_LINK_RE = /^https?:\/\//i;

const VIDEO_LINK_HOSTS = new Set([
  "youtube.com",
  "www.youtube.com",
  "m.youtube.com",
  "youtu.be",
  "www.youtu.be",
]);

/** YouTube動画の行か。動画は記事リーダーを開かず、カード展開＋ブラウザ遷移で扱う。 */
export function isVideoEntry(entry: Pick<Entry, "link">): boolean {
  if (!entry.link) return false;
  try {
    return VIDEO_LINK_HOSTS.has(new URL(entry.link).hostname.toLowerCase());
  } catch {
    return false;
  }
}

const CARD_THUMB_SIZE: Record<CardSize, string> = {
  small: "h-12 w-12",
  medium: "h-16 w-16",
  large: "h-24 w-24",
};
const CARD_ROW_HEIGHT: Record<CardSize, string> = {
  small: "h-[72px]",
  medium: "h-[96px]",
  large: "h-[120px]",
};
const CARD_TITLE_SIZE: Record<CardSize, string> = {
  small: "text-xs",
  medium: "text-sm",
  large: "text-base",
};
const CARD_SNIPPET_CLAMP: Record<CardSize, string> = {
  small: "line-clamp-1",
  medium: "line-clamp-2",
  large: "line-clamp-3",
};

interface EntryRowProps {
  entry: Entry;
  mode: ViewMode;
  feedTitle: string;
  feedIconUrl: string | null;
  cardSize: CardSize;
  showDelete: boolean;

  useStore?: EntriesStoreHook;
}

export function EntryRow({ entry, mode, feedTitle, feedIconUrl, cardSize, showDelete, useStore = useEntriesStore }: EntryRowProps) {
  const markRead = useStore((s) => s.markRead);
  const toggleStar = useStore((s) => s.toggleStar);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const blockImages = useAppearanceStore((s) => s.blockImages);
  const clickBehavior = useAppearanceStore((s) => s.clickBehavior);
  const [thumbFailed, setThumbFailed] = useState(false);
  const [feedIconFailed, setFeedIconFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const isVideo = isVideoEntry(entry);

  const rowRef = useRef<HTMLDivElement>(null);
  const [fetchedThumb, setFetchedThumb] = useState<string | null>(null);
  const shouldFetchThumb =
    mode === "card" && !blockImages && !entry.thumbnail_url && !!entry.link && HTTP_LINK_RE.test(entry.link);
  useEffect(() => {
    if (!shouldFetchThumb) return;
    let cancelled = false;
    const apply = () =>
      fetchArticleThumb(entry.link!).then((url) => {
        if (!cancelled) setFetchedThumb(url);
      });
    const el = rowRef.current;
    if (!el || typeof IntersectionObserver === "undefined") {
      void apply();
    } else {
      const io = new IntersectionObserver(
        (entries) => {
          if (entries.some((e) => e.isIntersecting)) {
            io.disconnect();
            void apply();
          }
        },
        { rootMargin: "200px" },
      );
      io.observe(el);
      return () => {
        cancelled = true;
        io.disconnect();
      };
    }
    return () => {
      cancelled = true;
    };
  }, [shouldFetchThumb, entry.link]);

  const thumbUrl = entry.thumbnail_url || fetchedThumb;

  useEffect(() => setThumbFailed(false), [entry.thumbnail_url]);
  useEffect(() => setFeedIconFailed(false), [feedIconUrl]);

  async function handleOpen() {
    if (!entry.is_read && entry.id >= 0) markRead(entry.id, true);
    if (isVideo) {
      setExpanded((v) => !v);
      return;
    }
    if (clickBehavior === "reader") {
      useUiStore.getState().openReader(entry.id);
      return;
    }
    if (entry.link && HTTP_LINK_RE.test(entry.link)) {
      await openUrl(entry.link);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      handleOpen();
    }
  }

  function handleToggleStar(e: React.MouseEvent) {
    e.stopPropagation();
    toggleStar(entry.id, !entry.is_starred);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    deleteEntry(entry.id);
  }

  const title = entry.title ?? entry.link ?? "(無題)";
  const published = formatPublished(entry.published_at);
  const meta = (feedTitle || published) && (
    <>
      {feedTitle && <span className="accent-text">{feedTitle}</span>}
      {feedTitle && published && <span className="opacity-60"> · </span>}
      {published && <span className="opacity-60 tabular-nums">{published}</span>}
    </>
  );

  const starButton = (
    <button
      type="button"
      onClick={handleToggleStar}
      className={`flex shrink-0 self-start items-center rounded p-1.5 transition-colors duration-150 active:bg-black/10 dark:active:bg-white/10 ${
        entry.is_starred ? "accent-text" : "opacity-60 hover:opacity-100"
      }`}
      aria-label={entry.is_starred ? "スターを外す" : "スターを付ける"}
    >
      <StarIcon filled={entry.is_starred} className="h-4 w-4" />
    </button>
  );

  const deleteButton = showDelete && (
    <button
      type="button"
      onClick={handleDelete}
      className="flex shrink-0 items-center rounded p-0.5 opacity-60 transition-colors duration-150 hover:opacity-100 hover:text-red-500 active:bg-black/10 dark:active:bg-white/10"
      aria-label="ゴミ箱に移動"
      title="ゴミ箱に移動"
    >
      <TrashIcon className="h-3.5 w-3.5" />
    </button>
  );

  const lamp = getEntryLamp(entry);
  const lampDot = (
    <span
      role="img"
      aria-label={ENTRY_LAMP_LABEL[lamp]}
      title={ENTRY_LAMP_LABEL[lamp]}
      className={`status-lamp h-2 w-2 shrink-0 self-center rounded-full ${
        lamp === "fresh"
          ? "bg-amber-500 dark:bg-amber-400"
          : lamp === "unread"
            ? "bg-sky-500 dark:bg-sky-400"
            : "bg-black/20 dark:bg-white/25"
      }`}
    />
  );

  const rowProps = {
    role: "button" as const,
    tabIndex: 0,
    onClick: handleOpen,
    onKeyDown: handleKeyDown,
    ...(isVideo ? { "aria-expanded": expanded } : {}),
  };

  async function handleOpenBrowser(e: React.MouseEvent) {
    e.stopPropagation();
    if (entry.link && HTTP_LINK_RE.test(entry.link)) {
      await openUrl(entry.link);
    }
  }

  const videoDetail = isVideo && expanded && (
    <div
      onClick={(e) => e.stopPropagation()}
      className="mt-1 w-full border-t border-black/5 pt-1.5 dark:border-white/10"
    >
      {!blockImages && thumbUrl && !thumbFailed && (
        <img
          src={thumbUrl}
          alt=""
          onError={() => setThumbFailed(true)}
          className="aspect-video w-full rounded object-cover"
        />
      )}
      <p className="mt-1 text-sm font-medium break-words">{title}</p>
      {meta && <div className="mt-0.5 text-xs">{meta}</div>}
      {entrySnippet(entry, 400) && (
        <p className="allow-text-selection mt-1 text-xs break-words opacity-80">
          {entrySnippet(entry, 400)}
        </p>
      )}
      <div className="mt-1.5 flex gap-1 pb-0.5">
        <button
          type="button"
          onClick={handleOpenBrowser}
          className="rounded bg-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:bg-black/20 active:bg-black/30 dark:bg-white/10 dark:hover:bg-white/20 dark:active:bg-white/30"
        >
          ブラウザで開く
        </button>
        <button
          type="button"
          onClick={() => setExpanded(false)}
          className="rounded px-2 py-1 text-xs opacity-60 transition-colors duration-150 hover:bg-black/5 hover:opacity-100 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
        >
          閉じる
        </button>
      </div>
    </div>
  );

  if (isVideo && mode !== "compact") {
    return (
      <div
        {...rowProps}
        title={expanded ? "クリックで折りたたむ" : "クリックで展開してプレビュー"}
        className="entry-card flex w-full cursor-pointer flex-col gap-1 rounded-lg border border-black/5 bg-black/[0.03] px-2 py-2 shadow-sm transition duration-150 hover:bg-black/[0.06] active:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] dark:active:bg-white/10"
      >
        <div className="flex w-full items-start gap-2">
          {lampDot}
          {blockImages || !thumbUrl || thumbFailed ? (
            <div className="flex aspect-video w-32 shrink-0 items-center justify-center rounded bg-black/5 dark:bg-white/5">
              <ImageOffIcon className="h-6 w-6 opacity-30" />
            </div>
          ) : (
            <img
              src={thumbUrl}
              alt=""
              onError={() => setThumbFailed(true)}
              className="aspect-video w-32 shrink-0 rounded object-cover"
            />
          )}
          <div className="min-w-0 flex-1">
            <p className="text-sm font-medium break-words">{title}</p>
            {meta && <div className="mt-0.5 text-xs">{meta}</div>}
          </div>
          {starButton}
          {deleteButton}
        </div>
        {videoDetail}
      </div>
    );
  }

  if (isVideo && mode === "compact") {
    return (
      <div className="entry-compact flex w-full flex-col rounded border-b border-black/5 px-2 py-1 dark:border-white/5">
        <div {...rowProps} className="flex w-full cursor-pointer items-baseline gap-2">
          {lampDot}
          <MarqueeTitle text={title} className="flex-1" textClassName={entry.is_read ? "" : "font-medium"} />
          {feedTitle && (
            <span className="accent-text max-w-[30%] shrink-0 truncate text-[10px]">{feedTitle}</span>
          )}
          {starButton}
          {deleteButton}
        </div>
        {videoDetail}
      </div>
    );
  }

  if (mode === "compact") {
    return (
      <div
        {...rowProps}
        className="entry-compact flex w-full cursor-pointer items-baseline gap-2 rounded border-b border-black/5 px-2 py-1 text-sm transition duration-150 hover:bg-black/5 active:scale-[0.98] active:bg-black/10 dark:border-white/5 dark:hover:bg-white/5 dark:active:bg-white/10"
      >
        {lampDot}
        <MarqueeTitle text={title} className="flex-1" textClassName={entry.is_read ? "" : "font-medium"} />
        {feedTitle && (
          <span className="accent-text max-w-[30%] shrink-0 truncate text-[10px]">{feedTitle}</span>
        )}
        {starButton}
        {deleteButton}
      </div>
    );
  }

  if (mode === "list") {
    return (
      <div
        {...rowProps}
        className="entry-card flex w-full cursor-pointer items-start gap-2 rounded-lg border border-black/5 bg-black/[0.03] px-2 py-1.5 transition duration-150 hover:bg-black/[0.06] active:scale-[0.98] active:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] dark:active:bg-white/10"
      >
        {lampDot}
        <div className="min-w-0 flex-1">
          <MarqueeTitle text={title} textClassName={`text-sm ${entry.is_read ? "" : "font-medium"}`} />
          {meta && <div className="truncate text-xs">{meta}</div>}
        </div>
        {starButton}
        {deleteButton}
      </div>
    );
  }

  return (
    <div
      {...rowProps}
      ref={rowRef}
      className={`entry-card ${CARD_ROW_HEIGHT[cardSize]} flex w-full cursor-pointer gap-2 overflow-hidden rounded-lg border border-black/5 bg-black/[0.03] px-2 py-2 shadow-sm transition duration-150 hover:bg-black/[0.06] active:scale-[0.98] active:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] dark:active:bg-white/10`}
    >
      {lampDot}
      {blockImages ? (
        <div
          className={`${CARD_THUMB_SIZE[cardSize]} flex shrink-0 items-center justify-center rounded bg-black/5 dark:bg-white/5`}
        >
          <ImageOffIcon className="h-1/2 w-1/2 opacity-40" />
        </div>
      ) : thumbUrl && !thumbFailed ? (
        <img
          src={thumbUrl}
          alt=""
          onError={() => setThumbFailed(true)}
          className={`${CARD_THUMB_SIZE[cardSize]} shrink-0 rounded object-cover`}
        />
      ) : feedIconUrl && !feedIconFailed ? (
          <div
            className={`${CARD_THUMB_SIZE[cardSize]} flex shrink-0 items-center justify-center rounded bg-black/5 p-2 dark:bg-white/5`}
          >
            <img
              src={feedIconUrl}
              alt=""
              onError={() => setFeedIconFailed(true)}
              className="max-h-full max-w-full object-contain"
            />
          </div>
      ) : (
        <div
          className={`${CARD_THUMB_SIZE[cardSize]} flex shrink-0 items-center justify-center rounded bg-black/5 dark:bg-white/5`}
        >
          <ImageOffIcon className="h-1/2 w-1/2 opacity-30" />
        </div>
      )}
      <div className="min-w-0 flex-1 overflow-hidden">
        <MarqueeTitle text={title} textClassName={`${CARD_TITLE_SIZE[cardSize]} ${entry.is_read ? "" : "font-medium"}`} />
        <p className={`mt-0.5 ${CARD_SNIPPET_CLAMP[cardSize]} text-xs opacity-70`}>{entrySnippet(entry)}</p>
        {meta && <div className="mt-0.5 truncate text-xs">{meta}</div>}
      </div>
      {starButton}
      {deleteButton}
    </div>
  );
}
