import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useSyncFloatingMode(enabled: boolean) {
  useEffect(() => {
    invoke("set_floating_mode", { enabled }).catch(() => {});
  }, [enabled]);
}
