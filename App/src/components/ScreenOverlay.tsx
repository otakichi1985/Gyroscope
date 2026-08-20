import type { CSSProperties, ReactNode } from "react";
import { useUiStore, type Screen } from "../stores/uiStore";
import { CloseIcon } from "./icons";

/**
 * Shared chrome for every full-screen overlay (feed manager, history,
 * trash, reader, settings). All five had grown byte-identical copies of
 * the wrapper element, its enter/exit transition, its `inert` gating and
 * its close button -- so a tweak to any of them (the close button has been
 * restyled twice now) meant the same edit in five files, with nothing
 * keeping them in sync.
 *
 * Kept as an "always mounted, animate on activation" component rather than
 * conditional rendering: each overlay subscribes to `activeScreen` itself
 * and slides/fades in place, which is what makes screen switches animate
 * instead of instantly swapping, and structurally guarantees only one
 * screen is ever interactive. `inert` (not just `pointer-events-none`)
 * also keeps keyboard focus and screen readers out of the inactive ones.
 */
interface ScreenOverlayProps {
  screen: Exclude<Screen, "timeline">;
  title: ReactNode;
  /** Extra controls placed to the left of the close button. */
  headerActions?: ReactNode;
  /** Optional inline styles for the overlay root -- used by the reader to
   * raise `--float-alpha` (floating skins' opacity) while reading. */
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
          {/* Deliberately breaks this app's usual "quiet icon, color only on
              hover" convention. The ask was specifically that you couldn't
              tell there was a close button here *before* hovering it -- a
              small monochrome × blends into the header -- so it is visibly
              red, boxed and labelled at rest, not just on interaction. */}
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
