import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { ReadHistoryEntry } from "../lib/types";

const PAGE_SIZE = 200;

interface HistoryState {
  entries: ReadHistoryEntry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  clear: () => Promise<void>;
}

export const useHistoryStore = create<HistoryState>((set) => ({
  entries: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await invoke<ReadHistoryEntry[]>("list_read_history", {
        limit: PAGE_SIZE,
        offset: 0,
      });
      set({ entries, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  clear: async () => {
    try {
      await invoke("clear_read_history");
      set({ entries: [] });
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));
