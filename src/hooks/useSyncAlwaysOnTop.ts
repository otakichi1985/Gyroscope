import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Pushes the "常に最前面" preference to the native window on mount and
 * whenever it changes. Goes through a custom Rust command rather than
 * Tauri's own `setAlwaysOnTop()` core API: the always-on-top toggle resets
 * the window's layered-window alpha (same class of issue as
 * maximize/resize), so the command re-applies the last opacity right after
 * changing it -- see set_always_on_top in src-tauri/src/window/opacity.rs.
 * Custom commands need no capability entry, so
 * `core:window:allow-set-always-on-top` was removed from
 * src-tauri/capabilities/default.json. */
export function useSyncAlwaysOnTop(alwaysOnTop: boolean) {
  useEffect(() => {
    invoke("set_always_on_top", { value: alwaysOnTop }).catch(() => {});
  }, [alwaysOnTop]);
}
