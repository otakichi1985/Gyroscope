import { useEffect } from "react";
import { listen } from "@tauri-apps/api/event";
import { refreshAllEntriesStores } from "../stores/entriesStore";
import { useFeedsStore } from "../stores/feedsStore";

export function useFeedsUpdatedListener() {
  useEffect(() => {
    const unlistenStart = listen("feeds-refresh-start", () => {
      useFeedsStore.setState({ backgroundRefreshing: true });
    });
    const unlistenDone = listen("feeds-updated", () => {
      useFeedsStore.setState({ backgroundRefreshing: false });
      useFeedsStore.getState().refresh();
      refreshAllEntriesStores();
    });
    return () => {
      unlistenStart.then((f) => f());
      unlistenDone.then((f) => f());
    };
  }, []);
}
