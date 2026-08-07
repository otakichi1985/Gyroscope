import { useEffect } from "react";
import { dueForAutoCheck, useUpdateStore } from "../stores/updateStore";

/**
 * Silent startup check, throttled to once a day (see `dueForAutoCheck`).
 * Only ever populates `useUpdateStore`'s state -- nothing here shows a
 * notification on its own. Settings reads that state to show the details,
 * and FilterBar's settings icon reads it to show a plain badge dot, so a
 * found update stays visible without interrupting anything.
 */
export function useAutoCheckForUpdate() {
  const loadStatic = useUpdateStore((s) => s.loadStatic);
  const check = useUpdateStore((s) => s.check);

  useEffect(() => {
    loadStatic();
    if (dueForAutoCheck()) {
      check();
    }
    // Intentionally run once on mount only -- this is a startup check, not
    // something that should re-fire on unrelated re-renders.
  }, []);
}
