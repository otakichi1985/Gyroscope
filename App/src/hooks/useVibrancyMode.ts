import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";

export type VibrancyMode = "mica" | "acrylic" | "none";

export function useVibrancyMode(): VibrancyMode {
  const [mode, setMode] = useState<VibrancyMode>("none");

  useEffect(() => {
    invoke<VibrancyMode>("get_vibrancy_mode")
      .then(setMode)
      .catch(() => setMode("none"));
  }, []);

  return mode;
}
