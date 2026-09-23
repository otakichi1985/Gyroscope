import { useRef, useState } from "react";
import type { SVGProps } from "react";
import { useEntriesStore } from "../stores/entriesStore";
import { useAppearanceStore } from "../stores/appearanceStore";
import { useUiStore, type Screen } from "../stores/uiStore";
import { useUpdateStore } from "../stores/updateStore";
import { ClearableInput } from "./ClearableInput";
import { ClockIcon, CompassIcon, PinIcon, RssIcon, SearchIcon, SettingsIcon, StarIcon, TrashIcon } from "./icons";

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
  { screen: "settings", label: "設定を開く", shortLabel: "設定", hue: "blue", Icon: SettingsIcon },
];

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

  opensScreen?: boolean;

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
      className={`icon-button accent-text relative flex min-h-7 min-w-7 shrink-0 items-center justify-center rounded transition-colors duration-150 active:bg-black/10 dark:active:bg-white/10 ${
        showLabel ? "flex-col gap-0.5 px-1.5 py-1" : "p-1"
      } ${active ? "accent-bg-soft" : "hover:bg-black/5 dark:hover:bg-white/5"} ${className}`}
      aria-label={label}
      aria-pressed={active}
    >
      <Icon className="h-4 w-4" />
      {showLabel && <span className="text-[9px] leading-none">{shortLabel}</span>}

      {showBadge && (
        <span className="absolute top-0.5 right-0.5 h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400" aria-hidden="true" />
      )}
    </button>
  );
}

export function FilterBar() {
  const { starredOnly, setStarredOnly, searchQuery, setSearchQuery, markAllRead, markAllUnread } =
    useEntriesStore();
  const toggleScreen = useUiStore((s) => s.toggleScreen);
  const goHome = useUiStore((s) => s.goHome);
  const activeScreen = useUiStore((s) => s.activeScreen);
  const isTimeline = activeScreen === "timeline";
  const updateAvailable = useUpdateStore((s) => s.status?.kind === "available");
  const positionLocked = useAppearanceStore((s) => s.positionLocked);
  const setPositionLocked = useAppearanceStore((s) => s.setPositionLocked);
  const titleBarVisible = useAppearanceStore((s) => s.titleBarVisible);
  const showIconLabels = useAppearanceStore((s) => s.showIconLabels);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [searchOpen, setSearchOpen] = useState(false);

  function toggleSearch() {
    const next = !searchOpen;
    setSearchOpen(next);
    if (next) {
      requestAnimationFrame(() => searchInputRef.current?.focus());
    }
  }

  const dragRegion = !positionLocked && !titleBarVisible ? true : undefined;

  return (
    <div
      data-tauri-drag-region={dragRegion}
      className="app-filterbar flex shrink-0 flex-wrap items-center gap-1 border-b border-black/10 px-2 py-1 text-xs dark:border-white/10"
    >

      {import.meta.env.DEV && (
        <span
          className="dev-pill shrink-0 rounded accent-bg-soft accent-text px-1.5 py-0.5 text-[10px] font-semibold leading-none"
          title="開発ビルドです"
        >
          開発版
        </span>
      )}

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


      <div className="contents" inert={!isTimeline}>

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


      {NAV_ICONS.map(({ screen, label, shortLabel, hue, Icon }) => (
        <IconButton
          key={screen}
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
