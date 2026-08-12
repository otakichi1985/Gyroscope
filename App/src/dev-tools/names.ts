// Human names for what the pointer finds.
//
// This file exists because the whole point of the tool is that the list it
// shows has to read like the app, not like the DOM: "記事カード" rather than
// "div.entry-card". Everything the user is expected to read passes through
// here.
//
// Dev-only. Nothing in src/dev-tools ships (index.css excludes this directory
// from Tailwind's source scan, and App.tsx mounts it behind import.meta.env.DEV).

// Checked with classList.contains, so order is only about which name wins when
// an element carries several: most specific first.
const CLASS_NAMES: readonly (readonly [string, string])[] = [
  ["screen-close-button", "閉じるボタン"],
  ["screen-overlay-header", "画面の見出し"],
  ["screen-overlay", "画面"],
  ["app-titlebar", "タイトルバー"],
  ["app-filterbar", "絞り込みバー"],
  ["timeline-toolbar", "表示切り替えバー"],
  ["timeline-enter", "吹き出し"],
  ["entry-card", "記事カード"],
  ["entry-compact", "記事の行"],
  ["entry-list-scroll", "記事一覧"],
  ["timeline-pane", "タイムライン"],
  ["state-panel", "案内パネル"],
  ["icon-button", "アイコンボタン"],
  ["range-input", "スライダー"],
  ["skin-swatch", "スキンの色見本"],
  ["mouse-spotlight", "カーソルの光"],
  ["idle-bg", "待機中の背景"],
  ["ordinary-arc", "オーディナリーの弧"],
  ["ordinary-reticle", "オーディナリーの照準"],
  ["ordinary-hud", "オーディナリーの装飾"],
  ["terminal-data-stream", "流れる文字"],
  ["accent-text", "配信元の文字"],
  ["panel-bg", "ウィンドウ全体"],
];

const TAG_NAMES: Readonly<Record<string, string>> = {
  IMG: "画像",
  svg: "アイコン",
  BUTTON: "ボタン",
  A: "リンク",
  INPUT: "入力欄",
  TEXTAREA: "入力欄",
  SELECT: "選択欄",
  OPTION: "選択肢",
  H1: "見出し",
  H2: "見出し",
  H3: "見出し",
  P: "文章",
  LI: "項目",
  LABEL: "ラベル",
};

function namedByClass(el: Element): string | null {
  for (const [cls, name] of CLASS_NAMES) {
    if (el.classList.contains(cls)) return name;
  }
  return null;
}

/**
 * A name a person can read. Unnamed elements borrow their nearest named
 * ancestor ("記事カードの中の画像") rather than falling back to a tag name,
 * which would put DOM vocabulary in front of someone who does not read code.
 */
export function describeElement(el: Element): string {
  const byClass = namedByClass(el);
  if (byClass) return byClass;

  const byTag = TAG_NAMES[el.tagName] ?? null;

  let context: string | null = null;
  for (let a = el.parentElement; a; a = a.parentElement) {
    const name = namedByClass(a) ?? TAG_NAMES[a.tagName];
    if (name) {
      context = name;
      break;
    }
  }

  if (byTag && context) return `${context}の中の${byTag}`;
  if (byTag) return byTag;
  if (context) return `${context}の中の部品`;
  return "名前のない部分";
}
