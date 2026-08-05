import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { useEntriesStore } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";

/**
 * Resyncs both stores whenever the Rust side finishes a refresh -- manual
 * per-feed refresh, the background scheduler tick, or the tray's "更新"
 * item (src-tauri/src/scheduler.rs / commands/feeds.rs both emit
 * "feeds-updated" once per refresh, never once per feed in a batch).
 *
 * Also tracks `backgroundRefreshing` between "feeds-refresh-start" (emitted
 * right before a batch begins) and "feeds-updated" (its completion) -- this
 * is the only signal that any refresh, including the scheduler's silent
 * 60s tick, is happening right now (user feedback: no way to tell whether
 * the app was actually doing anything in the background).
 */
export function useFeedsUpdatedListener() {
  useEffect(() => {
    const unlistenStart = listen("feeds-refresh-start", () => {
      useFeedsStore.setState({ backgroundRefreshing: true });
    });
    const unlistenDone = listen("feeds-updated", () => {
      useFeedsStore.setState({ backgroundRefreshing: false });
      useFeedsStore.getState().refresh();
      useEntriesStore.getState().refresh();
    });
    return () => {
      unlistenStart.then((f) => f());
      unlistenDone.then((f) => f());
    };
  }, []);
}
