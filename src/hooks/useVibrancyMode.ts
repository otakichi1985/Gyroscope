import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type VibrancyMode = "mica" | "acrylic" | "none";

/**
 * Mirrors the backdrop Rust actually managed to apply to the main window
 * (see src-tauri/src/window/vibrancy.rs). Defaults to "none" until the
 * Rust side answers, so the panel starts fully opaque rather than
 * momentarily see-through.
 */
export function useVibrancyMode(): VibrancyMode {
  const [mode, setMode] = useState<VibrancyMode>("none");

  useEffect(() => {
    invoke<VibrancyMode>("get_vibrancy_mode")
      .then(setMode)
      .catch(() => setMode("none"));
  }, []);

  return mode;
}
