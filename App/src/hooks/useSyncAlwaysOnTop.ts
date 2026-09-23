import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

export function useSyncAlwaysOnTop(alwaysOnTop: boolean) {
  useEffect(() => {
    invoke("set_always_on_top", { value: alwaysOnTop }).catch(() => {});
  }, [alwaysOnTop]);
}
