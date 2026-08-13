import { create } from "zustand";

// Single active-screen model rather than 3 independent booleans: the old
// shape let feedManagerOpen/historyOpen/settingsOpen all be true at once,
// so a screen opened earlier stayed mounted (and clickable) underneath
// whichever one was opened last -- reported as "the settings panel isn't
// visible but clicking still opens it". A single field makes overlapping
// screens structurally impossible, and gives pressing the same icon again
// an obvious meaning: go back to the timeline (home), not "undo one level".
export type Screen = "timeline" | "feedManager" | "history" | "settings" | "trash" | "reader" | "discover";

interface UiState {
  activeScreen: Screen;
  // Which entry the reader pane (Screen "reader") is showing. Only "reader"
  // needs a payload alongside which screen is active -- the other screens
  // are self-contained -- so this lives next to activeScreen rather than in
  // its own store.
  readerEntryId: number | null;
  toggleScreen: (screen: Exclude<Screen, "timeline" | "reader">) => void;
  openReader: (entryId: number) => void;
  goHome: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  activeScreen: "timeline",
  readerEntryId: null,
  toggleScreen: (screen) =>
    set((s) => ({ activeScreen: s.activeScreen === screen ? "timeline" : screen })),
  openReader: (entryId) => set({ activeScreen: "reader", readerEntryId: entryId }),
  goHome: () => set({ activeScreen: "timeline" }),
}));
