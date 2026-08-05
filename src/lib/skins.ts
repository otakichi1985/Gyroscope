export interface Skin {
  id: string;
  label: string;
  /** "R G B" space-separated triplet, for use in rgb(var(...) / alpha). */
  light: string;
  dark: string;
  /** Accent color used for "selected/on" states (tabs, toggles, borders)
   * so each skin reads as its own color scheme rather than only tinting
   * the panel background. Mono stays achromatic on purpose -- that's the
   * point of picking "monochrome".
   *
   * Light-mode accents were re-derived against measured WCAG contrast
   * rather than picked by eye, because the accent carries two jobs at
   * once and the second one is easy to forget:
   *   1. accent-on-panel -- icons and labels drawn in `.accent-text`
   *      directly on `.panel-bg`. Held to >= 4.5:1 (not just the 3:1 that
   *      UI components technically allow), since these read as text.
   *   2. white-on-accent -- `.accent-bg` filled buttons use white labels
   *      (StatePanel's CTA, ReaderOverlay's "ブラウザで全文を読む",
   *      toggle knobs). Also held to >= 4.5:1.
   * Job 2 is what most of the old values failed: a light, punchy accent
   * looks great on the panel and then cannot carry white text at all. */
  accentLight: string;
  accentDark: string;
  /** When true, the skin picker's swatch shows this skin's panel and accent
   * colors split half-and-half instead of a single accent dot -- for the
   * "ハイコントラスト" family specifically, where panel/accent being a
   * deliberately complementary *pair* is the whole point of the skin, so a
   * single-color dot loses that story (user request). */
  dualSwatch?: boolean;
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
    accentLight: "29 78 216",
    accentDark: "96 165 250",
  },
  {
    id: "forest",
    label: "フォレスト",
    light: "228 240 224",
    dark: "12 28 18",
    accentLight: "21 110 60",
    accentDark: "74 222 128",
  },
  {
    id: "sunset",
    label: "サンセット",
    light: "255 232 220",
    dark: "40 16 22",
    accentLight: "154 52 18",
    accentDark: "251 146 96",
  },
  {
    id: "lavender",
    label: "ラベンダー",
    light: "237 231 250",
    dark: "26 20 40",
    accentLight: "109 40 217",
    accentDark: "167 139 250",
  },
  {
    id: "rose",
    label: "ローズ",
    light: "255 228 235",
    dark: "40 16 24",
    accentLight: "190 24 93",
    accentDark: "244 114 182",
  },
  {
    id: "turquoise",
    label: "ターコイズ",
    light: "222 246 243",
    dark: "8 26 25",
    accentLight: "15 118 110",
    accentDark: "45 212 191",
  },
  // Below: a "ハイコントラスト" family rather than a single skin (user
  // request) -- each pairs a saturated panel colour with a
  // complementary-hue accent, rather than the pale same-hue tint the skins
  // above use.
  //
  // Worth knowing if these are ever retuned: complementary hue does NOT
  // imply high contrast. Contrast is a function of *luminance*, and
  // complementary pairs can sit at nearly the same luminance -- the first
  // version of this family did exactly that and measured 1.47:1 accent on
  // panel (essentially invisible), making the "high contrast" skins the
  // worst in the set. The hue relationship is kept for the look; the
  // legibility comes from deliberately pushing the accents much darker
  // than the panel.
  {
    id: "contrast",
    label: "コントラスト・ブルー",
    light: "213 229 252",
    dark: "12 19 33",
    accentLight: "154 52 18",
    accentDark: "251 146 60",
    dualSwatch: true,
  },
  {
    id: "contrast-purple",
    label: "コントラスト・パープル",
    light: "224 212 248",
    dark: "26 15 43",
    accentLight: "120 53 15",
    accentDark: "250 204 21",
    dualSwatch: true,
  },
  {
    id: "contrast-green",
    label: "コントラスト・グリーン",
    light: "206 236 214",
    dark: "10 30 20",
    accentLight: "162 28 113",
    accentDark: "240 90 190",
    dualSwatch: true,
  },
];

export const DEFAULT_SKIN_ID = "mono";

export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
