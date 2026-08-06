import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon } from "./icons";

interface FontPickerProps {
  value: string; // "" = default (no override)
  options: string[] | null; // null = still loading
  onChange: (value: string) => void;
}

const GAP_PX = 4;
const MAX_LIST_HEIGHT_PX = 220;
const MIN_LIST_HEIGHT_PX = 100;
const POPUP_CHROME_PX = 32;

/// A dropdown for the (potentially hundreds of entries long) system font
/// list. A native <select> was used originally, but its popup is an
/// OS-level surface that Chromium positions/sizes on its own -- it ignores
/// the app window's bounds entirely and can render past the bottom edge of
/// this small widget window (reported after the font list started coming
/// from list_system_fonts, see SettingsOverlay.tsx / window/fonts.rs).
/// This renders the list ourselves via a portal with an explicit fixed
/// position/max-height computed from the trigger button and the window's
/// own inner height, so it's guaranteed to stay inside the window -- plus a
/// filter box, which a plain constrained list of hundreds of items would
/// otherwise be painful to scroll through by mouse alone.
export function FontPicker({ value, options, onChange }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  function handleOpen() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (!rect) return;
    const spaceBelow = window.innerHeight - rect.bottom - GAP_PX;
    const spaceAbove = rect.top - GAP_PX;
    const openUpward = spaceBelow < MIN_LIST_HEIGHT_PX + POPUP_CHROME_PX && spaceAbove > spaceBelow;
    // Reserve space for the filter input and popup borders, and never make
    // the list taller than the viewport can actually show.
    const available = Math.max(
      0,
      Math.min(MAX_LIST_HEIGHT_PX, (openUpward ? spaceAbove : spaceBelow) - POPUP_CHROME_PX),
    );
    setPos({
      left: rect.left,
      width: rect.width,
      top: openUpward ? rect.top - GAP_PX - available - POPUP_CHROME_PX : rect.bottom + GAP_PX,
      maxHeight: available,
    });
    setFilter("");
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;
    function handlePointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (listRef.current?.contains(target) || buttonRef.current?.contains(target)) return;
      setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    // The settings panel scrolling should dismiss this fixed popup, but the
    // font list's own scroll must remain usable.
    function handleScroll(e: Event) {
      const target = e.target;
      if (target instanceof Node && listRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKey);
    window.addEventListener("scroll", handleScroll, true);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKey);
      window.removeEventListener("scroll", handleScroll, true);
    };
  }, [open]);

  const filtered = (options ?? []).filter((name) => name.toLowerCase().includes(filter.toLowerCase()));

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        disabled={options === null}
        onClick={() => (open ? setOpen(false) : handleOpen())}
        style={value ? { fontFamily: `"${value}"` } : undefined}
        className="flex w-full items-center justify-between gap-2 rounded border border-black/10 bg-black/5 px-2 py-1.5 text-left text-xs outline-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
      >
        <span className="truncate">{value || "既定"}</span>
        <ChevronDownIcon className="h-3.5 w-3.5 shrink-0 opacity-60" />
      </button>
      {open &&
        pos &&
        createPortal(
          // Deliberately not using the .panel-bg/.accent-* skin-tinted
          // utilities here: those rely on CSS custom properties set inline
          // on the App root div, which only cascade to its own DOM
          // descendants -- a document.body portal sits outside that
          // subtree, so the variables wouldn't resolve. A plain solid
          // surface (same as this app's overlays looked like before the
          // skin-tinting pass) is the correct choice for a popup like this
          // anyway, the same way a native <select> popup doesn't try to
          // match the page's theme either. Translucent + blurred (not
          // fully opaque) and `.dropdown-enter`-animated to match
          // FeedPicker.tsx's later, identical treatment -- kept consistent
          // between the app's two custom dropdowns.
          <div
            ref={listRef}
            style={{ position: "fixed", top: pos.top, left: pos.left, width: pos.width }}
            className="dropdown-enter z-50 flex flex-col overflow-hidden rounded-lg border border-black/10 bg-white/85 shadow-lg backdrop-blur-md dark:border-white/15 dark:bg-neutral-900/85"
          >
            <input
              autoFocus
              type="text"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              placeholder="フォントを検索"
              className="border-b border-black/10 bg-transparent px-2 py-1.5 text-xs text-neutral-900 outline-none dark:border-white/10 dark:text-neutral-100"
            />
            <div style={{ maxHeight: pos.maxHeight }} className="overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => {
                  onChange("");
                  setOpen(false);
                }}
                className={`block w-full px-2 py-1 text-left text-xs text-neutral-900 transition-colors duration-150 hover:bg-black/5 dark:text-neutral-100 dark:hover:bg-white/10 ${
                  !value ? "font-medium" : ""
                }`}
              >
                既定
              </button>
              {filtered.map((name) => (
                <button
                  key={name}
                  type="button"
                  onClick={() => {
                    onChange(name);
                    setOpen(false);
                  }}
                  style={{ fontFamily: `"${name}"` }}
                  className={`block w-full truncate px-2 py-1 text-left text-xs text-neutral-900 transition-colors duration-150 hover:bg-black/5 dark:text-neutral-100 dark:hover:bg-white/10 ${
                    value === name ? "font-medium" : ""
                  }`}
                >
                  {name}
                </button>
              ))}
              {filtered.length === 0 && <p className="px-2 py-1 text-xs text-neutral-500">見つかりません</p>}
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
