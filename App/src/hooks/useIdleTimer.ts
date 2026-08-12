import { useEffect, useState } from "react";

// "Some minutes" per the request that prompted this -- 3 minutes is a
// reasonable default for a background-glanced widget (SPEC's whole use
// case), long enough that briefly reading one article without touching the
// mouse doesn't trigger it, short enough that leaving the app open on a
// second monitor actually shows the idle state before too long.
const IDLE_TIMEOUT_MS = 3 * 60 * 1000;
const ACTIVITY_EVENTS = ["mousemove", "mousedown", "keydown", "wheel"] as const;

/** True once the window has gone `IDLE_TIMEOUT_MS` without any mouse/
 * keyboard activity; flips back to false the instant any of it resumes
 * (see ACTIVITY_EVENTS) -- drives the timeline's idle-shimmer overlay
 * (App.tsx), added because the timeline looked a little lifeless left
 * untouched for a while (user feedback). */
export function useIdleTimer(): boolean {
  const [idle, setIdle] = useState(false);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;

    function resetTimer() {
      setIdle(false);
      clearTimeout(timer);
      timer = setTimeout(() => setIdle(true), IDLE_TIMEOUT_MS);
    }

    resetTimer();
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, resetTimer);
    }
    return () => {
      clearTimeout(timer);
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, resetTimer);
      }
    };
  }, []);

  return idle;
}
