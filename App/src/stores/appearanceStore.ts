import { create } from "zustand";
import { DEFAULT_SKIN_ID, SKINS } from "../lib/skins";

export type CardSize = "small" | "medium" | "large";
export type CardGap = "compact" | "normal" | "relaxed";
export type ClickBehavior = "browser" | "reader";
export type ThemeMode = "system" | "light" | "dark";
export type ReaderFontSize = "small" | "medium" | "large" | "xlarge";
export type ReaderLineHeight = "tight" | "normal" | "loose";
export type ReaderColumnWidth = "narrow" | "normal" | "wide";
/** The article body's typeface: follow the app font, gothic (sans) or
 * mincho (serif). "app" inherits the global font setting so the reader does
 * not override a font the user chose for the whole app. */
export type ReaderFontFamily = "app" | "sans" | "serif";
/** Whether code/pre in the article keeps its own monospace face or follows
 * the body font. */
export type ReaderCodeFont = "mono" | "body";
/** A preset tint an element can be given (null = follow the current theme).
 * Presets are theme-adaptive so any choice stays readable on the current
 * surface -- see the `--reader-preset-*` palette in index.css. */
export type ReaderColorPreset = "accent" | "text" | "muted" | "danger" | "warning" | "info" | "success";
/** The reader elements whose meaning is inferred from the article HTML, each
 * independently colorable by the user (null = follow the current theme). */
export type ReaderElementKey = "body" | "heading" | "quote" | "code" | "link";
export type ReaderColors = Record<ReaderElementKey, ReaderColorPreset | null>;

const CARD_SIZES: CardSize[] = ["small", "medium", "large"];
const CARD_GAPS: CardGap[] = ["compact", "normal", "relaxed"];
const READER_FONT_SIZES: ReaderFontSize[] = ["small", "medium", "large", "xlarge"];
const READER_LINE_HEIGHTS: ReaderLineHeight[] = ["tight", "normal", "loose"];
const READER_COLUMN_WIDTHS: ReaderColumnWidth[] = ["narrow", "normal", "wide"];
const READER_FONT_FAMILIES: ReaderFontFamily[] = ["app", "sans", "serif"];
const READER_CODE_FONTS: ReaderCodeFont[] = ["mono", "body"];
const READER_ELEMENT_KEYS: ReaderElementKey[] = ["body", "heading", "quote", "code", "link"];
const READER_COLOR_PRESET_IDS: ReaderColorPreset[] = [
  "accent",
  "text",
  "muted",
  "danger",
  "warning",
  "info",
  "success",
];

const STORAGE_KEY = "gyroscope:appearance";
const MIN_OPACITY = 0.5;
const MAX_OPACITY = 1;

interface StoredAppearance {
  opacity: number;
  skinId: string;
  cardSize: CardSize;
  cardGap: CardGap;
  latinFontId: string;
  japaneseFontId: string;
  alwaysOnTop: boolean;
  positionLocked: boolean;
  titleBarVisible: boolean;
  minimizeToTray: boolean;
  blockImages: boolean;
  clickBehavior: ClickBehavior;
  showIconLabels: boolean;
  titleMarquee: boolean;
  themeMode: ThemeMode;
  readerFontSize: ReaderFontSize;
  readerLineHeight: ReaderLineHeight;
  readerColumnWidth: ReaderColumnWidth;
  readerKeepOpacity: boolean;
  readerFontFamily: ReaderFontFamily;
  readerCodeFont: ReaderCodeFont;
  readerColors: ReaderColors;
  smoothScroll: boolean;
}

