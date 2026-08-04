import { create } from "zustand";
import { DEFAULT_SKIN_ID, SKINS } from "../lib/skins";

export type CardSize = "small" | "medium" | "large";
export type CardGap = "compact" | "normal" | "relaxed";

const CARD_SIZES: CardSize[] = ["small", "medium", "large"];
const CARD_GAPS: CardGap[] = ["compact", "normal", "relaxed"];

const STORAGE_KEY = "rss-widget:appearance";
const MIN_OPACITY = 0.5;
const MAX_OPACITY = 1;

interface StoredAppearance {
  opacity: number;
  skinId: string;
  cardSize: CardSize;
  cardGap: CardGap;
  fontId: string;
  alwaysOnTop: boolean;
  positionLocked: boolean;
  titleBarVisible: boolean;
}

function loadAppearance(): StoredAppearance {
  // 0.6 keeps the same "translucent by default" feel the old hardcoded
  // mica/acrylic opacity classes had, rather than defaulting to fully
  // opaque (which would look like a plain regression for existing users).
  const fallback: StoredAppearance = {
    opacity: 0.6,
    skinId: DEFAULT_SKIN_ID,
    cardSize: "medium",
    cardGap: "normal",
    fontId: "",
    alwaysOnTop: false,
    positionLocked: false,
    titleBarVisible: true,
  };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAppearance>;
    const opacity =
      typeof parsed.opacity === "number" && parsed.opacity >= MIN_OPACITY && parsed.opacity <= MAX_OPACITY
        ? parsed.opacity
        : fallback.opacity;
    const skinId = SKINS.some((s) => s.id === parsed.skinId) ? (parsed.skinId as string) : fallback.skinId;
    const cardSize = CARD_SIZES.includes(parsed.cardSize as CardSize) ? (parsed.cardSize as CardSize) : fallback.cardSize;
    const cardGap = CARD_GAPS.includes(parsed.cardGap as CardGap) ? (parsed.cardGap as CardGap) : fallback.cardGap;
    // fontId is now the actual system font family name (empty string =
    // default/no override) rather than one of a fixed curated set, so there
    // is no static list to validate membership against -- just require it
    // to be a string.
    const fontId = typeof parsed.fontId === "string" ? parsed.fontId : fallback.fontId;
    const alwaysOnTop = typeof parsed.alwaysOnTop === "boolean" ? parsed.alwaysOnTop : fallback.alwaysOnTop;
    const positionLocked = typeof parsed.positionLocked === "boolean" ? parsed.positionLocked : fallback.positionLocked;
    const titleBarVisible =
      typeof parsed.titleBarVisible === "boolean" ? parsed.titleBarVisible : fallback.titleBarVisible;
    return { opacity, skinId, cardSize, cardGap, fontId, alwaysOnTop, positionLocked, titleBarVisible };
  } catch {
    return fallback;
  }
}

function save(state: StoredAppearance) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

interface AppearanceState extends StoredAppearance {
  setOpacity: (value: number) => void;
  setSkin: (id: string) => void;
  setCardSize: (size: CardSize) => void;
  setCardGap: (gap: CardGap) => void;
  setFont: (id: string) => void;
  setAlwaysOnTop: (value: boolean) => void;
  setPositionLocked: (value: boolean) => void;
  setTitleBarVisible: (value: boolean) => void;
}

export const useAppearanceStore = create<AppearanceState>((set, get) => ({
  ...loadAppearance(),

  setOpacity: (value: number) => {
    const opacity = Math.min(MAX_OPACITY, Math.max(MIN_OPACITY, value));
    set({ opacity });
    save({ ...get(), opacity });
  },

  setSkin: (id: string) => {
    set({ skinId: id });
    save({ ...get(), skinId: id });
  },

  setCardSize: (size: CardSize) => {
    set({ cardSize: size });
    save({ ...get(), cardSize: size });
  },

  setCardGap: (gap: CardGap) => {
    set({ cardGap: gap });
    save({ ...get(), cardGap: gap });
  },

  setFont: (id: string) => {
    set({ fontId: id });
    save({ ...get(), fontId: id });
  },

  setAlwaysOnTop: (value: boolean) => {
    set({ alwaysOnTop: value });
    save({ ...get(), alwaysOnTop: value });
  },

  setPositionLocked: (value: boolean) => {
    set({ positionLocked: value });
    save({ ...get(), positionLocked: value });
  },

  setTitleBarVisible: (value: boolean) => {
    set({ titleBarVisible: value });
    save({ ...get(), titleBarVisible: value });
  },
}));
