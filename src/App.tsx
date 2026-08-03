import { FeedManager } from "./components/FeedManager";
import { TitleBar } from "./components/TitleBar";
import { useVibrancyMode } from "./hooks/useVibrancyMode";

const PANEL_BG: Record<ReturnType<typeof useVibrancyMode>, string> = {
  mica: "bg-white/55 dark:bg-neutral-900/45",
  acrylic: "bg-white/65 dark:bg-neutral-900/55",
  none: "bg-white dark:bg-neutral-900",
};

function App() {
  const vibrancy = useVibrancyMode();

  return (
    <div
      className={`flex h-screen w-screen flex-col overflow-hidden rounded-2xl text-neutral-900 dark:text-neutral-100 ${PANEL_BG[vibrancy]}`}
    >
      <TitleBar />
      <FeedManager />
    </div>
  );
}

export default App;
