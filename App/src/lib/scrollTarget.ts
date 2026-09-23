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

export function subscribeScrollables(fn: () => void): () => void {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

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

export function scrollActiveBy(delta: number) {
  const el = activeScrollable();
  if (!el) return;
  const max = el.scrollHeight - el.clientHeight;
  el.scrollTop = Math.min(max, Math.max(0, el.scrollTop + delta));
}

export function scrollActiveTo(edge: "top" | "bottom") {
  const el = activeScrollable();
  if (!el) return;
  el.scrollTo({ top: edge === "top" ? 0 : el.scrollHeight, behavior: "smooth" });
}
