import { useRef, useState } from "react";
import type { SVGProps } from "react";
import { useEntriesStore } from "../stores/entriesStore";
import { useAppearanceStore } from "../stores/appearanceStore";
import { useUiStore, type Screen } from "../stores/uiStore";
import { useUpdateStore } from "../stores/updateStore";
import { ClearableInput } from "./ClearableInput";
import { ClockIcon, CompassIcon, PaletteIcon, PinIcon, RssIcon, SearchIcon, StarIcon, TrashIcon } from "./icons";

/**
 * `hue` names a role colour rather than a literal colour. Only skins whose
 * source material colour-codes its controls read it (Ordinary: the Augma
 * interface is white discs carrying differently coloured glyphs, never one
 * accent applied uniformly). Every other skin ignores the attribute and
 * keeps drawing the whole cluster in its single accent.
 */
type IconHue = "blue" | "teal" | "green" | "coral" | "pink";

const NAV_ICONS: {
  screen: Exclude<Screen, "timeline" | "reader">;
  label: string;
  shortLabel: string;
  hue: IconHue;
  Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
}[] = [
  { screen: "history", label: "既読履歴を開く", shortLabel: "履歴", hue: "teal", Icon: ClockIcon },
  { screen: "trash", label: "ゴミ箱を開く", shortLabel: "ゴミ箱", hue: "pink", Icon: TrashIcon },
  { screen: "feedManager", label: "フィード管理を開く", shortLabel: "フィード", hue: "green", Icon: RssIcon },
  { screen: "discover", label: "サイトを探す", shortLabel: "探す", hue: "coral", Icon: CompassIcon },
  { screen: "settings", label: "外観設定を開く", shortLabel: "設定", hue: "blue", Icon: PaletteIcon },
];

// Shared so the bookmark/search/refresh toggles (not screen-nav -- see
// below) get the exact same icon-only/icon+label/coloring treatment as
// NAV_ICONS while sitting visually in the same cluster.
function IconButton({
  onClick,
  active,
  label,
  shortLabel,
  showLabel,
  hue,
  opensScreen,
  showBadge,
  Icon,
  className = "",
}: {
  onClick: () => void;
  active: boolean;
  label: string;
  shortLabel: string;
  showLabel: boolean;
  hue?: IconHue;
  /** True for the buttons that open a full screen, as opposed to the ones
   * that toggle a filter in place. Only the former can meaningfully draw a
   * connector to the panel they opened -- see the pointer note in
   * `.skin-cardinality`. */
  opensScreen?: boolean;
  /** Plain notification dot, currently only used for "an update is
   * available" on the settings icon. Deliberately just a dot, not a
   * popup or toast -- the explicit action (checking the details, applying
   * it) always happens inside Settings, this only marks that there's
   * something to see there. */
  showBadge?: boolean;
  Icon: (props: SVGProps<SVGSVGElement>) => React.ReactElement;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-hue={hue}
      data-opens-screen={opensScreen ? "" : undefined}
      // `accent-text` always at full strength, never dimmed with opacity --
      // opacity-based dimming on top of an already only-moderate-contrast
      // hue (blue especially, against a similarly pale-blue panel bg in the
      // "blue" skin) pushed real contrast below comfortable reading levels
      // (user feedback: "sunk" icons, opacity makes it worse for some
      // colors). The active state is distinguished by the soft background
      // fill alone, never by dimming the icon itself.
      // `icon-button` is a styling hook, not a look of its own: skins that
      // draw their controls as discs rather than flat glyphs (Ordinary, whose
      // reference UI is entirely white circular buttons) need to target these
      // without also catching the segmented text groups next to them.
      className={`icon-button accent-text relative flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded transition-colors duration-150 active:bg-black/10 dark:active:bg-white/10 ${
        showLabel ? "flex-col gap-0.5 px-1.5 py-1" : "p-1"
      } ${active ? "accent-bg-soft" : "hover:bg-black/5 dark:hover:bg-white/5"} ${className}`}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4" />
      {showLabel && <span className="text-[9px] leading-none">{shortLabel}</span>}
      {showBadge && (
        <span className="accent-bg absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full" aria-hidden="true" />
      )}
    </button>
  );
}

