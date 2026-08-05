import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { EntryList } from "./components/EntryList";
import { FeedManagerOverlay } from "./components/FeedManagerOverlay";
import { FilterBar } from "./components/FilterBar";
import { HistoryOverlay } from "./components/HistoryOverlay";
import { ReaderOverlay } from "./components/ReaderOverlay";
import { SettingsOverlay } from "./components/SettingsOverlay";
import { TitleBar } from "./components/TitleBar";
import { TimelineToolbar } from "./components/TimelineToolbar";
import { TrashOverlay } from "./components/TrashOverlay";
import { useFeedsUpdatedListener } from "./hooks/useFeedsUpdatedListener";
import { useIdleTimer } from "./hooks/useIdleTimer";
import { useSyncAlwaysOnTop } from "./hooks/useSyncAlwaysOnTop";
import { useSyncMinimizeToTray } from "./hooks/useSyncMinimizeToTray";
import { useSyncWindowOpacity } from "./hooks/useSyncWindowOpacity";
import { useVibrancyMode } from "./hooks/useVibrancyMode";
import { getSkin } from "./lib/skins";
import { useAppearanceStore } from "./stores/appearanceStore";
import { useUiStore } from "./stores/uiStore";

// One of these gets picked at random each time idle starts (see the effect
// below) -- a moving/drifting glow (an earlier version) read as too busy;
// anchored to one corner, large and pulsing in place, is calmer (user
// feedback: "not moving around, glowing bigger at an edge, heartbeat-like").
const IDLE_PATTERNS = ["idle-corner-tl", "idle-corner-tr", "idle-corner-bl", "idle-corner-br"];

function App() {
  const vibrancy = useVibrancyMode();
  const { opacity, skinId, fontId, alwaysOnTop, titleBarVisible, minimizeToTray, themeMode } =
    useAppearanceStore();
  const isTimeline = useUiStore((s) => s.activeScreen === "timeline");
  useFeedsUpdatedListener();
  const isIdle = useIdleTimer();

  const [idlePattern, setIdlePattern] = useState(IDLE_PATTERNS[0]);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const isDark = themeMode === "dark" || (themeMode === "system" && systemDark);

  useLayoutEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const syncSystemTheme = () => setSystemDark(media.matches);
    syncSystemTheme();
    if (themeMode !== "system") return;
    media.addEventListener("change", syncSystemTheme);
    return () => media.removeEventListener("change", syncSystemTheme);
  }, [themeMode]);

  useLayoutEffect(() => {
    document.documentElement.classList.remove("dark");
    document.documentElement.style.colorScheme = isDark ? "dark" : "light";
  }, [isDark]);
  useEffect(() => {
    if (isIdle) {
      setIdlePattern(IDLE_PATTERNS[Math.floor(Math.random() * IDLE_PATTERNS.length)]);
    }
  }, [isIdle]);

  // Cursor-following spotlight (user feedback) -- written straight to the
  // DOM via a ref rather than React state, since mousemove fires far too
  // often to re-render on. `active` (shown/hidden) is the only piece that
  // needs to be actual React state, since it changes rarely (enter/leave)
  // rather than continuously.
  const spotlightRef = useRef<HTMLDivElement>(null);
  const [spotlightActive, setSpotlightActive] = useState(false);
  function handleSpotlightMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    spotlightRef.current?.style.setProperty("--spot-x", `${e.clientX - rect.left}px`);
    spotlightRef.current?.style.setProperty("--spot-y", `${e.clientY - rect.top}px`);
  }

  const skin = getSkin(skinId);
  // No vibrancy backdrop means nothing but the raw desktop sits behind this
  // window -- forcing full opacity here keeps that case looking solid
  // instead of a very plain flat-colored window with no blur to soften it.
  const alpha = vibrancy === "none" ? 1 : opacity;
  useSyncWindowOpacity(alpha);
  useSyncAlwaysOnTop(alwaysOnTop);
  useSyncMinimizeToTray(minimizeToTray);

  const panelStyle = {
    "--panel-rgb-light": skin.light,
    "--panel-rgb-dark": skin.dark,
    "--accent-rgb-light": skin.accentLight,
    "--accent-rgb-dark": skin.accentDark,
    ...(fontId ? { fontFamily: `"${fontId}", sans-serif` } : {}),
  } as React.CSSProperties;

  return (
    <div
      style={panelStyle}
      className={`${isDark ? "dark" : ""} panel-bg flex h-screen w-screen flex-col overflow-hidden rounded-2xl text-neutral-900 dark:text-neutral-100`}
    >
      {titleBarVisible && <TitleBar />}
      <FilterBar />
      <div className="relative min-h-0 flex-1">
        {/* `absolute inset-0` (not `h-full`) matches how the overlay
            siblings below are sized, and gives EntryList's own `h-full` a
            definite-height ancestor to resolve against. Inert while any
            overlay is open -- overlays only visually cover this area, they
            never disabled it, so Tab-focus (and, before FilterBar's own fix,
            stray clicks) could still reach hidden rows underneath. */}
        <div className="absolute inset-0 flex flex-col" inert={!isTimeline}>
          <TimelineToolbar />
          {/* `idle-mode` cascades down to every `.entry-card` (EntryRow.tsx)
              for the idle sway -- see index.css. `onMouseMove` here (not on
              a separate overlay) is what lets the spotlight track the
              cursor without ever sitting on top of the rows and blocking
              their own hover/click handling: this container has normal
              pointer-events, the rows stay directly interactive, and
              mousemove simply bubbles up through them to this handler. */}
          <div
            className={`relative min-h-0 flex-1 ${isIdle ? "idle-mode" : ""}`}
            onMouseMove={handleSpotlightMove}
            onMouseEnter={() => setSpotlightActive(true)}
            onMouseLeave={() => setSpotlightActive(false)}
          >
            <EntryList />
            <div ref={spotlightRef} className={`mouse-spotlight ${spotlightActive ? "spotlight-active" : ""}`} aria-hidden="true" />
            {/* Ambient idle background -- the timeline looked a little
                lifeless left untouched for a while (user feedback). Always
                mounted, just faded to opacity-0 until useIdleTimer flips
                true, and pointer-events-none so it can never intercept a
                click/hover meant for the rows underneath. */}
            <div className={`idle-bg ${idlePattern} ${isIdle ? "idle-bg-active" : ""}`} aria-hidden="true" />
          </div>
        </div>
        {/* Always mounted (not conditionally rendered): each overlay reads
            uiStore's activeScreen itself and animates in/out via CSS, which
            is what makes screen switches slide/fade instead of instantly
            replacing each other, and guarantees only one screen is ever
            interactive at a time -- see each overlay's own isActive logic. */}
        <FeedManagerOverlay />
        <HistoryOverlay />
        <TrashOverlay />
        <ReaderOverlay />
        <SettingsOverlay />
      </div>
    </div>
  );
}

export default App;
