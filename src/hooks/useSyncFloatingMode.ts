import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/**
 * Tells Rust whether the current skin wants "floating" mode -- no DWM
 * backdrop, so the transparent parts of this window show the real desktop
 * instead of Mica/Acrylic's own blur (src-tauri/src/window/vibrancy.rs).
 *
 * Only the two SAO-derived skins ask for it, so this is driven by the skin
 * rather than a setting of its own. Runs on mount too, since the saved skin
 * is already applied by then and the backdrop has to match it from the start.
 *
 * Must be called *before* useSyncWindowOpacity in the component, so that on a
 * skin change Rust learns about the new mode before it is asked to apply an
 * alpha under it. The Rust side tolerates either order, but this keeps the
 * intent readable.
 */
export function useSyncFloatingMode(enabled: boolean) {
  useEffect(() => {
    invoke("set_floating_mode", { enabled }).catch(() => {});
  }, [enabled]);
}
