// Registry of the app's scrollable content panes (the timeline list and each
// overlay's own scroller). Exactly one pane is "active" at a time -- the
// timeline when it's showing, otherwise whichever overlay is open -- and the
// scroll-to-top button plus the Home/End/PageUp/PageDown keys target that pane
// so they never scroll a hidden list underneath the current screen.
//
// Panes register through useScrollTargetRef (src/hooks/useScrollTargetRef.ts),
// which keeps this Set in sync with mounted containers automatically.
const scrollables = new Set<HTMLElement>();
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

export function registerScrollable(el: HTMLElement) {
  scrollables.add(el);
  notify();
}

export function unregisterScrollable(el: HTMLElement) {
  scrollables.delete(el);
  notify();
}

/** Called whenever the set of mounted scrollables changes (screen switch,
 * overlay open/close). Returns an unsubscribe function. */
export function subscribeScrollables(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

/**
 * The content pane currently on screen: a registered scrollable that is still
 * connected, not inside an inert (hidden) subtree, and with a visible rect.
 * When several qualify, the last one to register wins -- the in-place discover
 * reader mounts after the results list it covers, so it takes priority while
 * it's open.
 */
export function activeScrollable(): HTMLElement | null {
  let best: HTMLElement | null = null;
  for (const el of scrollables) {
    if (!el.isConnected || el.closest("[inert]")) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) continue;
    if (rect.bottom <= 0 || rect.top >= window.innerHeight) continue;
    best = el;
  }
  return best;
}

/** Scroll the active pane by `delta` px, clamped to its scrollable range. */
export function scrollActiveBy(delta: number) {
  const el = activeScrollable();
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  el.scrollTop = Math.min(max, Math.max(0, el.scrollTop + delta));
}

/** Smoothly jump the active pane to its top or bottom edge. */
export function scrollActiveTo(edge: "top" | "bottom") {
  const el = activeScrollable();
  if (!el) return;
  el.scrollTo({ top: edge === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
}