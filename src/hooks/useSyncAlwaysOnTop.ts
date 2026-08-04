import { useEffect } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";

/** Pushes the "常に最前面" preference to the native window on mount and
 * whenever it changes. Uses Tauri's own core window API (no custom Rust
 * command needed here, unlike opacity -- setAlwaysOnTop is a first-class
 * Tauri window command; just needs the `core:window:allow-set-always-on-top`
 * capability, see src-tauri/capabilities/default.json). */
export function useSyncAlwaysOnTop(alwaysOnTop: boolean) {
  useEffect(() => {
    getCurrentWindow()
      .setAlwaysOnTop(alwaysOnTop)
      .catch(() => {});
  }, [alwaysOnTop]);
}
