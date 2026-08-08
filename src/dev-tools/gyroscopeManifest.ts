// Everything in this file is Gyroscope-specific knowledge that the editor
// overlay's core (EditorOverlay.tsx, useElementSource.ts) does not need to
// know about. If this ever gets pulled out into a standalone tool that
// attaches to a *different* app, this is the one file a new project would
// replace -- see UI-TOOLING.md §6/§8 and the plan this was built from.
//
// Dev-only by construction: only imported from EditorOverlay.tsx, which is
// itself only reachable behind `import.meta.env.DEV` (see App.tsx). Nothing
// here ships in a production build.

import { getSkin, SKINS } from "../lib/skins";
import { useAppearanceStore } from "../stores/appearanceStore";
import { useEntriesStore } from "../stores/entriesStore";

/** The CSS custom properties App.tsx writes onto the root panel element from
 * the active skin (see App.tsx's `panelStyle`). Editing these live-previews
 * by overriding the same custom properties on that same root element --
 * every `.accent-*`/`.panel-bg` consumer picks the change up for free. */
export interface SkinColorToken {
  id: string;
  label: string;
  source: string;
  cssVar: "--panel-rgb-light" | "--panel-rgb-dark" | "--accent-rgb-light" | "--accent-rgb-dark";
  value: string;
}

/** Only the *currently active* skin's colors are offered -- the CSS
 * variables are global (one value active at a time), so editing a skin you
 * are not looking at would silently do nothing visible. */
export function getActiveSkinColorTokens(): SkinColorToken[] {
  const skinId = useAppearanceStore.getState().skinId;
  const skin = getSkin(skinId);
  return [
    {
      id: "panelLight",
      label: `${skin.label} — パネル色（ライト）`,
      source: `lib/skins.ts の "${skin.id}" スキン (light)`,
      cssVar: "--panel-rgb-light",
      value: skin.light,
    },
    {
      id: "panelDark",
      label: `${skin.label} — パネル色（ダーク）`,
      source: `lib/skins.ts の "${skin.id}" スキン (dark)`,
      cssVar: "--panel-rgb-dark",
      value: skin.dark,
    },
    {
      id: "accentLight",
      label: `${skin.label} — アクセント色（ライト）`,
      source: `lib/skins.ts の "${skin.id}" スキン (accentLight)。パネル上の文字/アイコンと、\
塗りつぶしボタンの地色の両方に使われる（両方のコントラストを保つこと）`,
      cssVar: "--accent-rgb-light",
      value: skin.accentLight,
    },
    {
      id: "accentDark",
      label: `${skin.label} — アクセント色（ダーク）`,
      source: `lib/skins.ts の "${skin.id}" スキン (accentDark)`,
      cssVar: "--accent-rgb-dark",
      value: skin.accentDark,
    },
  ];
}

/** Sanity check purely so this file fails loudly (a TS error) if skins.ts's
 * shape ever changes in a way this manifest doesn't know about yet. */
export const KNOWN_SKIN_IDS: readonly string[] = SKINS.map((s) => s.id);

/** Properties this project has a documented reason to warn about when
 * someone tries to edit them -- see UI-TOOLING.md §7.2, the table this list
 * is transcribed from. Matched against the CSS property name being edited. */
export const PROPERTY_WARNINGS: Record<string, string> = {
  "backdrop-filter":
    "現在のスキンが「浮遊」タイプ（カーディナリティ／オーディナリー）でない限り、この項目は見た目に一切影響しません" +
    "（不透明なパネルの上ではぼかす対象が単色しかないため）。",
  "box-shadow":
    "浮遊モードのカード同士が隣接する場面では、広がりの大きい影がすき間を埋めて画面全体が暗く見えることがあります。",
};

/** State-toggle presets (UI-TOOLING.md §4.2, lightweight version) -- reuse
 * the app's own store setters rather than a separate simulation, so this
 * is inspecting the actually-running app, not a mock of it. */
export interface StatePreset {
  id: string;
  label: string;
  apply: () => void;
}

export const STATE_PRESETS: StatePreset[] = [
  {
    id: "loading",
    label: "読み込み中（スケルトン）",
    apply: () => useEntriesStore.setState({ entries: [], loading: true, error: null }),
  },
  {
    id: "empty",
    label: "記事が0件",
    apply: () =>
      useEntriesStore.setState({ entries: [], loading: false, error: null, searchQuery: "", starredOnly: false }),
  },
  {
    id: "error",
    label: "エラー表示",
    apply: () => useEntriesStore.setState({ entries: [], loading: false, error: "（編集モードによるテスト表示）通信エラーが発生しました" }),
  },
  {
    id: "restore",
    label: "元の一覧に戻す",
    apply: () => {
      useEntriesStore.setState({ error: null });
      void useEntriesStore.getState().refresh();
    },
  },
];