function loadAppearance(): StoredAppearance {
  // These values mirror the appearance used while developing and reviewing
  // the app, so a fresh install starts with the same polished presentation.
  const fallback: StoredAppearance = {
    opacity: 0.85,
    skinId: DEFAULT_SKIN_ID,
    cardSize: "medium",
    cardGap: "normal",
    latinFontId: "",
    japaneseFontId: "",
    alwaysOnTop: false,
    positionLocked: false,
    titleBarVisible: false,
    minimizeToTray: true,
    blockImages: false,
    clickBehavior: "reader",
    showIconLabels: true,
    titleMarquee: true,
    themeMode: "system",
    readerFontSize: "medium",
    readerLineHeight: "normal",
    readerColumnWidth: "normal",
    readerKeepOpacity: false,
    readerFontFamily: "app",
    readerCodeFont: "mono",
    readerColors: { body: null, heading: null, quote: null, code: null, link: null },
    // Defaults OFF: the wheel-glide was an addition on top of the actual
    // request (scroll-to-top + Home/End/page keys), so new installs get the
    // native wheel behaviour unless the user turns the glide on in Settings.
    smoothScroll: false,
  };
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return fallback;
  try {
    const parsed = JSON.parse(raw) as Partial<StoredAppearance> & { fontId?: unknown };
    const opacity =
      typeof parsed.opacity === "number" && parsed.opacity >= MIN_OPACITY && parsed.opacity <= MAX_OPACITY
        ? parsed.opacity
        : fallback.opacity;
    const skinId = SKINS.some((s) => s.id === parsed.skinId) ? (parsed.skinId as string) : fallback.skinId;
    const cardSize = CARD_SIZES.includes(parsed.cardSize as CardSize) ? (parsed.cardSize as CardSize) : fallback.cardSize;
    const cardGap = CARD_GAPS.includes(parsed.cardGap as CardGap) ? (parsed.cardGap as CardGap) : fallback.cardGap;
    // Before the Latin/Japanese split, one `fontId` controlled every script.
    // Copy that legacy value into both new fields so existing installations
    // keep exactly the same typography until the user changes either picker.
    const legacyFontId = typeof parsed.fontId === "string" ? parsed.fontId : "";
    const latinFontId =
      typeof parsed.latinFontId === "string" ? parsed.latinFontId : legacyFontId || fallback.latinFontId;
    const japaneseFontId =
      typeof parsed.japaneseFontId === "string"
        ? parsed.japaneseFontId
        : legacyFontId || fallback.japaneseFontId;
    const alwaysOnTop = typeof parsed.alwaysOnTop === "boolean" ? parsed.alwaysOnTop : fallback.alwaysOnTop;
    const positionLocked = typeof parsed.positionLocked === "boolean" ? parsed.positionLocked : fallback.positionLocked;
    const titleBarVisible =
      typeof parsed.titleBarVisible === "boolean" ? parsed.titleBarVisible : fallback.titleBarVisible;
    const minimizeToTray =
      typeof parsed.minimizeToTray === "boolean" ? parsed.minimizeToTray : fallback.minimizeToTray;
    const blockImages = typeof parsed.blockImages === "boolean" ? parsed.blockImages : fallback.blockImages;
    const clickBehavior =
      parsed.clickBehavior === "browser" || parsed.clickBehavior === "reader"
        ? parsed.clickBehavior
        : fallback.clickBehavior;
    const showIconLabels =
      typeof parsed.showIconLabels === "boolean" ? parsed.showIconLabels : fallback.showIconLabels;
    const titleMarquee = typeof parsed.titleMarquee === "boolean" ? parsed.titleMarquee : fallback.titleMarquee;
    const themeMode =
      parsed.themeMode === "system" || parsed.themeMode === "light" || parsed.themeMode === "dark"
        ? parsed.themeMode
        : fallback.themeMode;
    const readerFontSize = READER_FONT_SIZES.includes(parsed.readerFontSize as ReaderFontSize)
      ? (parsed.readerFontSize as ReaderFontSize)
      : fallback.readerFontSize;
    const readerLineHeight = READER_LINE_HEIGHTS.includes(parsed.readerLineHeight as ReaderLineHeight)
      ? (parsed.readerLineHeight as ReaderLineHeight)
      : fallback.readerLineHeight;
    const readerColumnWidth = READER_COLUMN_WIDTHS.includes(parsed.readerColumnWidth as ReaderColumnWidth)
      ? (parsed.readerColumnWidth as ReaderColumnWidth)
      : fallback.readerColumnWidth;
    const readerKeepOpacity =
      typeof parsed.readerKeepOpacity === "boolean" ? parsed.readerKeepOpacity : fallback.readerKeepOpacity;
    const smoothScroll = typeof parsed.smoothScroll === "boolean" ? parsed.smoothScroll : fallback.smoothScroll;
    const readerFontFamily = READER_FONT_FAMILIES.includes(parsed.readerFontFamily as ReaderFontFamily)
      ? (parsed.readerFontFamily as ReaderFontFamily)
      : fallback.readerFontFamily;
    const readerCodeFont = READER_CODE_FONTS.includes(parsed.readerCodeFont as ReaderCodeFont)
      ? (parsed.readerCodeFont as ReaderCodeFont)
      : fallback.readerCodeFont;
    const rawColors = (parsed.readerColors ?? {}) as Partial<ReaderColors>;
    const readerColors = { ...fallback.readerColors };
    for (const key of READER_ELEMENT_KEYS) {
      const value = rawColors[key];
      if (typeof value === "string" && (READER_COLOR_PRESET_IDS as readonly string[]).includes(value)) {
        readerColors[key] = value as ReaderColorPreset;
      }
    }
    return {
      opacity,
      skinId,
      cardSize,
      cardGap,
      latinFontId,
      japaneseFontId,
      alwaysOnTop,
      positionLocked,
      titleBarVisible,
      minimizeToTray,
      blockImages,
      clickBehavior,
      showIconLabels,
      titleMarquee,
      themeMode,
      readerFontSize,
      readerLineHeight,
      readerColumnWidth,
      readerKeepOpacity,
      readerFontFamily,
      readerCodeFont,
      readerColors,
      smoothScroll,
    };
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
  setLatinFont: (id: string) => void;
  setJapaneseFont: (id: string) => void;
  setAlwaysOnTop: (value: boolean) => void;
  setPositionLocked: (value: boolean) => void;
  setTitleBarVisible: (value: boolean) => void;
  setMinimizeToTray: (value: boolean) => void;
  setBlockImages: (value: boolean) => void;
  setClickBehavior: (value: ClickBehavior) => void;
  setShowIconLabels: (value: boolean) => void;
  setTitleMarquee: (value: boolean) => void;
  setThemeMode: (value: ThemeMode) => void;
  setReaderFontSize: (value: ReaderFontSize) => void;
  setReaderLineHeight: (value: ReaderLineHeight) => void;
  setReaderColumnWidth: (value: ReaderColumnWidth) => void;
  setReaderKeepOpacity: (value: boolean) => void;
  setReaderFontFamily: (value: ReaderFontFamily) => void;
  setReaderCodeFont: (value: ReaderCodeFont) => void;
  /** null returns that element to the current theme's color. */
  setReaderColor: (key: ReaderElementKey, value: ReaderColorPreset | null) => void;
  setSmoothScroll: (value: boolean) => void;
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

  setLatinFont: (id: string) => {
    set({ latinFontId: id });
    save({ ...get(), latinFontId: id });
  },

  setJapaneseFont: (id: string) => {
    set({ japaneseFontId: id });
    save({ ...get(), japaneseFontId: id });
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

  setMinimizeToTray: (value: boolean) => {
    set({ minimizeToTray: value });
    save({ ...get(), minimizeToTray: value });
  },

  setBlockImages: (value: boolean) => {
    set({ blockImages: value });
    save({ ...get(), blockImages: value });
  },

  setClickBehavior: (value: ClickBehavior) => {
    set({ clickBehavior: value });
    save({ ...get(), clickBehavior: value });
  },

  setShowIconLabels: (value: boolean) => {
    set({ showIconLabels: value });
    save({ ...get(), showIconLabels: value });
  },

  setTitleMarquee: (value: boolean) => {
    set({ titleMarquee: value });
    save({ ...get(), titleMarquee: value });
  },

  setThemeMode: (value: ThemeMode) => {
    set({ themeMode: value });
    save({ ...get(), themeMode: value });
  },

  setReaderFontSize: (value: ReaderFontSize) => {
    set({ readerFontSize: value });
    save({ ...get(), readerFontSize: value });
  },

  setReaderLineHeight: (value: ReaderLineHeight) => {
    set({ readerLineHeight: value });
    save({ ...get(), readerLineHeight: value });
  },

  setReaderColumnWidth: (value: ReaderColumnWidth) => {
    set({ readerColumnWidth: value });
    save({ ...get(), readerColumnWidth: value });
  },

  setReaderKeepOpacity: (value: boolean) => {
    set({ readerKeepOpacity: value });
    save({ ...get(), readerKeepOpacity: value });
  },

  setReaderFontFamily: (value: ReaderFontFamily) => {
    set({ readerFontFamily: value });
    save({ ...get(), readerFontFamily: value });
  },

  setReaderCodeFont: (value: ReaderCodeFont) => {
    set({ readerCodeFont: value });
    save({ ...get(), readerCodeFont: value });
  },

  setReaderColor: (key: ReaderElementKey, value: string | null) => {
    const readerColors = { ...get().readerColors, [key]: value };
    set({ readerColors });
    save({ ...get(), readerColors });
  },

  setSmoothScroll: (value: boolean) => {
    set({ smoothScroll: value });
    save({ ...get(), smoothScroll: value });
  },
}));
