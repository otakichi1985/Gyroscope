import { useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";

/** Pushes the "閉じるボタンでタスクトレイに格納" preference to the Rust
 * CloseRequested handler on mount and whenever it changes -- see
 * tray::MinimizeToTray / set_minimize_to_tray in src-tauri/src/tray.rs.
 * When off, the X button quits the app like an ordinary window instead of
 * hiding it. */
export function useSyncMinimizeToTray(minimizeToTray: boolean) {
  useEffect(() => {
    invoke("set_minimize_to_tray", { value: minimizeToTray }).catch(() => {});
  }, [minimizeToTray]);
}
