export interface FontOption {
  id: string;
  label: string;
  /** CSS font-family value; empty string means "don't override, use the
   * page's default stack". */
  cssValue: string;
}

// All pre-installed on a Japanese Windows 10/11 install, so no web-font
// loading/licensing to worry about.
export const FONTS: FontOption[] = [
  { id: "default", label: "既定", cssValue: "" },
  { id: "yugothic", label: "游ゴシック", cssValue: "'Yu Gothic UI', 'Yu Gothic', sans-serif" },
  { id: "meiryo", label: "メイリオ", cssValue: "Meiryo, sans-serif" },
  { id: "bizud", label: "BIZ UDゴシック", cssValue: "'BIZ UDGothic', sans-serif" },
  { id: "segoe", label: "Segoe UI", cssValue: "'Segoe UI', sans-serif" },
];

export const DEFAULT_FONT_ID = "default";

export function getFont(id: string): FontOption {
  return FONTS.find((f) => f.id === id) ?? FONTS[0];
}
