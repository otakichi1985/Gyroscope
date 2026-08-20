import { getSkin, type Skin } from "../lib/skins";
import { READER_COLOR_PRESETS, readerPresetColor } from "../lib/readerTheme";
import { useIsDark } from "../lib/useIsDark";
import {
  useAppearanceStore,
  type ReaderCodeFont,
  type ReaderColorPreset,
  type ReaderColumnWidth,
  type ReaderElementKey,
  type ReaderFontFamily,
  type ReaderFontSize,
  type ReaderLineHeight,
} from "../stores/appearanceStore";

const FONT_SIZES: { id: ReaderFontSize; label: string }[] = [
  { id: "small", label: "小" },
  { id: "medium", label: "中" },
  { id: "large", label: "大" },
  { id: "xlarge", label: "特大" },
];

const LINE_HEIGHTS: { id: ReaderLineHeight; label: string }[] = [
  { id: "tight", label: "狭い" },
  { id: "normal", label: "標準" },
  { id: "loose", label: "広い" },
];

const COLUMN_WIDTHS: { id: ReaderColumnWidth; label: string }[] = [
  { id: "narrow", label: "狭い" },
  { id: "normal", label: "標準" },
  { id: "wide", label: "広い" },
];

const FONT_FAMILIES: { id: ReaderFontFamily; label: string }[] = [
  { id: "app", label: "アプリのフォント" },
  { id: "sans", label: "ゴシック" },
  { id: "serif", label: "明朝" },
];

const CODE_FONTS: { id: ReaderCodeFont; label: string }[] = [
  { id: "mono", label: "等幅" },
  { id: "body", label: "本文に合わせる" },
];

// The reader can infer the *role* of each piece of text from the article's
// own markup (headings, quotes, code, links) -- so each role is offered as an
// independently overridable color, with the current theme as the default.
const COLOR_ROWS: { key: ReaderElementKey; label: string }[] = [
  { key: "body", label: "本文" },
  { key: "heading", label: "見出し" },
  { key: "quote", label: "引用" },
  { key: "code", label: "コード" },
  { key: "link", label: "リンク" },
];

function SegmentedGroup<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { id: T; label: string }[];
  onChange: (next: T) => void;
}) {
  return (
    <div className="min-w-0">
      <div className="mb-1 text-[10px] font-medium opacity-70">{label}</div>
      <div className="flex gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
        {options.map(({ id, label: optionLabel }) => (
          <button
            key={id}
            type="button"
            onClick={() => onChange(id)}
            className={`min-w-0 flex-1 rounded px-1 py-1 text-xs transition-colors duration-150 ${
              value === id ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
            }`}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function ToggleRow({ label, value, onChange }: { label: string; value: boolean; onChange: (next: boolean) => void }) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
          value ? "toggle-on accent-bg" : "bg-black/15 dark:bg-white/15"
        }`}
      >
        <span
          className={`toggle-thumb absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-[transform,background-color,box-shadow] duration-150 dark:bg-neutral-200 ${
            value ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

/// One colorable element (本文/見出し/引用/コード/リンク): a row of preset
/// swatches plus a hollow "テーマの色" swatch to return to the theme. Presets
/// are theme-adaptive (see lib/readerTheme.ts), so any tap lands on a color
/// that stays readable on the current surface -- quicker than a free picker.
function ColorRow({
  label,
  value,
  skin,
  isDark,
  onChange,
}: {
  label: string;
  value: ReaderColorPreset | null;
  skin: Skin;
  isDark: boolean;
  onChange: (next: ReaderColorPreset | null) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-14 shrink-0 text-xs opacity-70">{label}</span>
      <div className="flex flex-1 items-center gap-1.5">
        <button
          type="button"
          title="テーマの色"
          aria-label={`${label}: テーマの色`}
          aria-pressed={value === null}
          onClick={() => onChange(null)}
          className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border transition-transform duration-150 hover:scale-110 ${
            value === null
              ? "border-current ring-2 ring-current ring-offset-1"
              : "border-black/30 dark:border-white/30"
          }`}
        >
          <span className="h-2 w-2 rounded-full border border-current opacity-40" />
        </button>
        {READER_COLOR_PRESETS.map((preset) => {
          const color = readerPresetColor(preset.id, isDark, skin);
          const selected = value === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              title={preset.label}
              aria-label={`${label}: ${preset.label}`}
              aria-pressed={selected}
              data-color={color}
              onClick={() => onChange(preset.id)}
              className={`h-5 w-5 shrink-0 rounded-full transition-transform duration-150 hover:scale-110 ${
                selected ? "ring-2 ring-current ring-offset-1" : "border border-black/20 dark:border-white/25"
              }`}
              style={{ backgroundColor: color }}
            />
          );
        })}
      </div>
    </div>
  );
}

/// Shared controls for the reader's "文字設定" panel and the 設定 overlay's
/// リーダー section -- both write to the same appearance store, so they stay
/// in sync wherever the user adjusts them. The "不透明度を保つ" toggle only
/// matters for floating skins (CSS-driven opacity); opaque skins use native
/// window alpha that this app cannot raise per-screen, so it is hidden there.
export function ReaderSettingsControls() {
  const store = useAppearanceStore();
  const floating = getSkin(store.skinId).floating === true;
  const isDark = useIsDark();
  const skin = getSkin(store.skinId);

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-3 gap-2">
        <SegmentedGroup label="文字サイズ" value={store.readerFontSize} options={FONT_SIZES} onChange={store.setReaderFontSize} />
        <SegmentedGroup label="行間" value={store.readerLineHeight} options={LINE_HEIGHTS} onChange={store.setReaderLineHeight} />
        <SegmentedGroup label="列幅" value={store.readerColumnWidth} options={COLUMN_WIDTHS} onChange={store.setReaderColumnWidth} />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SegmentedGroup label="本文フォント" value={store.readerFontFamily} options={FONT_FAMILIES} onChange={store.setReaderFontFamily} />
        <SegmentedGroup label="コードフォント" value={store.readerCodeFont} options={CODE_FONTS} onChange={store.setReaderCodeFont} />
      </div>
      {floating && (
        <ToggleRow
          label="記事を開いている間は不透明度を保つ"
          value={store.readerKeepOpacity}
          onChange={store.setReaderKeepOpacity}
        />
      )}
      <div className="flex flex-col gap-1.5 border-t border-black/10 pt-2 dark:border-white/10">
        <div className="text-[10px] font-medium opacity-70">配色（要素ごと）</div>
        {COLOR_ROWS.map(({ key, label }) => (
          <ColorRow
            key={key}
            label={label}
            value={store.readerColors[key]}
            skin={skin}
            isDark={isDark}
            onChange={(v) => store.setReaderColor(key, v)}
          />
        ))}
      </div>
      <p className="max-w-[72ch] text-xs leading-relaxed opacity-70">
        記事本文の文字の見え方を調整します。元サイトの色や文字サイズの指定は読書画面では取り除かれ、ここでの設定と現在のテーマに従います
      </p>
    </div>
  );
}