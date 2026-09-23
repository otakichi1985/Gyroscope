export interface Skin {
  id: string;
  label: string;
  category: "basic" | "contrast" | "style";
  description: string;

  light: string;
  dark: string;

  accentLight: string;
  accentDark: string;

  dualSwatch?: boolean;

  swatchPrimary?: string;
  swatchComplement?: string;
  swatchLight?: string;
  swatchDark?: string;
  visualStyle?: "aurora" | "velvet" | "terminal" | "cardinality" | "ordinary";

  floating?: boolean;
}

export const SKINS: Skin[] = [
  {
    id: "mono",
    label: "モノクロ",
    category: "basic",
    description: "色味を抑えた、最もニュートラルな標準テーマ",
    light: "245 246 248",
    dark: "23 23 23",
    accentLight: "38 38 38",
    accentDark: "212 212 212",
    swatchLight: "82 82 91",
    swatchDark: "212 212 216",
  },
  {
    id: "blue",
    label: "ディープブルー",
    category: "basic",
    description: "静かな青を基調にした、集中しやすい寒色テーマ",
    light: "229 236 248",
    dark: "10 20 45",
    accentLight: "29 78 216",
    accentDark: "96 165 250",
    swatchLight: "59 130 246",
    swatchDark: "96 165 250",
  },
  {
    id: "forest",
    label: "フォレスト",
    category: "basic",
    description: "自然な緑で画面をやわらかく見せるテーマ",
    light: "232 240 230",
    dark: "12 28 18",
    accentLight: "21 110 60",
    accentDark: "74 222 128",
    swatchLight: "45 181 93",
    swatchDark: "74 222 128",
  },
  {
    id: "sunset",
    label: "サンセット",
    category: "basic",
    description: "橙と赤みを含んだ、温かい印象のテーマ",
    light: "248 235 228",
    dark: "40 16 22",
    accentLight: "154 52 18",
    accentDark: "251 146 96",
    swatchLight: "244 112 67",
    swatchDark: "251 146 96",
  },
  {
    id: "lavender",
    label: "ラベンダー",
    category: "basic",
    description: "柔らかな紫を使った、落ち着きのあるテーマ",
    light: "238 233 246",
    dark: "26 20 40",
    accentLight: "109 40 217",
    accentDark: "167 139 250",
    swatchLight: "139 92 246",
    swatchDark: "167 139 250",
  },
  {
    id: "rose",
    label: "ローズ",
    category: "basic",
    description: "鮮やかさを残した上品なローズテーマ",
    light: "248 232 237",
    dark: "40 16 24",
    accentLight: "190 24 93",
    accentDark: "244 114 182",
    swatchLight: "236 72 153",
    swatchDark: "244 114 182",
  },
  {
    id: "turquoise",
    label: "ターコイズ",
    category: "basic",
    description: "軽やかな青緑で、爽やかに見せるテーマ",
    light: "228 241 239",
    dark: "8 26 25",
    accentLight: "15 118 110",
    accentDark: "45 212 191",
    swatchLight: "32 181 170",
    swatchDark: "45 212 191",
  },
  {
    id: "contrast",
    label: "コントラスト・ブルー",
    category: "contrast",
    description: "青と補色の橙を組み合わせた高識別テーマ",
    light: "213 229 252",
    dark: "12 19 33",
    accentLight: "154 52 18",
    accentDark: "251 146 60",
    dualSwatch: true,
    swatchPrimary: "37 99 235",
    swatchComplement: "234 88 12",
  },
  {
    id: "contrast-purple",
    label: "コントラスト・パープル",
    category: "contrast",
    description: "紫と補色の黄を組み合わせた高識別テーマ",
    light: "224 212 248",
    dark: "26 15 43",
    accentLight: "120 53 15",
    accentDark: "250 204 21",
    dualSwatch: true,
    swatchPrimary: "124 58 237",
    swatchComplement: "234 179 8",
  },
  {
    id: "contrast-green",
    label: "コントラスト・グリーン",
    category: "contrast",
    description: "緑と補色のマゼンタを組み合わせた高識別テーマ",
    light: "206 236 214",
    dark: "10 30 20",
    accentLight: "162 28 113",
    accentDark: "240 90 190",
    dualSwatch: true,
    swatchPrimary: "22 163 74",
    swatchComplement: "219 39 119",
  },
  {
    id: "aurora",
    label: "オーロラ",
    category: "style",
    description: "青緑と紫の光が淡く重なる、透明感のあるリッチテーマ",
    light: "237 247 249",
    dark: "8 20 28",
    accentLight: "10 105 122",
    accentDark: "103 232 249",
    dualSwatch: true,
    swatchPrimary: "34 211 238",
    swatchComplement: "168 85 247",
    visualStyle: "aurora",
  },
  {
    id: "velvet",
    label: "ベルベット",
    category: "style",
    description: "ワインレッドと金を使った、深みのあるリッチテーマ",
    light: "250 243 239",
    dark: "31 12 22",
    accentLight: "136 19 55",
    accentDark: "251 191 36",
    dualSwatch: true,
    swatchPrimary: "225 55 104",
    swatchComplement: "245 158 11",
    visualStyle: "velvet",
  },
  {
    id: "terminal",
    label: "ターミナル",
    category: "style",
    description: "蛍光グリーンと等幅書体で組む、CRT端末風の特殊テーマ",
    light: "235 244 232",
    dark: "7 15 10",
    accentLight: "17 94 46",
    accentDark: "74 246 38",
    swatchLight: "42 197 74",
    swatchDark: "74 246 38",
    visualStyle: "terminal",
  },
  {
    id: "link-amber",
    label: "カーディナリティ",
    category: "style",
    description: "直角の白い半透明パネルを橙色一色でまとめた、VR風UIテーマ",
    light: "250 251 253",
    dark: "27 29 33",
    accentLight: "180 83 9",
    accentDark: "251 176 92",
    dualSwatch: true,
    swatchPrimary: "250 251 253",
    swatchComplement: "245 162 0",
    visualStyle: "cardinality",
    floating: true,
  },
  {
    id: "ordinary",
    label: "オーディナリー",
    category: "style",
    description: "白い円形コントロールと情報パネルを機能色で塗り分けた、AR風UIテーマ",
    light: "236 244 249",
    dark: "38 42 48",
    accentLight: "21 101 192",
    accentDark: "125 195 255",
    dualSwatch: true,
    swatchPrimary: "255 255 255",
    swatchComplement: "240 190 51",
    visualStyle: "ordinary",
    floating: true,
  },
];

export const DEFAULT_SKIN_ID = "mono";

export function getSkin(id: string): Skin {
  return SKINS.find((s) => s.id === id) ?? SKINS[0];
}
