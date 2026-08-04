export interface Skin {
  id: string;
  label: string;
  /** "R G B" space-separated triplet, for use in rgb(var(...) / alpha). */
  light: string;
  dark: string;
  /** Accent color used for "selected/on" states (tabs, toggles, borders)
   * so each skin reads as its own color scheme rather than only tinting
   * the panel background. Mono stays achromatic on purpose -- that's the
   * point of picking "monochrome". */
  accentLight: string;
  accentDark: string;
}

export const SKINS: Skin[] = [
  {
    id: "mono",
    label: "モノクロ",
    light: "255 255 255",
    dark: "23 23 23",
    accentLight: "38 38 38",
    accentDark: "212 212 212",
  },
  {
    id: "blue",
    label: "ディープブルー",
    light: "224 235 255",
    dark: "10 20 45",
    accentLight: "37 99 235",
    accentDark: "96 165 250",
  },
  {
    id: "forest",
    label: "フォレスト",
    light: "228 240 224",
    dark: "12 28 18",
    accentLight: "22 130 70",
    accentDark: "74 222 128",
  },
  {
    id: "sunset",
    label: "サンセット",
    light: "255 232 220",
    dark: "40 16 22",
    accentLight: "217 87 40",
    accentDark: "251 146 96",
  },
];

export const DEFAULT_SKIN_ID = "mono";

export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
