import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";
import type { Feed, OpmlImportSummary } from "../lib/types";

interface FeedsState {
  feeds: Feed[];
  loading: boolean;
  error: string | null;
  // Genres as a first-class, folder-like list (see commands::feeds::
  // list_genres) rather than derived purely from whatever `feed.folder`
  // strings happen to already be in use -- lets a genre exist (and be
  // picked into) before any feed has been filed into it.
  genres: string[];
  // Whether a manual "refresh all" (see refreshAllFeeds) is in flight --
  // drives FilterBar's spinning refresh icon. Not the same as `loading`
  // above (that's specifically the feed-list fetch, which this doesn't
  // touch directly -- refreshAllFeeds's own effect on `feeds`/entries
  // arrives asynchronously via the "feeds-updated" event, see
  // useFeedsUpdatedListener).
  refreshingAll: boolean;
  // Set/cleared by useFeedsUpdatedListener on "feeds-refresh-start"/
  // "feeds-updated" -- unlike `refreshingAll` (only true for a refresh
  // *this frontend instance* triggered), this reflects any refresh
  // happening anywhere (the scheduler's silent 60s tick included), so
  // FilterBar's ambient pulse dot can indicate background activity that
  // otherwise had no visible signal at all (user feedback).
  backgroundRefreshing: boolean;
  refresh: () => Promise<void>;
  refreshGenres: () => Promise<void>;
  // Resolves to the total new-entry count across the batch (0 = nothing
  // changed) so the caller can decide whether to say so.
  refreshAllFeeds: () => Promise<number>;
  createGenre: (name: string) => Promise<void>;
  deleteGenre: (name: string) => Promise<void>;
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
  genres: [],
  refreshingAll: false,
  backgroundRefreshing: false,

  // Manual "更新" button (TimelineToolbar.tsx) -- doubles as a
  // psychological confirmation ("yes, it's actually checking right now")
  // and a debugging aid for feed errors, on top of the silent 60s
  // scheduler tick (user feedback). `refresh_all_feeds` itself doesn't
  // touch the frontend stores; useFeedsUpdatedListener's "feeds-updated"
  // listener picks up the result once the backend batch completes, same
  // as any other refresh path.
  refreshAllFeeds: async () => {
    set({ refreshingAll: true, error: null });
    try {
      return await invoke<number>("refresh_all_feeds");
    } catch (error) {
      set({ error: String(error) });
      throw error;
    } finally {
      set({ refreshingAll: false });
    }
  },

  refresh: async () => {
    set({ loading: true, error: null });
    try {
      const feeds = await invoke<Feed[]>("list_feeds");
      set({ feeds, loading: false });
    } catch (error) {
      set({ error: String(error), loading: false });
    }
  },

  refreshGenres: async () => {
    try {
      const genres = await invoke<string[]>("list_genres");
      set({ genres });
    } catch (error) {
      set({ error: String(error) });
    }
  },

  createGenre: async (name: string) => {
    await invoke("create_genre", { name });
    await get().refreshGenres();
  },

  deleteGenre: async (name: string) => {
    await invoke("delete_genre", { name });
    await Promise.all([get().refreshGenres(), get().refresh()]);
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
