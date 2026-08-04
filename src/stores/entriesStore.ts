import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Entry } from "../lib/types";

export type ViewMode = "card" | "list" | "compact";

const PAGE_SIZE = 200;
const VIEW_MODE_KEY = "rss-widget:view-mode";

function loadViewMode(): ViewMode {
  const stored = localStorage.getItem(VIEW_MODE_KEY);
  return stored === "card" || stored === "list" || stored === "compact" ? stored : "card";
}

interface EntriesState {
  entries: Entry[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  filterFeedId: number | null;
  viewMode: ViewMode;

  refresh: () => Promise<void>;
  fetchMore: () => Promise<void>;
  setFilterFeedId: (feedId: number | null) => Promise<void>;
  setViewMode: (mode: ViewMode) => void;
  markRead: (id: number, isRead: boolean) => Promise<void>;
  toggleStar: (id: number, isStarred: boolean) => Promise<void>;
  markAllRead: () => Promise<void>;
}

export const useEntriesStore = create<EntriesState>((set, get) => ({
  entries: [],
  loading: false,
  loadingMore: false,
  hasMore: true,
  error: null,
  filterFeedId: null,
  viewMode: loadViewMode(),

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const entries = await invoke<Entry[]>("list_entries", {
        filter: {
          feed_id: get().filterFeedId,
          unread_only: null,
          starred_only: null,
          limit: PAGE_SIZE,
          offset: 0,
        },
      });
      set({ entries, hasMore: entries.length === PAGE_SIZE, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  fetchMore: async () => {
    if (get().loadingMore || !get().hasMore) return;
    set({ loadingMore: true });
    try {
      const more = await invoke<Entry[]>("list_entries", {
        filter: {
          feed_id: get().filterFeedId,
          unread_only: null,
          starred_only: null,
          limit: PAGE_SIZE,
          offset: get().entries.length,
        },
      });
      set((state) => ({
        entries: [...state.entries, ...more],
        hasMore: more.length === PAGE_SIZE,
        loadingMore: false,
      }));
    } catch (error) {
      set({ error: String(error), loadingMore: false });
    }
  },

  setFilterFeedId: async (feedId: number | null) => {
    set({ filterFeedId: feedId });
    await get().refresh();
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
    localStorage.setItem(VIEW_MODE_KEY, mode);
  },

  markRead: async (id: number, isRead: boolean) => {
    const previous = get().entries;
    set({
      entries: previous.map((entry) => (entry.id === id ? { ...entry, is_read: isRead } : entry)),
    });
    try {
      await invoke("mark_entry_read", { id, isRead });
    } catch (error) {
      set({ entries: previous, error: String(error) });
    }
  },

  toggleStar: async (id: number, isStarred: boolean) => {
    const previous = get().entries;
    set({
      entries: previous.map((entry) =>
        entry.id === id ? { ...entry, is_starred: isStarred } : entry,
      ),
    });
    try {
      await invoke("toggle_star", { id, isStarred });
    } catch (error) {
      set({ entries: previous, error: String(error) });
    }
  },

  markAllRead: async () => {
    try {
      await invoke("mark_all_read", { feedId: get().filterFeedId });
      await get().refresh();
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));
