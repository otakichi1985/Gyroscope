import { useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { useEntriesStore, type ViewMode } from "../stores/entriesStore";
import { entrySnippet, formatPublished } from "../lib/text";
import type { CardSize } from "../stores/appearanceStore";
import type { Entry } from "../lib/types";
import { StarIcon } from "./icons";

const HTTP_LINK_RE = /^https?:\/\//i;

// Card mode only, per the request that prompted this ("カードのサイズ") --
// list/compact stay at their existing fixed sizing.
const CARD_THUMB_SIZE: Record<CardSize, string> = {
  small: "h-12 w-12",
  medium: "h-16 w-16",
  large: "h-24 w-24",
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
}

export function EntryRow({ entry, mode, feedTitle, feedIconUrl, cardSize }: EntryRowProps) {
  const markRead = useEntriesStore((s) => s.markRead);
  const toggleStar = useEntriesStore((s) => s.toggleStar);
  // Covers both "no thumbnail_url at all" and "had one but it failed to
  // load" (broken link, hotlink protection, etc.) -- both count as "can't
  // show an image for this article" per the request that prompted the
  // feed-icon fallback below.
  const [thumbFailed, setThumbFailed] = useState(false);

  async function handleOpen() {
    if (!entry.is_read) markRead(entry.id, true);
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

  function handleToggleRead(e: React.MouseEvent) {
    e.stopPropagation();
    markRead(entry.id, !entry.is_read);
  }

  const title = entry.title ?? entry.link ?? "(無題)";
  const published = formatPublished(entry.published_at);
  // feedTitle gets its own accent-colored, undimmed span (rather than
  // folding it into one plain opacity-60 "meta" string) so the source
  // stands out from the date next to it, per the request to emphasize
  // where each article came from.
  const meta = (feedTitle || published) && (
    <>
      {feedTitle && <span className="accent-text">{feedTitle}</span>}
      {feedTitle && published && <span className="opacity-60"> · </span>}
      {published && <span className="opacity-60">{published}</span>}
    </>
  );

  const starButton = (
    <button
      type="button"
      onClick={handleToggleStar}
      className={`flex shrink-0 items-center rounded p-0.5 transition-colors duration-150 active:bg-black/10 dark:active:bg-white/10 ${
        entry.is_starred ? "accent-text" : "opacity-60 hover:opacity-100"
      }`}
      aria-label={entry.is_starred ? "スターを外す" : "スターを付ける"}
    >
      <StarIcon filled={entry.is_starred} className="h-3.5 w-3.5" />
    </button>
  );

  // Read state is shown as an explicit checkmark rather than dimming the
  // whole row (dimming made read rows hard to read at a glance).
  const readCheck = (
    <button
      type="button"
      onClick={handleToggleRead}
      className={`shrink-0 rounded px-1 text-xs transition-colors duration-150 active:bg-black/10 dark:active:bg-white/10 ${
        entry.is_read ? "text-emerald-600 dark:text-emerald-400" : "opacity-30 hover:opacity-70"
      }`}
      aria-label={entry.is_read ? "未読にする" : "既読にする"}
      title={entry.is_read ? "既読" : "未読"}
    >
      ✓
    </button>
  );

  // A single outer <button> would nest the star <button> inside it, which is
  // invalid HTML (interactive content inside interactive content) and makes
  // click targeting unreliable — use a div with button semantics instead.
  const rowProps = {
    role: "button" as const,
    tabIndex: 0,
    onClick: handleOpen,
    onKeyDown: handleKeyDown,
  };

  if (mode === "compact") {
    return (
      <div
        {...rowProps}
        className="flex w-full cursor-pointer items-baseline gap-2 rounded px-2 py-1 text-sm transition-colors duration-150 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
      >
        <span className={`min-w-0 flex-1 truncate ${entry.is_read ? "" : "font-medium"}`}>{title}</span>
        {feedTitle && (
          <span className="accent-text max-w-[30%] shrink-0 truncate text-[10px]">{feedTitle}</span>
        )}
        {readCheck}
        {starButton}
      </div>
    );
  }

  if (mode === "list") {
    return (
      <div
        {...rowProps}
        className="flex w-full cursor-pointer items-start gap-2 rounded px-2 py-1.5 transition-colors duration-150 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
      >
        <div className="min-w-0 flex-1">
          <div className={`truncate text-sm ${entry.is_read ? "" : "font-medium"}`}>{title}</div>
          {meta && <div className="truncate text-xs">{meta}</div>}
        </div>
        {readCheck}
        {starButton}
      </div>
    );
  }

  // card
  return (
    <div
      {...rowProps}
      className="flex w-full cursor-pointer gap-2 rounded px-2 py-2 transition-colors duration-150 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
    >
      {entry.thumbnail_url && !thumbFailed ? (
        <img
          src={entry.thumbnail_url}
          alt=""
          onError={() => setThumbFailed(true)}
          className={`${CARD_THUMB_SIZE[cardSize]} shrink-0 rounded object-cover`}
        />
      ) : (
        feedIconUrl && (
          // A favicon-ish image is small/square and looks stretched and
          // blurry filling the same box object-cover does for a real
          // thumbnail -- contain it with padding on a neutral fill instead,
          // so it reads as a deliberate icon badge rather than a bad photo.
          <div
            className={`${CARD_THUMB_SIZE[cardSize]} flex shrink-0 items-center justify-center rounded bg-black/5 p-2 dark:bg-white/5`}
          >
            <img src={feedIconUrl} alt="" className="max-h-full max-w-full object-contain" />
          </div>
        )
      )}
      <div className="min-w-0 flex-1">
        <div className={`truncate ${CARD_TITLE_SIZE[cardSize]} ${entry.is_read ? "" : "font-medium"}`}>{title}</div>
        <p className={`mt-0.5 ${CARD_SNIPPET_CLAMP[cardSize]} text-xs opacity-70`}>{entrySnippet(entry)}</p>
        {meta && <div className="mt-0.5 truncate text-xs">{meta}</div>}
      </div>
      {readCheck}
      {starButton}
    </div>
  );
}
