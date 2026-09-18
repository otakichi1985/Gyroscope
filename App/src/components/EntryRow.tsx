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

// Card mode only, per the request that prompted this ("カードのサイズ") --
// list/compact stay at their existing fixed sizing.
const CARD_THUMB_SIZE: Record<CardSize, string> = {
  small: "h-12 w-12",
  medium: "h-16 w-16",
  large: "h-24 w-24",
};
// Fixed outer heights keep the virtualizer's measurements stable when a
// thumbnail or feed icon becomes available after the entry first renders.
// Each value still leaves enough room for that size's clamped text + meta.
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
  // Only true in the bookmark-filtered view (see EntryList.tsx) -- deleting
  // is scoped to "curating my bookmarks", not a general per-entry action, so
  // the button doesn't show up in the regular timeline.
  showDelete: boolean;
  /** Which timeline pane this row belongs to (dual-pane mode). */
  useStore?: EntriesStoreHook;
}

export function EntryRow({ entry, mode, feedTitle, feedIconUrl, cardSize, showDelete, useStore = useEntriesStore }: EntryRowProps) {
  const markRead = useStore((s) => s.markRead);
  const toggleStar = useStore((s) => s.toggleStar);
  const deleteEntry = useStore((s) => s.deleteEntry);
  const blockImages = useAppearanceStore((s) => s.blockImages);
  const clickBehavior = useAppearanceStore((s) => s.clickBehavior);
  // Covers both "no thumbnail_url at all" and "had one but it failed to
  // load" (broken link, hotlink protection, etc.) -- both count as "can't
  // show an image for this article" per the request that prompted the
  // feed-icon fallback below.
  const [thumbFailed, setThumbFailed] = useState(false);
  const [feedIconFailed, setFeedIconFailed] = useState(false);
  // Video entries (YouTube) expand inline instead of opening the reader --
  // most videos are watched in the browser, so the card itself only previews.
  const [expanded, setExpanded] = useState(false);
  const isVideo = isVideoEntry(entry);

  // Lazily fetch a real thumbnail (og:image etc.) for entries whose feed
  // provided none -- previously those rows dropped to the favicon / image-off
  // placeholder. Only in card mode (the only mode that renders a thumbnail),
  // only when there's no feed-provided image, and only when the row is
  // actually visible: rows are virtualised with overscan, so without an
  // IntersectionObserver gate we'd fetch for a bunch of off-screen rows.
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
    // Fall back to fetching immediately when IntersectionObserver is
    // unavailable (defensive; WebView2 has it).
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

  // The thumbnail actually shown: the feed-provided one if present, otherwise
  // the lazily-fetched og:image.
  const thumbUrl = entry.thumbnail_url || fetchedThumb;

  // A refresh can replace either URL without remounting this keyed row.
  // Let the new resource try instead of keeping an old failure forever.
  useEffect(() => setThumbFailed(false), [entry.thumbnail_url]);
  useEffect(() => setFeedIconFailed(false), [feedIconUrl]);

  async function handleOpen() {
    // Saved-article bookmarks (negative ids) have no reader read-state, so
    // skip markRead for them -- but otherwise they behave exactly like normal
    // entries now: the default "reader" click behavior opens them in the
    // in-app reader (whose full-text auto-fetch replaces their short snippet),
    // and the "browser" click behavior is the option that opens the default
    // browser instead.
    if (!entry.is_read && entry.id >= 0) markRead(entry.id, true);
    // Video entries never enter the reader: the click only expands the inline
    // preview (bigger thumbnail, full title, description, open-in-browser).
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

  function handleToggleRead(e: React.MouseEvent) {
    e.stopPropagation();
    markRead(entry.id, !entry.is_read);
  }

  function handleDelete(e: React.MouseEvent) {
    e.stopPropagation();
    deleteEntry(entry.id);
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
      {published && <span className="opacity-60 tabular-nums">{published}</span>}
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

  // Read-state lamp: fresh (unread, <24h) / unread / read at a glance,
  // without opening the row (user request). Fixed hues (not skin accent)
  // so the three states stay distinguishable in every skin and theme.
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

  // A single outer <button> would nest the star <button> inside it, which is
  // invalid HTML (interactive content inside interactive content) and makes
  // click targeting unreliable — use a div with button semantics instead.
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

  // Inline preview for video entries: bigger thumbnail, full (wrapped) title,
  // channel + date, description, and the open-in-browser button. Rendered
  // inside the clicked row for every view mode; clicks inside never toggle.
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

  // Video entries in card/list mode: a roomier collapsed row (16:9 preview,
  // fully wrapped title, channel + date) instead of the fixed-height article
  // card. The click expands the inline preview below, never the reader.
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
          {readCheck}
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
          {readCheck}
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
        // Compact mode stays deliberately light on chrome (that's the
        // whole point of this density level) -- a hairline bottom border is
        // enough separation without turning it into a full card like the
        // other two modes below (user feedback: entries were hard to tell
        // apart; a full glass-card treatment here would fight the "as many
        // rows as possible" intent).
        //
        // `entry-compact` exists for the floating skins only. Those have no
        // panel behind the list at all, so "a hairline border is enough"
        // stops being true: the rows were left as bare text hanging over the
        // desktop (user report). They get a surface back in index.css --
        // deliberately not `entry-card`, which would also hand every other
        // skin's card treatment to a density mode that does not want it.
        className="entry-compact flex w-full cursor-pointer items-baseline gap-2 rounded border-b border-black/5 px-2 py-1 text-sm transition duration-150 hover:bg-black/5 active:scale-[0.98] active:bg-black/10 dark:border-white/5 dark:hover:bg-white/5 dark:active:bg-white/10"
      >
        {lampDot}
        <MarqueeTitle text={title} className="flex-1" textClassName={entry.is_read ? "" : "font-medium"} />
        {feedTitle && (
          <span className="accent-text max-w-[30%] shrink-0 truncate text-[10px]">{feedTitle}</span>
        )}
        {readCheck}
        {starButton}
        {deleteButton}
      </div>
    );
  }

  if (mode === "list") {
    return (
      <div
        {...rowProps}
        // Translucent-tinted background + border + blur (rather than just a
        // hover-only highlight) so each entry reads as its own frosted-glass
        // card at rest, not just plain text that happens to sit in a row
        // (user feedback: entries were hard to tell apart; also part of a
        // broader push for this app's inner chrome to echo its own
        // Mica/Acrylic-glass window backdrop instead of looking like flat
        // rectangles floating on top of it).
        // Deliberately NO `backdrop-blur` here, despite the frosted-glass
        // look: what sits behind a card is `.panel-bg`, a fully opaque
        // solid colour (see index.css). Blurring a uniform colour returns
        // that same colour, so the filter was a guaranteed visual no-op --
        // while still forcing a render surface per row on a virtualised
        // list, and making descendants (MarqueeTitle's animated track)
        // liable to repaint on the main thread every frame. The glass
        // reading comes from the translucent tint + hairline border, which
        // are doing all the actual work. Only the portalled popups
        // (FeedPicker/FontPicker) keep a backdrop-blur, because those
        // genuinely sit over non-uniform content.
        //
        // `entry-card`: marker for the idle-sway animation (index.css,
        // toggled by App.tsx's `.idle-mode` ancestor). This element owns the
        // only `transition` shorthand that applies to it -- index.css
        // deliberately does not declare one, see the note there.
        // `active:scale-[0.98]` is the click/press feedback (user feedback:
        // wanted motion on interaction, not just a flat color change), which
        // needs a transition covering `transform`; plain `transition` does
        // (unlike `transition-colors`) without `transition-all`'s blanket
        // "animate literally every property".
        className="entry-card flex w-full cursor-pointer items-start gap-2 rounded-lg border border-black/5 bg-black/[0.03] px-2 py-1.5 transition duration-150 hover:bg-black/[0.06] active:scale-[0.98] active:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] dark:active:bg-white/10"
      >
        {lampDot}
        <div className="min-w-0 flex-1">
          <MarqueeTitle text={title} textClassName={`text-sm ${entry.is_read ? "" : "font-medium"}`} />
          {meta && <div className="truncate text-xs">{meta}</div>}
        </div>
        {readCheck}
        {starButton}
        {deleteButton}
      </div>
    );
  }

  // card
  return (
    <div
      {...rowProps}
      ref={rowRef}
      // Same glass-card language as list mode, just with room for the
      // thumbnail and a soft shadow since card mode is the most spacious view.
      // See list mode above for `entry-card`/`transition`/`active:scale`.
      className={`entry-card ${CARD_ROW_HEIGHT[cardSize]} flex w-full cursor-pointer gap-2 overflow-hidden rounded-lg border border-black/5 bg-black/[0.03] px-2 py-2 shadow-sm transition duration-150 hover:bg-black/[0.06] active:scale-[0.98] active:bg-black/10 dark:border-white/10 dark:bg-white/[0.03] dark:hover:bg-white/[0.07] dark:active:bg-white/10`}
    >
      {lampDot}
      {blockImages ? (
        // Block at the element level, not just visually -- an <img> that's
        // merely hidden with CSS still fires the network request (the exact
        // tracking-pixel behavior this setting exists to prevent), so no
        // <img> tag is rendered at all here.
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
          // A favicon-ish image is small/square and looks stretched and
          // blurry filling the same box object-cover does for a real
          // thumbnail -- contain it with padding on a neutral fill instead,
          // so it reads as a deliberate icon badge rather than a bad photo.
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
      {readCheck}
      {starButton}
      {deleteButton}
    </div>
  );
}
