import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useSyncWindowOpacity(alpha: number) {
  useEffect(() => {
    invoke("set_window_opacity", { alpha }).catch(() => {});
  }, [alpha]);
}
