import { getCurrentWindow } from "@tauri-apps/api/window";
import { useAppearanceStore } from "../stores/appearanceStore";

const appWindow = getCurrentWindow();

export function TitleBar() {
  const positionLocked = useAppearanceStore((s) => s.positionLocked);
  // `data-tauri-drag-region` is what makes mousedown-and-drag move the
  // window; omitting it (rather than e.g. disabling via CSS) is the actual
  // mechanism behind "位置を固定" -- there's no separate Tauri API to turn
  // window dragging off.
  const dragRegion = positionLocked ? undefined : true;

  return (
    <div
      data-tauri-drag-region={dragRegion}
      className="app-titlebar flex h-8 shrink-0 items-center justify-between pl-3 pr-1 select-none"
    >
      <span data-tauri-drag-region={dragRegion} className="text-xs font-medium opacity-70">
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
