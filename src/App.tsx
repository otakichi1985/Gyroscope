import { EntryList } from "./components/EntryList";
import { FeedManagerOverlay } from "./components/FeedManagerOverlay";
import { FilterBar } from "./components/FilterBar";
import { HistoryOverlay } from "./components/HistoryOverlay";
import { SettingsOverlay } from "./components/SettingsOverlay";
import { TitleBar } from "./components/TitleBar";
import { useFeedsUpdatedListener } from "./hooks/useFeedsUpdatedListener";
import { useSyncAlwaysOnTop } from "./hooks/useSyncAlwaysOnTop";
import { useSyncWindowOpacity } from "./hooks/useSyncWindowOpacity";
import { useVibrancyMode } from "./hooks/useVibrancyMode";
import { getSkin } from "./lib/skins";
import { useAppearanceStore } from "./stores/appearanceStore";

function App() {
  const vibrancy = useVibrancyMode();
  const { opacity, skinId, fontId, alwaysOnTop, titleBarVisible } = useAppearanceStore();
  useFeedsUpdatedListener();

  const skin = getSkin(skinId);
  // No vibrancy backdrop means nothing but the raw desktop sits behind this
  // window -- forcing full opacity here keeps that case looking solid
  // instead of a very plain flat-colored window with no blur to soften it.
  const alpha = vibrancy === "none" ? 1 : opacity;
  useSyncWindowOpacity(alpha);
  useSyncAlwaysOnTop(alwaysOnTop);

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
      className="panel-bg flex h-screen w-screen flex-col overflow-hidden rounded-2xl text-neutral-900 dark:text-neutral-100"
    >
      {titleBarVisible && <TitleBar />}
      <FilterBar />
      <div className="relative min-h-0 flex-1">
        <EntryList />
        {/* Always mounted (not conditionally rendered): each overlay reads
            uiStore's activeScreen itself and animates in/out via CSS, which
            is what makes screen switches slide/fade instead of instantly
            replacing each other, and guarantees only one screen is ever
            interactive at a time -- see each overlay's own isActive logic. */}
        <FeedManagerOverlay />
        <HistoryOverlay />
        <SettingsOverlay />
      </div>
    </div>
  );
}

export default App;
