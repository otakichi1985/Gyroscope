import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { DiscoverOverlay } from "./components/DiscoverOverlay";
import { EntryList } from "./components/EntryList";
import { FeedManagerOverlay } from "./components/FeedManagerOverlay";
import { FilterBar } from "./components/FilterBar";
import { HistoryOverlay } from "./components/HistoryOverlay";
import { PaneBar } from "./components/PaneBar";
import { ReaderOverlay } from "./components/ReaderOverlay";
import { ResizeCornerGuides } from "./components/ResizeCornerGuides";
import { ScrollToTopButton } from "./components/ScrollToTopButton";
import { SettingsOverlay } from "./components/SettingsOverlay";
import { TitleBar } from "./components/TitleBar";
import { TimelineToolbar } from "./components/TimelineToolbar";
import { TrashOverlay } from "./components/TrashOverlay";
import { UpdateNoticePopup } from "./components/UpdateNoticePopup";
import { DevPointer } from "./dev-tools/DevPointer";
import { useAutoCheckForUpdate } from "./hooks/useAutoCheckForUpdate";
import { useFeedsUpdatedListener } from "./hooks/useFeedsUpdatedListener";
import { useIdleTimer } from "./hooks/useIdleTimer";
import { usePageScrollKeys } from "./hooks/usePageScrollKeys";
import { useSyncAlwaysOnTop } from "./hooks/useSyncAlwaysOnTop";
import { useSyncFloatingMode } from "./hooks/useSyncFloatingMode";
import { useSyncMinimizeToTray } from "./hooks/useSyncMinimizeToTray";
import { useSyncWindowOpacity } from "./hooks/useSyncWindowOpacity";
import { useVibrancyMode } from "./hooks/useVibrancyMode";
import { getSkin } from "./lib/skins";
import { fetchFontFaceNames } from "./lib/systemFonts";
import type { FontFaceNameMap } from "./lib/systemFonts";
import { useAppearanceStore } from "./stores/appearanceStore";
import { useFeedsStore } from "./stores/feedsStore";
import { getSecondaryEntriesStore, usePanesStore } from "./stores/panesStore";
import { useUiStore } from "./stores/uiStore";

const IDLE_PATTERNS = ["idle-corner-tl", "idle-corner-tr", "idle-corner-bl", "idle-corner-br"];

const LATIN_UNICODE_RANGE =
  "U+0000-024F, U+1E00-1EFF, U+2000-206F, U+20A0-20CF, U+2100-214F";
const JAPANESE_UNICODE_RANGE =
  "U+2E80-2FDF, U+3000-30FF, U+31F0-31FF, U+3400-4DBF, U+4E00-9FFF, U+F900-FAFF, U+FF00-FFEF";
const TERMINAL_LATIN_FONTS = ["Cascadia Mono", "Consolas"];
const TERMINAL_JAPANESE_FONTS = ["BIZ UDGothic", "Yu Gothic UI", "MS Gothic"];

