import { create } from "zustand";

// Single active-screen model rather than 3 independent booleans: the old
// shape let feedManagerOpen/historyOpen/settingsOpen all be true at once,
// so a screen opened earlier stayed mounted (and clickable) underneath
// whichever one was opened last -- reported as "the settings panel isn't
// visible but clicking still opens it". A single field makes overlapping
// screens structurally impossible, and gives pressing the same icon again
// an obvious meaning: go back to the timeline (home), not "undo one level".
export type Screen = "timeline" | "feedManager" | "history" | "settings" | "trash" | "reader" | "discover";

export interface NavEntry {
  screen: Screen;
  // Which entry the reader pane (Screen "reader") is showing. Only "reader"
  // needs a payload alongside which screen is active -- the other screens
  // are self-contained -- so this lives in the entry rather than its own field.
  readerEntryId: number | null;
}

interface UiState {
  activeScreen: Screen;
  readerEntryId: number | null;
  // Back/forward history, primarily for the mouse side buttons (auxclick
  // button 3 = back, 4 = forward). Every screen change pushes onto the
  // stack; goBack/goForward move the `navIndex` cursor through it. Branching
  // after going back truncates the forward tail, like a browser history.
  navStack: NavEntry[];
  navIndex: number;
  toggleScreen: (screen: Exclude<Screen, "timeline" | "reader">) => void;
  openReader: (entryId: number) => void;
  goHome: () => void;
  goBack: () => void;
  goForward: () => void;
}

function pushEntry(s: UiState, entry: NavEntry): Pick<UiState, "navStack" | "navIndex"> {
  const stack = s.navStack.slice(0, s.navIndex + 1);
  stack.push(entry);
  return { navStack: stack, navIndex: stack.length - 1 };
}

export const useUiStore = create<UiState>((set) => ({
  activeScreen: "timeline",
  readerEntryId: null,
  navStack: [{ screen: "timeline", readerEntryId: null }],
  navIndex: 0,
  toggleScreen: (screen) =>
    set((s) => {
      const next: Screen = s.activeScreen === screen ? "timeline" : screen;
      return {
        activeScreen: next,
        readerEntryId: null,
        ...pushEntry(s, { screen: next, readerEntryId: null }),
      };
    }),
  openReader: (entryId) =>
    set((s) => ({
      activeScreen: "reader",
      readerEntryId: entryId,
      ...pushEntry(s, { screen: "reader", readerEntryId: entryId }),
    })),
  goHome: () =>
    set((s) => {
      if (s.activeScreen === "timeline") return {};
      return {
        activeScreen: "timeline",
        readerEntryId: null,
        ...pushEntry(s, { screen: "timeline", readerEntryId: null }),
      };
    }),
  goBack: () =>
    set((s) => {
      if (s.navIndex <= 0) return {};
      const idx = s.navIndex - 1;
      const entry = s.navStack[idx];
      return { activeScreen: entry.screen, readerEntryId: entry.readerEntryId, navIndex: idx };
    }),
  goForward: () =>
    set((s) => {
      if (s.navIndex >= s.navStack.length - 1) return {};
      const idx = s.navIndex + 1;
      const entry = s.navStack[idx];
      return { activeScreen: entry.screen, readerEntryId: entry.readerEntryId, navIndex: idx };
    }),
}));
