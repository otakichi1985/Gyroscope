import { getCurrentWindow } from "@tauri-apps/api/window";

const appWindow = getCurrentWindow();

export function TitleBar() {
  return (
    <div
      data-tauri-drag-region
      className="flex h-8 shrink-0 items-center justify-between pl-3 pr-1 select-none"
    >
      <span data-tauri-drag-region className="text-xs font-medium opacity-70">
        RSS Widget
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          aria-label="Minimize"
          onClick={() => appWindow.minimize()}
          className="flex h-6 w-6 items-center justify-center rounded hover:bg-black/10 dark:hover:bg-white/10"
        >
          <svg viewBox="0 0 10 10" className="h-2.5 w-2.5">
            <line x1="0" y1="5" x2="10" y2="5" stroke="currentColor" strokeWidth="1" />
          </svg>
        </button>
        <button
          type="button"
          aria-label="Close"
          onClick={() => appWindow.close()}
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
