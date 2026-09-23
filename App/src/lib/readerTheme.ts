import type {
  ReaderCodeFont,
  ReaderColorPreset,
  ReaderColors,
  ReaderColumnWidth,
  ReaderElementKey,
  ReaderFontFamily,
  ReaderFontSize,
  ReaderLineHeight,
} from "../stores/appearanceStore";
import type { Skin } from "./skins";

export const READER_COLOR_PRESETS: {
  id: ReaderColorPreset;
  label: string;
  light: string;
  dark: string;
}[] = [
  { id: "accent", label: "アクセント", light: "", dark: "" },
  { id: "text", label: "本文の文字色", light: "#111827", dark: "#f3f4f6" },
  { id: "muted", label: "薄い文字", light: "#6b7280", dark: "#9ca3af" },
  { id: "danger", label: "赤", light: "#dc2626", dark: "#f87171" },
  { id: "warning", label: "橙", light: "#ea580c", dark: "#fb923c" },
  { id: "info", label: "青", light: "#2563eb", dark: "#93c5fd" },
  { id: "success", label: "緑", light: "#16a34a", dark: "#86efac" },
];

export const readerPresetVar = (preset: ReaderColorPreset) => `var(--reader-preset-${preset})`;

const FONT_SIZE: Record<ReaderFontSize, string> = {
  small: "13px",
  medium: "15px",
  large: "17px",
  xlarge: "19px",
};
const LINE_HEIGHT: Record<ReaderLineHeight, string> = {
  tight: "1.5",
  normal: "1.75",
  loose: "2.05",
};
const COLUMN_WIDTH: Record<ReaderColumnWidth, string> = {
  narrow: "32em",
  normal: "40em",
  wide: "50em",
};
const FONT_FAMILY: Record<ReaderFontFamily, string> = {
  app: "inherit",
  sans: `system-ui, -apple-system, "Segoe UI", "Yu Gothic UI", "Hiragino Kaku Gothic ProN", Meiryo, sans-serif`,
  serif: `"Yu Mincho", "Hiragino Mincho ProN", "Noto Serif JP", "MS PMincho", serif`,
};
const ELEMENT_COLOR: Record<ReaderElementKey, string> = {
  body: "--reader-color-body",
  heading: "--reader-color-heading",
  quote: "--reader-color-quote",
  code: "--reader-color-code",
  link: "--reader-color-link",
};
const CODE_FONT_MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";

interface ReaderStyleSettings {
  fontSize: ReaderFontSize;
  lineHeight: ReaderLineHeight;
  columnWidth: ReaderColumnWidth;
  fontFamily: ReaderFontFamily;
  codeFont: ReaderCodeFont;
  colors: ReaderColors;
}

/* Readerとサイト探索の全文表示で同じ設定値を同じCSS変数へ写す。 */
export function readerStyleVariables(settings: ReaderStyleSettings): Record<string, string> {
  const variables: Record<string, string> = {
    "--reader-font-size": FONT_SIZE[settings.fontSize],
    "--reader-line-height": LINE_HEIGHT[settings.lineHeight],
    "--reader-max-width": COLUMN_WIDTH[settings.columnWidth],
    "--reader-font-family": FONT_FAMILY[settings.fontFamily],
    "--reader-code-font-family":
      settings.codeFont === "mono" ? CODE_FONT_MONO : "var(--reader-font-family)",
  };
  for (const key of Object.keys(ELEMENT_COLOR) as ReaderElementKey[]) {
    const preset = settings.colors[key];
    if (preset) variables[ELEMENT_COLOR[key]] = readerPresetVar(preset);
  }
  return variables;
}

function rgbTupleToHex(tuple: string): string {
  const [r, g, b] = tuple.trim().split(/\s+/).map((n) => Number(n));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function readerPresetColor(preset: ReaderColorPreset, isDark: boolean, skin: Skin): string {
  if (preset === "accent") return rgbTupleToHex(isDark ? skin.accentDark : skin.accentLight);
  const entry = READER_COLOR_PRESETS.find((p) => p.id === preset);
  return entry ? (isDark ? entry.dark : entry.light) : "#000000";
}
