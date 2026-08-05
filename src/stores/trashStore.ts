import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Entry } from "../lib/types";

// Backs TrashOverlay.tsx -- deleted bookmarks (commands::entries::delete_entry)
// stay recoverable here for 30 days (scheduler::BOOKMARK_TRASH_RETENTION_DAYS)
// before the backend purges them for good.
interface TrashState {
  entries: Entry[];
  loading: boolean;
  error: string | null;
  refresh: () => Promise<void>;
  restore: (id: number) => Promise<void>;
}

export const useTrashStore = create<TrashState>((set, get) => ({
  entries: [],
  loading: false,
  error: null,

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await invoke<Entry[]>("list_deleted_entries");
      set({ entries, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  restore: async (id: number) => {
    const previous = get().entries;
    set({ entries: previous.filter((entry) => entry.id !== id) });
    try {
      await invoke("restore_entry", { id });
    } catch (error) {
      set({ entries: previous, error: String(error) });
    }
  },
}));
