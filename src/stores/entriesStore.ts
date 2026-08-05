import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Entry } from "../lib/types";

export type ViewMode = "card" | "list" | "compact";

const PAGE_SIZE = 200;
const VIEW_MODE_KEY = "rss-widget:view-mode";
const SEARCH_DEBOUNCE_MS = 300;

function loadViewMode(): ViewMode {
  const stored = localStorage.getItem(VIEW_MODE_KEY);
  return stored === "card" || stored === "list" || stored === "compact" ? stored : "card";
}

let searchDebounceTimer: ReturnType<typeof setTimeout> | undefined;
let optimisticMutationId = 0;
const latestOptimisticMutation = new Map<string, number>();
// Only the newest list request may update the screen. Rapid search/filter
// changes can otherwise resolve out of order and show stale results.
let listRequestId = 0;

interface EntriesState {
  entries: Entry[];
  loading: boolean;
  loadingMore: boolean;
  hasMore: boolean;
  error: string | null;
  filterFeedId: number | null;
  filterFolder: string | null;
  starredOnly: boolean;
  searchQuery: string;
  viewMode: ViewMode;

  refresh: () => Promise<void>;
  fetchMore: () => Promise<void>;
  setFilterFeedId: (feedId: number | null) => Promise<void>;
  setFilterFolder: (folder: string | null) => Promise<void>;
  setStarredOnly: (value: boolean) => Promise<void>;
  setSearchQuery: (query: string) => void;
  setViewMode: (mode: ViewMode) => void;
  markRead: (id: number, isRead: boolean) => Promise<void>;
  toggleStar: (id: number, isStarred: boolean) => Promise<void>;
  deleteEntry: (id: number) => Promise<void>;
  markAllRead: () => Promise<void>;
  markAllUnread: () => Promise<void>;
}

export const useEntriesStore = create<EntriesState>((set, get) => ({
  entries: [],
  loading: false,
  loadingMore: false,
  hasMore: true,
  error: null,
  filterFeedId: null,
  filterFolder: null,
  starredOnly: false,
  searchQuery: "",
  viewMode: loadViewMode(),

  refresh: async () => {
    const requestId = ++listRequestId;
    set({ loading: true, loadingMore: false, error: null });
    try {
      const entries = await invoke<Entry[]>("list_entries", {
        filter: {
          feed_id: get().filterFeedId,
          folder: get().filterFolder,
          unread_only: null,
          starred_only: get().starredOnly || null,
          query: get().searchQuery.trim() || null,
          limit: PAGE_SIZE,
          offset: 0,
        },
      });
      if (requestId !== listRequestId) return;
      set({ entries, hasMore: entries.length === PAGE_SIZE, loading: false });
    } catch (error) {
      if (requestId !== listRequestId) return;
      set({ error: String(error), loading: false });
    }
  },

  fetchMore: async () => {
    if (get().loadingMore || !get().hasMore) return;
    const requestId = listRequestId;
    set({ loadingMore: true });
    try {
      const more = await invoke<Entry[]>("list_entries", {
        filter: {
          feed_id: get().filterFeedId,
          folder: get().filterFolder,
          unread_only: null,
          starred_only: get().starredOnly || null,
          query: get().searchQuery.trim() || null,
          limit: PAGE_SIZE,
          offset: get().entries.length,
        },
      });
      if (requestId !== listRequestId) return;
      set((state) => ({
        entries: [...state.entries, ...more],
        hasMore: more.length === PAGE_SIZE,
        loadingMore: false,
      }));
    } catch (error) {
      if (requestId !== listRequestId) return;
      set({ error: String(error), loadingMore: false });
    }
  },

  setFilterFeedId: async (feedId: number | null) => {
    set({ filterFeedId: feedId, filterFolder: null });
    await get().refresh();
  },

  setFilterFolder: async (folder: string | null) => {
    set({ filterFolder: folder, filterFeedId: null });
    await get().refresh();
  },

  setStarredOnly: async (value: boolean) => {
    set({ starredOnly: value });
    await get().refresh();
  },

  // Local SQLite is fast enough that this debounce isn't strictly needed for
  // latency -- it's here to avoid a full list re-fetch/re-render on every
  // single keystroke while typing.
  setSearchQuery: (query: string) => {
    set({ searchQuery: query });
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = setTimeout(() => {
      get().refresh();
    }, SEARCH_DEBOUNCE_MS);
  },

  setViewMode: (mode: ViewMode) => {
    set({ viewMode: mode });
    localStorage.setItem(VIEW_MODE_KEY, mode);
  },

  markRead: async (id: number, isRead: boolean) => {
    const mutationKey = `read:${id}`;
    const mutationId = ++optimisticMutationId;
    latestOptimisticMutation.set(mutationKey, mutationId);
    const previousValue = get().entries.find((entry) => entry.id === id)?.is_read;
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id ? { ...entry, is_read: isRead } : entry,
      ),
    }));
    try {
      await invoke("mark_entry_read", { id, isRead });
    } catch (error) {
      if (latestOptimisticMutation.get(mutationKey) === mutationId) {
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id && previousValue !== undefined
              ? { ...entry, is_read: previousValue }
              : entry,
          ),
          error: String(error),
        }));
      }
    } finally {
      if (latestOptimisticMutation.get(mutationKey) === mutationId) {
        latestOptimisticMutation.delete(mutationKey);
      }
    }
  },

  toggleStar: async (id: number, isStarred: boolean) => {
    const mutationKey = `star:${id}`;
    const mutationId = ++optimisticMutationId;
    latestOptimisticMutation.set(mutationKey, mutationId);
    const previousValue = get().entries.find((entry) => entry.id === id)?.is_starred;
    set((state) => ({
      entries: state.entries.map((entry) =>
        entry.id === id ? { ...entry, is_starred: isStarred } : entry,
      ),
    }));
    try {
      await invoke("toggle_star", { id, isStarred });
    } catch (error) {
      if (latestOptimisticMutation.get(mutationKey) === mutationId) {
        set((state) => ({
          entries: state.entries.map((entry) =>
            entry.id === id && previousValue !== undefined
              ? { ...entry, is_starred: previousValue }
              : entry,
          ),
          error: String(error),
        }));
      }
    } finally {
      if (latestOptimisticMutation.get(mutationKey) === mutationId) {
        latestOptimisticMutation.delete(mutationKey);
      }
    }
  },

  // Soft-delete (see commands::entries::delete_entry) -- the entry moves to
  // the bookmark trash, so it's removed from this list optimistically same
  // as the other actions here, but never restored back into it locally
  // (the user has to go through TrashOverlay to bring it back, which
  // re-fetches from list_entries on its own).
  deleteEntry: async (id: number) => {
    const previous = get().entries;
    const removedEntry = previous.find((entry) => entry.id === id);
    const removedIndex = previous.findIndex((entry) => entry.id === id);
    set({ entries: previous.filter((entry) => entry.id !== id) });
    try {
      await invoke("delete_entry", { id });
    } catch (error) {
      set((state) => {
        if (!removedEntry || state.entries.some((entry) => entry.id === id)) {
          return { error: String(error) };
        }
        const entries = [...state.entries];
        entries.splice(Math.min(removedIndex, entries.length), 0, removedEntry);
        return { entries, error: String(error) };
      });
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

  markAllUnread: async () => {
    try {
      await invoke("mark_all_unread", { feedId: get().filterFeedId });
      await get().refresh();
    } catch (error) {
      set({ error: String(error) });
    }
  },
}));
