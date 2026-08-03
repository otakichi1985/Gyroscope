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
      <main className="flex flex-1 items-center justify-center px-4 text-center text-sm opacity-70">
        RSS Widget — scaffold ready (Phase 1: frameless + vibrancy)
      </main>
    </div>
  );
}

export default App;
