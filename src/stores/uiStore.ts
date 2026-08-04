import { create } from "zustand";

interface UiState {
  feedManagerOpen: boolean;
  openFeedManager: () => void;
  closeFeedManager: () => void;
  toggleFeedManager: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  feedManagerOpen: false,
  openFeedManager: () => set({ feedManagerOpen: true }),
  closeFeedManager: () => set({ feedManagerOpen: false }),
  toggleFeedManager: () => set((state) => ({ feedManagerOpen: !state.feedManagerOpen })),
}));