function safeFontName(name: string) {
  return name.replace(/[\\"<>\r\n]/g, "").trim();
}

function fontFaceRule(alias: string, names: string[], unicodeRange: string, faceNames: FontFaceNameMap) {
  const sources = Array.from(
    new Set(
      names
        .map(safeFontName)
        .filter(Boolean)
        .flatMap((name) => [...(faceNames[name] ?? []), name].map(safeFontName).filter(Boolean)),
    ),
  ).map((name) => `local("${name}")`);
  if (sources.length === 0) return "";
  return `@font-face{font-family:"${alias}";src:${sources.join(",")};font-display:swap;unicode-range:${unicodeRange};}`;
}

function createTerminalStreams(count: number) {
  return Array.from({ length: count }, (_, index) => {
    const length = 22 + Math.floor(Math.random() * 96);
    const duration = 16 + Math.random() * 23;
    const laneCenter = ((index + 0.5) / count) * 100;
    return {
      bits: Array.from({ length }, () => (Math.random() > 0.5 ? "1" : "0")).join(""),
      style: {
        left: `${Math.max(2, Math.min(98, laneCenter + (Math.random() - 0.5) * 7))}%`,
        fontSize: `${8 + Math.random() * 2.5}px`,
        opacity: 0.55 + Math.random() * 0.45,
        animationDuration: `${duration.toFixed(1)}s`,
        animationDelay: `${(-Math.random() * duration).toFixed(1)}s`,
      } as React.CSSProperties,
    };
  });
}

const TERMINAL_STREAMS = createTerminalStreams(9);

function App() {
  const vibrancy = useVibrancyMode();
  const {
    opacity,
    skinId,
    latinFontId,
    japaneseFontId,
    alwaysOnTop,
    titleBarVisible,
    minimizeToTray,
    themeMode,
  } = useAppearanceStore();
  const isTimeline = useUiStore((s) => s.activeScreen === "timeline");
  const dualPane = usePanesStore((s) => s.dual);
  const paneDirection = usePanesStore((s) => s.direction);
  const secondaryStore = getSecondaryEntriesStore();
  useFeedsUpdatedListener();
  const refreshFeeds = useFeedsStore((s) => s.refresh);
  const refreshGenres = useFeedsStore((s) => s.refreshGenres);
  const isIdle = useIdleTimer();

  useEffect(() => {
    const syncFeeds = () => {
      void refreshFeeds();
      void refreshGenres();
    };

    syncFeeds();
    window.addEventListener("focus", syncFeeds);
    return () => window.removeEventListener("focus", syncFeeds);
  }, [refreshFeeds, refreshGenres]);

  useEffect(() => {
    function handleAuxClick(e: MouseEvent) {
      if (e.button === 3) {
        e.preventDefault();
        useUiStore.getState().goBack();
      } else if (e.button === 4) {
        e.preventDefault();
        useUiStore.getState().goForward();
      }
    }
    window.addEventListener("auxclick", handleAuxClick);
    return () => window.removeEventListener("auxclick", handleAuxClick);
  }, []);

  const [idlePattern, setIdlePattern] = useState(IDLE_PATTERNS[0]);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const [faceNames, setFaceNames] = useState<FontFaceNameMap>({});
  useEffect(() => {
    let cancelled = false;
    void fetchFontFaceNames().then((map) => {
      if (!cancelled) setFaceNames(map);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const skin = getSkin(skinId);
  const forcedLight = skin.visualStyle === "cardinality" || skin.visualStyle === "ordinary";
  const isDark =
    skin.visualStyle === "terminal" ||
    (!forcedLight && (themeMode === "dark" || (themeMode === "system" && systemDark)));

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

  const spotlightRef = useRef<HTMLDivElement>(null);
  const [spotlightActive, setSpotlightActive] = useState(false);
  const spotlightRaf = useRef<number | null>(null);
  const spotlightPos = useRef({ x: 0, y: 0 });
  function handleSpotlightMove(e: React.MouseEvent<HTMLDivElement>) {
    spotlightPos.current = { x: e.clientX, y: e.clientY };
    if (spotlightRaf.current !== null) return;
    spotlightRaf.current = requestAnimationFrame(() => {
      spotlightRaf.current = null;
      const el = spotlightRef.current;
      const host = el?.parentElement;
      if (!el || !host) return;
      const rect = host.getBoundingClientRect();
      el.style.setProperty("--spot-x", `${spotlightPos.current.x - rect.left}px`);
      el.style.setProperty("--spot-y", `${spotlightPos.current.y - rect.top}px`);
    });
  }
  useEffect(() => {
    return () => {
      if (spotlightRaf.current !== null) cancelAnimationFrame(spotlightRaf.current);
    };
  }, []);

  function handleRootPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    const target = e.target;
    if (
      target instanceof Element &&
      !target.closest("input, textarea, [contenteditable='true'], .allow-text-selection")
    ) {
      window.getSelection()?.removeAllRanges();
    }
  }

  const floating = skin.floating === true;
  const alpha = vibrancy === "none" && !floating ? 1 : opacity;
  useSyncFloatingMode(floating);
  useSyncWindowOpacity(alpha);
  useSyncAlwaysOnTop(alwaysOnTop);
  useSyncMinimizeToTray(minimizeToTray);
  useAutoCheckForUpdate();
  usePageScrollKeys();

  const terminalStyle = skin.visualStyle === "terminal";
  const latinSources = latinFontId
    ? [latinFontId]
    : terminalStyle
      ? TERMINAL_LATIN_FONTS
      : [];
  const japaneseSources = japaneseFontId
    ? [japaneseFontId]
    : terminalStyle
      ? TERMINAL_JAPANESE_FONTS
      : [];
  const splitFontCss = [
    fontFaceRule("RssWidgetLatin", latinSources, LATIN_UNICODE_RANGE, faceNames),
    fontFaceRule("RssWidgetJapanese", japaneseSources, JAPANESE_UNICODE_RANGE, faceNames),
  ].join("");
  const resolvedFontFamilies = [
    latinSources.length > 0 ? '"RssWidgetLatin"' : "",
    japaneseSources.length > 0 ? '"RssWidgetJapanese"' : "",
    "ui-sans-serif",
    "system-ui",
    "sans-serif",
  ].filter(Boolean);

  const panelStyle = {
    "--panel-rgb-light": skin.light,
    "--panel-rgb-dark": skin.dark,
    "--accent-rgb-light": skin.accentLight,
    "--accent-rgb-dark": skin.accentDark,
    ...(floating ? { "--float-alpha": alpha } : {}),
    ...(latinSources.length > 0 || japaneseSources.length > 0
      ? { fontFamily: resolvedFontFamilies.join(", ") }
      : {}),
  } as React.CSSProperties;
  const skinStyleClass = skin.visualStyle ? `skin-${skin.visualStyle}` : "";

  return (
    <div
      style={panelStyle}
      onPointerDown={handleRootPointerDown}
      className={`${isDark ? "dark" : ""} ${skinStyleClass} ${floating ? "skin-floating" : "ring-1 ring-inset ring-black/10 dark:ring-white/10"} ${isIdle ? "app-idle" : ""} panel-bg relative isolate flex h-screen w-screen flex-col overflow-hidden text-neutral-900 dark:text-neutral-100`}
    >
      {splitFontCss && <style>{splitFontCss}</style>}
      {skin.visualStyle === "terminal" && (
        <div className="terminal-data-stream" aria-hidden="true">
          {TERMINAL_STREAMS.map((stream, index) => (
            <span key={index} style={stream.style}>
              {stream.bits}
            </span>
          ))}
        </div>
      )}


      {skin.visualStyle === "ordinary" && (
        <div className="ordinary-hud" aria-hidden="true">
          <span className="ordinary-arc ordinary-arc-top" />
          <span className="ordinary-arc ordinary-arc-bottom" />
          <i className="ordinary-reticle" />
        </div>
      )}
      {floating && <ResizeCornerGuides />}
      {titleBarVisible && <TitleBar />}
      <FilterBar />
      <div className="app-content relative min-h-0 flex-1">

        <div className="timeline-pane absolute inset-0 flex flex-col" inert={!isTimeline}>
          <PaneBar />

          <div
            className={`flex min-h-0 flex-1 ${dualPane && paneDirection === "column" ? "flex-col" : "flex-row"}`}
          >
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <TimelineToolbar />

              <div
                className={`relative min-h-0 flex-1 ${isIdle ? "idle-mode" : ""}`}
                onMouseMove={handleSpotlightMove}
                onMouseEnter={() => setSpotlightActive(true)}
                onMouseLeave={() => setSpotlightActive(false)}
              >
                <EntryList />
                <div ref={spotlightRef} className={`mouse-spotlight ${spotlightActive ? "spotlight-active" : ""}`} aria-hidden="true" />

                <div className={`idle-bg ${idlePattern} ${isIdle ? "idle-bg-active" : ""}`} aria-hidden="true" />
              </div>
            </div>
            {dualPane && (
              <>
                <div
                  aria-hidden="true"
                  className={
                    paneDirection === "column"
                      ? "h-px w-full shrink-0 bg-black/10 dark:bg-white/10"
                      : "w-px shrink-0 self-stretch bg-black/10 dark:bg-white/10"
                  }
                />
                <div className="flex min-h-0 min-w-0 flex-1 flex-col">
                  <TimelineToolbar useStore={secondaryStore} />
                  <div className={`relative min-h-0 flex-1 ${isIdle ? "idle-mode" : ""}`}>
                    <EntryList useStore={secondaryStore} />
                    <div className={`idle-bg ${idlePattern} ${isIdle ? "idle-bg-active" : ""}`} aria-hidden="true" />
                  </div>
                </div>
              </>
            )}
          </div>
        </div>

        <FeedManagerOverlay />
        <DiscoverOverlay />
        <HistoryOverlay />
        <TrashOverlay />
        <ReaderOverlay />
        <SettingsOverlay />
      </div>

      <UpdateNoticePopup />

      <ScrollToTopButton />

      {import.meta.env.DEV && <DevPointer />}
    </div>
  );
}

export default App;
