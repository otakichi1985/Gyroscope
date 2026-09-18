import { create } from "zustand";
import { createEntriesStore, type EntriesStoreHook } from "./entriesStore";

export type PaneDirection = "row" | "column";

const STORAGE_KEY = "gyroscope:timeline-panes";

interface StoredShape {
  version: 1;
  dual: boolean;
  direction: PaneDirection;
}

function loadStored(): StoredShape {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, dual: false, direction: "row" };
    const parsed = JSON.parse(raw) as StoredShape;
    if (parsed.version !== 1) return { version: 1, dual: false, direction: "row" };
    return {
      version: 1,
      dual: parsed.dual === true,
      direction: parsed.direction === "column" ? "column" : "row",
    };
  } catch {
    return { version: 1, dual: false, direction: "row" };
  }
}

function persist(dual: boolean, direction: PaneDirection) {
  const shape: StoredShape = { version: 1, dual, direction };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(shape));
}

// Secondary pane's store. Created once at module load so both panes share
// the peer-refresh registry in entriesStore; it only fetches when the dual
// pane is actually shown.
const secondaryStore: EntriesStoreHook = createEntriesStore();

export function getSecondaryEntriesStore(): EntriesStoreHook {
  return secondaryStore;
}

interface PanesState {
  /** Second timeline pane visible. Max 2 panes: a wider split doesn't fit the small resident window. */
  dual: boolean;
  /** row = 左右に並べる, column = 上下に並べる. */
  direction: PaneDirection;
  setDual: (dual: boolean) => void;
  toggleDual: () => void;
  setDirection: (direction: PaneDirection) => void;
}

const initial = loadStored();

export const usePanesStore = create<PanesState>((set, get) => ({
  dual: initial.dual,
  direction: initial.direction,

  setDual: (dual) => {
    set({ dual });
    persist(dual, get().direction);
    if (dual) {
      // Populate the newly shown pane immediately instead of leaving it empty
      // until the next background tick.
      void secondaryStore.getState().refresh();
    }
  },

  toggleDual: () => {
    get().setDual(!get().dual);
  },

  setDirection: (direction) => {
    set({ direction });
    persist(get().dual, direction);
  },
}));
