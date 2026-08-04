import { openUrl } from "@tauri-apps/plugin-opener";
import { useEntriesStore, type ViewMode } from "../stores/entriesStore";
import { entrySnippet, formatPublished } from "../lib/text";
import type { CardSize } from "../stores/appearanceStore";
import type { Entry } from "../lib/types";

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
  cardSize: CardSize;
}

export function EntryRow({ entry, mode, feedTitle, cardSize }: EntryRowProps) {
  const markRead = useEntriesStore((s) => s.markRead);
  const toggleStar = useEntriesStore((s) => s.toggleStar);

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
  const meta = [feedTitle, formatPublished(entry.published_at)].filter(Boolean).join(" · ");

  const starButton = (
    <button
      type="button"
      onClick={handleToggleStar}
      className="shrink-0 rounded px-1 text-xs opacity-60 hover:opacity-100"
      aria-label={entry.is_starred ? "スターを外す" : "スターを付ける"}
    >
      {entry.is_starred ? "★" : "☆"}
    </button>
  );

  // Read state is shown as an explicit checkmark rather than dimming the
  // whole row (dimming made read rows hard to read at a glance).
  const readCheck = (
    <button
      type="button"
      onClick={handleToggleRead}
      className={`shrink-0 rounded px-1 text-xs ${
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
        className="flex w-full cursor-pointer items-center gap-2 rounded px-2 py-1 text-sm hover:bg-black/5 dark:hover:bg-white/5"
      >
        <span className={`min-w-0 flex-1 truncate ${entry.is_read ? "" : "font-medium"}`}>{title}</span>
        {readCheck}
        {starButton}
      </div>
    );
  }

  if (mode === "list") {
    return (
      <div
        {...rowProps}
        className="flex w-full cursor-pointer items-start gap-2 rounded px-2 py-1.5 hover:bg-black/5 dark:hover:bg-white/5"
      >
        <div className="min-w-0 flex-1">
          <div className={`truncate text-sm ${entry.is_read ? "" : "font-medium"}`}>{title}</div>
          {meta && <div className="truncate text-xs opacity-60">{meta}</div>}
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
      className="flex w-full cursor-pointer gap-2 rounded px-2 py-2 hover:bg-black/5 dark:hover:bg-white/5"
    >
      {entry.thumbnail_url && (
        <img
          src={entry.thumbnail_url}
          alt=""
          className={`${CARD_THUMB_SIZE[cardSize]} shrink-0 rounded object-cover`}
        />
      )}
      <div className="min-w-0 flex-1">
        <div className={`truncate ${CARD_TITLE_SIZE[cardSize]} ${entry.is_read ? "" : "font-medium"}`}>{title}</div>
        <p className={`mt-0.5 ${CARD_SNIPPET_CLAMP[cardSize]} text-xs opacity-70`}>{entrySnippet(entry)}</p>
        {meta && <div className="mt-0.5 truncate text-xs opacity-60">{meta}</div>}
      </div>
      {readCheck}
      {starButton}
    </div>
  );
}
