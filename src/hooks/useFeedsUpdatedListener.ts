import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useEntriesStore } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";

/**
 * Resyncs both stores whenever the Rust side finishes a refresh -- manual
 * per-feed refresh, the background scheduler tick, or the tray's "更新"
 * item (src-tauri/src/scheduler.rs / commands/feeds.rs both emit
 * "feeds-updated" once per refresh, never once per feed in a batch).
 */
export function useFeedsUpdatedListener() {
  useEffect(() => {
    const unlisten = listen("feeds-updated", () => {
      useFeedsStore.getState().refresh();
      useEntriesStore.getState().refresh();
    });
    return () => {
      unlisten.then((f) => f());
    };
  }, []);
}
