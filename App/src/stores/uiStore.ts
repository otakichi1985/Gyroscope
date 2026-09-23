import { create } from "zustand";
import type { SettingsSectionId } from "../lib/settingsTabs";

export type Screen = "timeline" | "feedManager" | "history" | "settings" | "trash" | "reader" | "discover";

/* activeScreenを唯一の正本にし、複数画面の同時mountと背面clickを構造で防ぐ。 */

export interface NavEntry {
  screen: Screen;
  readerEntryId: number | null;
}

interface UiState {
  activeScreen: Screen;
  readerEntryId: number | null;
  navStack: NavEntry[];
  navIndex: number;
  pendingSettingsSection: SettingsSectionId | null;
  toggleScreen: (screen: Exclude<Screen, "timeline" | "reader">) => void;
  openReader: (entryId: number) => void;
  openSettingsSection: (section: SettingsSectionId) => void;
  clearPendingSettingsSection: () => void;
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
  pendingSettingsSection: null,
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
  openSettingsSection: (section) =>
    set((s) => {
      const base: Partial<UiState> = {
        activeScreen: "settings",
        readerEntryId: null,
        pendingSettingsSection: section,
      };
      return s.activeScreen === "settings"
        ? base
        : { ...base, ...pushEntry(s, { screen: "settings", readerEntryId: null }) };
    }),
  clearPendingSettingsSection: () => set({ pendingSettingsSection: null }),
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
