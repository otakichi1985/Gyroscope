import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Pushes the effective window opacity to the Rust side (src-tauri/src/
 * window/opacity.rs -- true native window alpha via SetLayeredWindowAttributes,
 * not a CSS trick). Runs on mount and whenever `alpha` changes, so both the
 * initial persisted value and live slider drags stay in sync.
 */
export function useSyncWindowOpacity(alpha: number) {
  useEffect(() => {
    invoke("set_window_opacity", { alpha }).catch(() => {});
  }, [alpha]);
}