export function FilterBar() {
  const { starredOnly, setStarredOnly, searchQuery, setSearchQuery, markAllRead, markAllUnread } =
    useEntriesStore();
  const toggleScreen = useUiStore((s) => s.toggleScreen);
  const goHome = useUiStore((s) => s.goHome);
  // Settings/History/FeedManager/Trash are full-screen overlays drawn *over*
  // EntryList only (see App.tsx) -- FilterBar itself sits above all of them
  // and was never disabled while one was open, so "全既読" or the search box
  // kept firing on clicks aimed at whatever overlay was showing (reported as
  // accidental timeline actions while in Settings). Only the timeline-scoped
  // controls below get wrapped in `inert`; the screen-nav icons must stay
  // clickable so overlays can still be switched/closed.
  const activeScreen = useUiStore((s) => s.activeScreen);
  const isTimeline = activeScreen === "timeline";
  const updateAvailable = useUpdateStore((s) => s.status?.kind === "available");
  const positionLocked = useAppearanceStore((s) => s.positionLocked);
  const setPositionLocked = useAppearanceStore((s) => s.setPositionLocked);
  const titleBarVisible = useAppearanceStore((s) => s.titleBarVisible);
  const showIconLabels = useAppearanceStore((s) => s.showIconLabels);
  const searchInputRef = useRef<HTMLInputElement>(null);
  // Search is used rarely enough that giving it a permanent full-width row
  // was disproportionate (user feedback) -- collapsed to an icon that
  // expands an input on demand, same idea as a toolbar search button.
  const [searchOpen, setSearchOpen] = useState(false);

  function toggleSearch() {
    const next = !searchOpen;
    setSearchOpen(next);
    if (next) {
      // Focus needs to wait for the input to actually mount.
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }

  // When the title bar is hidden there'd otherwise be no way to drag the
  // window at all -- let this bar's own (mostly-empty, since it wraps)
  // background act as a fallback drag handle too. Skipped when the title
  // bar is showing so we don't have two overlapping drag regions doing the
  // same thing for no reason, and always skipped when locked.
  const dragRegion = !positionLocked && !titleBarVisible ? true : undefined;

  return (
    <div
      data-tauri-drag-region={dragRegion}
      className="app-filterbar flex shrink-0 flex-wrap items-center gap-1 border-b border-black/10 px-2 py-1 text-xs dark:border-white/10"
    >
      {/* Always-visible "this is a dev build" marker. The title bar (where
          the same 開発版 pill also appears) is opt-in and hidden by default,
          so without this the OS window title would be the only other cue --
          easy to miss. The FilterBar is permanent chrome, so a tiny pill
          here guarantees a dev build can't be mistaken for a release one. */}
      {import.meta.env.DEV && (
        <span
          className="shrink-0 rounded bg-accent-bg-soft px-1.5 py-0.5 text-[10px] font-semibold leading-none text-accent-text"
          title="開発ビルドです"
        >
          開発版
        </span>
      )}
      {/* "位置を固定" stands alone at the far left, separated by a divider
          from everything else -- it used to sit in the same run as the
          other icons and was easy to hit by accident while reaching for a
          neighbor (user feedback). Not timeline-scoped (a window-behavior
          setting, meaningful no matter which screen is open), so it's
          always active, never inert-gated. */}
      <IconButton
        onClick={() => setPositionLocked(!positionLocked)}
        active={positionLocked}
        label={positionLocked ? "位置の固定を解除" : "位置を固定"}
        shortLabel="位置固定"
        showLabel={showIconLabels}
        hue="teal"
        Icon={PinIcon}
      />
      <div className="mx-0.5 h-4 w-px shrink-0 bg-black/10 dark:bg-white/10" />

      {/* `contents` keeps this group invisible to the flex-wrap layout above
          (identical visual result to not wrapping at all) while still
          letting `inert` disable the whole group as one unit. */}
      <div className="contents" inert={!isTimeline}>
      {/* すべて既読/すべて未読 boxed together as their own segmented group
          (same look as the view-mode tabs elsewhere) rather than sitting as
          two plain buttons loose in the row -- a bulk, hard-to-undo action
          needs to read as visually distinct from routine icon clicks (user
          feedback). `ml-auto` on the icon cluster after it opens a real gap
          between the two groups. */}
      <div className="segmented flex gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
        <button
          type="button"
          onClick={() => markAllRead()}
          className="min-h-7 rounded px-1.5 py-1 opacity-60 transition-colors duration-150 hover:opacity-100 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
        >
          すべて既読
        </button>
        <button
          type="button"
          onClick={() => markAllUnread()}
          className="min-h-7 rounded px-1.5 py-1 opacity-60 transition-colors duration-150 hover:opacity-100 hover:bg-black/5 active:bg-black/10 dark:hover:bg-white/5 dark:active:bg-white/10"
        >
          すべて未読
        </button>
      </div>
      </div>

      {/* Deliberately NOT inside the timeline-only inert group above: the
          bookmark toggle is also the one-tap jump from "探す" back to the
          bookmark view (discover-saved articles live there now), so it stays
          active on the discover screen. From there -- or any other screen --
          clicking it opens the timeline and flips the filter in one gesture. */}
      <div className="contents" inert={!isTimeline && activeScreen !== "discover"}>
      <IconButton
        onClick={() => {
          if (!isTimeline) {
            goHome();
          }
          setStarredOnly(!starredOnly);
        }}
        active={starredOnly}
        className="ml-auto"
        label={starredOnly ? "ブックマークの絞り込みを解除" : "ブックマークのみ表示"}
        shortLabel="ブクマ"
        showLabel={showIconLabels}
        hue="coral"
        Icon={(props) => <StarIcon filled={starredOnly} {...props} />}
      />
      </div>

      <div className="contents" inert={!isTimeline}>
      <IconButton
        onClick={toggleSearch}
        active={searchOpen || searchQuery.length > 0}
        label={searchOpen ? "検索欄を閉じる" : "記事を検索"}
        shortLabel="検索"
        showLabel={showIconLabels}
        hue="blue"
        Icon={SearchIcon}
      />
      </div>

      {/* Reusing the same accent treatment across this whole cluster (not a
          new pattern per icon) -- without it, all icons looked identical
          whether their screen was open or not, so there was no way to tell
          which panel you were in, or that re-clicking the same icon is what
          closes it (reported: this was driving accidental clicks on
          neighboring icons). Order is history → trash → feedManager →
          settings: trash sits next to history since both are "past reading
          activity" views, rather than leading the group as an odd first icon. */}
      {NAV_ICONS.map(({ screen, label, shortLabel, hue, Icon }) => (
        <IconButton
          key={screen}
          // The bookmark filter is a timeline-local view state, not a global
          // mode -- navigating to any other screen clears it (and the
          // timeline returns unfiltered when coming back). Otherwise the
          // starredOnly flag leaked across screens: opening 探す after
          // pressing the bookmark button kept the filter "expanded", and the
          // ブクマ button looked active on screens where the filter isn't
          // even visible.
          onClick={() => {
            setStarredOnly(false);
            toggleScreen(screen);
          }}
          active={activeScreen === screen}
          label={label}
          shortLabel={shortLabel}
          showLabel={showIconLabels}
          hue={hue}
          opensScreen
          showBadge={screen === "settings" && updateAvailable}
          Icon={Icon}
        />
      ))}

      {/* Own `contents`+`inert` wrapper (same reasoning as above) rather
          than living inside the first one, so this can render *after*
          NAV_ICONS in DOM/flex order -- the expanding search field then
          drops below the whole icon row (as a `w-full` line) instead of
          splitting the icon cluster in two while it's open. Always
          mounted (not `{searchOpen && ...}`) and animated via max-height
          instead, so opening/closing it smoothly slides rather than
          snapping instantly -- matching the slide/fade language used
          everywhere else in this app (user feedback: this abrupt show/hide
          stood out as the one interaction that didn't animate). `inert`
          while collapsed keeps a zero-height input from still being
          Tab-focusable. */}
      <div className="contents" inert={!isTimeline}>
      <div
        className={`w-full overflow-hidden transition-all duration-200 ease-out ${
          searchOpen ? "mt-1 max-h-10 opacity-100" : "max-h-0 opacity-0"
        }`}
        inert={!searchOpen}
      >
        <div className="relative">
          <ClearableInput
            inputRef={searchInputRef}
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="記事を検索"
            clearLabel="検索をクリア"
            onClear={() => setSearchQuery("")}
            className="w-full rounded border border-black/10 bg-black/5 py-1 pl-2 pr-6 text-xs outline-none dark:border-white/10 dark:bg-white/5"
          />
        </div>
      </div>
      </div>
    </div>
  );
}
