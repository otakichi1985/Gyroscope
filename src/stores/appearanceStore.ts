import { create } from "zustand";
import { DEFAULT_SKIN_ID, SKINS } from "../lib/skins";

const STORAGE_KEY = "rss-widget:appearance";
const MIN_OPACITY = 0.5;
const MAX_OPACITY = 1;

interface StoredAppearance {
  opacity: number;
  skinId: string;
}

function loadAppearance(): StoredAppearance {
  // 0.6 keeps the same "translucent by default" feel the old hardcoded
  // mica/acrylic opacity classes had, rather than defaulting to fully
  // opaque (which would look like a plain regression for existing users).
  const fallback: StoredAppearance = { opacity: 0.6, skinId: DEFAULT_SKIN_ID };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAppearance>;
    const opacity =
      typeof parsed.opacity === "number" && parsed.opacity >= MIN_OPACITY && parsed.opacity <= MAX_OPACITY
        ? parsed.opacity
        : fallback.opacity;
    const skinId = SKINS.some((s) => s.id === parsed.skinId) ? (parsed.skinId as string) : fallback.skinId;
    return { opacity, skinId };
  } catch {
    return fallback;
  }
}

function save(state: StoredAppearance) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

interface AppearanceState {
  opacity: number;
  skinId: string;
  setOpacity: (value: number) => void;
  setSkin: (id: string) => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  ...loadAppearance(),

  setOpacity: (value: number) => {
    const opacity = Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
    set({ opacity });
    save({ opacity, skinId: get().skinId });
  },

  setSkin: (id: string) => {
    set({ skinId: id });
    save({ opacity: get().opacity, skinId: id });
  },
}));
