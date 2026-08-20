import { useEffect } from "react";
import { useUpdateStore } from "../stores/updateStore";

// How often to re-check while the app stays running. The user asked for a
// startup check on every launch plus periodic checks during use -- every 6h
// is frequent enough to surface an update within a reasonable window without
// hammering the release endpoint.
const PERIODIC_CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;

/**
 * Update checking: always checks once at startup (not throttled -- a fresh
 * launch is the moment the user is most likely to act on an update), then
 * re-checks on a timer while the app keeps running. Only ever populates
 * `useUpdateStore`'s state; the in-app notice (UpdateNoticePopup) and the
 * settings アップデート section read that state to present the result.
 */
export function useAutoCheckForUpdate() {
  const loadStatic = useUpdateStore((s) => s.loadStatic);
  const check = useUpdateStore((s) => s.check);

  useEffect(() => {
    loadStatic();
    check();
    const timer = window.setInterval(() => {
      check();
    }, PERIODIC_CHECK_INTERVAL_MS);
    return () => window.clearInterval(timer);
    // Intentionally run once on mount only -- this is the app-lifetime check
    // loop, not something that should re-fire on unrelated re-renders.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
}