export interface Skin {
  id: string;
  label: string;
  /** "R G B" space-separated triplet, for use in rgb(var(...) / alpha). */
  light: string;
  dark: string;
}

export const SKINS: Skin[] = [
  { id: "mono", label: "モノクロ", light: "255 255 255", dark: "23 23 23" },
  { id: "blue", label: "ディープブルー", light: "224 235 255", dark: "10 20 45" },
  { id: "forest", label: "フォレスト", light: "228 240 224", dark: "12 28 18" },
  { id: "sunset", label: "サンセット", light: "255 232 220", dark: "40 16 22" },
];

export const DEFAULT_SKIN_ID = "mono";

export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
