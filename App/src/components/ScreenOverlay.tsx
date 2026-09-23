import type { CSSProperties, ReactNode } from "react";
import { useUiStore, type Screen } from "../stores/uiStore";
import { CloseIcon } from "./icons";

interface ScreenOverlayProps {
  screen: Exclude<Screen, "timeline">;
  title: ReactNode;

  headerActions?: ReactNode;

  style?: CSSProperties;
  children: ReactNode;
}

export function ScreenOverlay({ screen, title, headerActions, style, children }: ScreenOverlayProps) {
  const activeScreen = useUiStore((s) => s.activeScreen);
  const goHome = useUiStore((s) => s.goHome);
  const isActive = activeScreen === screen;

  return (
    <div
      style={style}
      className={`screen-overlay panel-bg absolute inset-0 z-10 flex flex-col transition-all duration-200 ease-out ${
        isActive ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0 pointer-events-none"
      }`}
      inert={!isActive}
    >
      <div className="screen-overlay-header flex h-8 shrink-0 items-center justify-between border-b border-black/10 px-2 text-sm font-medium dark:border-white/10">
        <span className="truncate">{title}</span>
        <div className="flex shrink-0 items-center gap-1">
          {headerActions}

          <button
            type="button"
            onClick={goHome}
            className="screen-close-button flex items-center gap-1 rounded border border-red-500/40 bg-red-500/10 px-2 py-0.5 text-xs text-red-600 transition-colors duration-150 hover:bg-red-500 hover:text-white active:bg-red-600 dark:border-red-400/40 dark:text-red-400 dark:hover:text-white"
            aria-label="閉じる"
          >
            <CloseIcon className="screen-close-icon h-3 w-3" />
            <span className="screen-close-label">閉じる</span>
          </button>
        </div>
      </div>
      {children}
    </div>
  );
}
