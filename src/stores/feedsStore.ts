import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Feed } from "../lib/types";

interface FeedsState {
  feeds: Feed[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  addFeed: (url: string) => Promise<void>;
  deleteFeed: (id: number) => Promise<void>;
  refreshFeed: (id: number) => Promise<void>;
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
}));
