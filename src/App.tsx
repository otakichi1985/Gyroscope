import { EntryList } from "./components/EntryList";
import { FeedManagerOverlay } from "./components/FeedManagerOverlay";
import { FilterBar } from "./components/FilterBar";
import { HistoryOverlay } from "./components/HistoryOverlay";
import { SettingsOverlay } from "./components/SettingsOverlay";
import { TitleBar } from "./components/TitleBar";
import { useFeedsUpdatedListener } from "./hooks/useFeedsUpdatedListener";
import { useSyncWindowOpacity } from "./hooks/useSyncWindowOpacity";
import { useVibrancyMode } from "./hooks/useVibrancyMode";
import { getSkin } from "./lib/skins";
import { useAppearanceStore } from "./stores/appearanceStore";
import { useUiStore } from "./stores/uiStore";

function App() {
  const vibrancy = useVibrancyMode();
  const feedManagerOpen = useUiStore((s) => s.feedManagerOpen);
  const historyOpen = useUiStore((s) => s.historyOpen);
  const settingsOpen = useUiStore((s) => s.settingsOpen);
  const { opacity, skinId } = useAppearanceStore();
  useFeedsUpdatedListener();

  const skin = getSkin(skinId);
  // No vibrancy backdrop means nothing but the raw desktop sits behind this
  // window -- forcing full opacity here keeps that case looking solid
  // instead of a very plain flat-colored window with no blur to soften it.
  const alpha = vibrancy === "none" ? 1 : opacity;
  useSyncWindowOpacity(alpha);

  const panelStyle = {
    "--panel-rgb-light": skin.light,
    "--panel-rgb-dark": skin.dark,
  } as React.CSSProperties;

  return (
    <div
      style={panelStyle}
      className="panel-bg flex h-screen w-screen flex-col overflow-hidden rounded-2xl text-neutral-900 dark:text-neutral-100"
    >
      <TitleBar />
      <FilterBar />
      <div className="relative min-h-0 flex-1">
        <EntryList />
        {feedManagerOpen && <FeedManagerOverlay />}
        {historyOpen && <HistoryOverlay />}
        {settingsOpen && <SettingsOverlay />}
      </div>
    </div>
  );
}

export default App;
