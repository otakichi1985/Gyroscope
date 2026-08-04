import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Feed, OpmlImportSummary } from "../lib/types";

interface FeedsState {
  feeds: Feed[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addFeed: (url: string) => Promise<void>;
  deleteFeed: (id: number) => Promise<void>;
  refreshFeed: (id: number) => Promise<void>;
  setFeedNotify: (id: number, notifyEnabled: boolean) => Promise<void>;
  setFeedInterval: (id: number, intervalMin: number | null) => Promise<void>;
  setFeedFolder: (id: number, folder: string | null) => Promise<void>;
  importOpml: (path: string) => Promise<OpmlImportSummary>;
  exportOpml: (path: string) => Promise<void>;
}

export const useFeedsStore = create<FeedsState>((set, get) => ({
  feeds: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const feeds = await invoke<Feed[]>("list_feeds");
      set({ feeds, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  addFeed: async (url: string) => {
    set({ error: null });
    await invoke<Feed>("add_feed", { url });
    await get().refresh();
  },

  deleteFeed: async (id: number) => {
    await invoke("delete_feed", { id });
    await get().refresh();
  },

  refreshFeed: async (id: number) => {
    await invoke<Feed>("refresh_feed", { id });
    await get().refresh();
  },

  setFeedNotify: async (id: number, notifyEnabled: boolean) => {
    await invoke("set_feed_notify", { id, notifyEnabled });
    await get().refresh();
  },

  setFeedInterval: async (id: number, intervalMin: number | null) => {
    await invoke("set_feed_interval", { id, intervalMin });
    await get().refresh();
  },

  setFeedFolder: async (id: number, folder: string | null) => {
    await invoke("set_feed_folder", { id, folder });
    await get().refresh();
  },

  importOpml: async (path: string) => {
    const summary = await invoke<OpmlImportSummary>("import_opml_from_path", { path });
    await get().refresh();
    return summary;
  },

  exportOpml: async (path: string) => {
    await invoke("export_opml_to_path", { path });
  },
}));
