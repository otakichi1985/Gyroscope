import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useSyncMinimizeToTray(minimizeToTray: boolean) {
  useEffect(() => {
    invoke("set_minimize_to_tray", { value: minimizeToTray }).catch(() => {});
  }, [minimizeToTray]);
}
