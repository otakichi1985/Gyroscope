import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppearanceStore } from "../stores/appearanceStore";

const isTauriRuntime = typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
const appWindow = isTauriRuntime ? getCurrentWindow() : null;

export function TitleBar() {
  const positionLocked = useAppearanceStore((s) => s.positionLocked);
  const dragRegion = positionLocked ? undefined : true;

  const isDev = import.meta.env.DEV;
  useEffect(() => {
    if (isDev && appWindow) {
      void appWindow.setTitle("Gyroscope (開発版)");
    }
  }, [isDev]);

  return (
    <div
      data-tauri-drag-region={dragRegion}
      className="app-titlebar flex h-8 shrink-0 items-center justify-between pl-3 pr-1 select-none"
    >
      <span data-tauri-drag-region={dragRegion} className="flex items-center gap-1.5 text-xs font-medium opacity-70">
        Gyroscope
        {isDev && (
          <span className="dev-pill rounded accent-bg-soft accent-text px-1 py-px text-[10px] font-semibold leading-none">
            開発版
          </span>
        )}
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => void appWindow?.minimize()}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10"
        >
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
            <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => void appWindow?.close()}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-red-500 hover:text-white"
        >
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
            <line x1="0" y1="0" x2="10" y2="10" stroke="currentColor" strokeWidth="1" />
            <line x1="10" y1="0" x2="0" y2="10" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
      </div>
    </div>
  );
}
