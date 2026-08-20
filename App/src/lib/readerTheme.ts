import type { ReaderColorPreset } from "../stores/appearanceStore";
import type { Skin } from "./skins";

/// The preset palette offered by the reader's 配色 rows. The swatch color a
/// user taps here (JS side, `readerPresetColor`) is exactly the color that
/// lands on the article text (CSS side, the matching `--reader-preset-*`
/// variable in index.css) -- keep the two in lockstep. Each preset has a
/// light and a dark variant so it stays readable on both themes; the accent
/// follows the current skin.
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

/// The CSS variable a preset resolves to inside `.reader-content`.
export const readerPresetVar = (preset: ReaderColorPreset) => `var(--reader-preset-${preset})`;

function rgbTupleToHex(tuple: string): string {
  const [r, g, b] = tuple.trim().split(/\s+/).map((n) => Number(n));
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

/// The concrete color a preset renders as for the given theme, used to paint
/// the swatches. Mirrors the CSS palette so the swatch preview is truthful.
export function readerPresetColor(preset: ReaderColorPreset, isDark: boolean, skin: Skin): string {
  if (preset === "accent") return rgbTupleToHex(isDark ? skin.accentDark : skin.accentLight);
  const entry = READER_COLOR_PRESETS.find((p) => p.id === preset);
  return entry ? (isDark ? entry.dark : entry.light) : "#000000";
}