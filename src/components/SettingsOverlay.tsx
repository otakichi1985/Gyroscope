import { FONTS } from "../lib/fonts";
import { SKINS } from "../lib/skins";
import { useVibrancyMode } from "../hooks/useVibrancyMode";
import { useAppearanceStore, type CardGap, type CardSize } from "../stores/appearanceStore";
import { useUiStore } from "../stores/uiStore";
import { CloseIcon } from "./icons";

const CARD_SIZES: { id: CardSize; label: string }[] = [
  { id: "small", label: "小" },
  { id: "medium", label: "中" },
  { id: "large", label: "大" },
];

const CARD_GAPS: { id: CardGap; label: string }[] = [
  { id: "compact", label: "狭い" },
  { id: "normal", label: "普通" },
  { id: "relaxed", label: "広い" },
];

function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between">
      <span>{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={value}
        onClick={() => onChange(!value)}
        className={`relative h-5 w-9 shrink-0 rounded-full transition-colors duration-150 ${
          value ? "bg-black/40 dark:bg-white/40" : "bg-black/15 dark:bg-white/15"
        }`}
      >
        <span
          className={`absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform duration-150 dark:bg-neutral-200 ${
            value ? "translate-x-4" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export function SettingsOverlay() {
  const closeSettings = useUiStore((s) => s.closeSettings);
  const {
    opacity,
    skinId,
    cardSize,
    cardGap,
    fontId,
    alwaysOnTop,
    positionLocked,
    titleBarVisible,
    setOpacity,
    setSkin,
    setCardSize,
    setCardGap,
    setFont,
    setAlwaysOnTop,
    setPositionLocked,
    setTitleBarVisible,
  } = useAppearanceStore();
  const vibrancy = useVibrancyMode();
  const opacityDisabled = vibrancy === "none";

  return (
    <div className="panel-bg absolute inset-0 z-10 flex flex-col">
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-black/10 px-2 text-sm font-medium dark:border-white/10">
        <span>設定</span>
        <button
          type="button"
          onClick={closeSettings}
          className="flex items-center rounded p-1 opacity-60 transition-colors duration-150 hover:opacity-100 active:bg-black/10 dark:active:bg-white/10"
          aria-label="閉じる"
        >
          <CloseIcon className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="flex flex-col gap-4 overflow-y-auto p-3 text-sm">
        <div>
          <div className="mb-1.5 text-xs font-medium opacity-70">スキン</div>
          <div className="grid grid-cols-2 gap-2">
            {SKINS.map((skin) => (
              <button
                key={skin.id}
                type="button"
                onClick={() => setSkin(skin.id)}
                className={`flex items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                  skinId === skin.id
                    ? "border-black/40 dark:border-white/40"
                    : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
                }`}
              >
                <span
                  className="h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                  style={{ backgroundColor: `rgb(${skin.light})` }}
                />
                {skin.label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between text-xs font-medium opacity-70">
            <span>不透明度</span>
            <span>{Math.round(opacity * 100)}%</span>
          </div>
          <input
            type="range"
            min={0.5}
            max={1}
            step={0.05}
            value={opacity}
            disabled={opacityDisabled}
            onChange={(e) => setOpacity(Number(e.target.value))}
            className="w-full disabled:opacity-40"
          />
          {opacityDisabled && (
            <p className="mt-1 text-xs opacity-60">
              MicaまたはAcrylicが使えない環境のため、不透明度は常に100%になります
            </p>
          )}
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium opacity-70">カードサイズ</div>
          <div className="flex gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
            {CARD_SIZES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCardSize(id)}
                className={`flex-1 rounded px-1.5 py-1 text-xs transition-colors duration-150 ${
                  cardSize === id ? "bg-black/10 dark:bg-white/10" : "opacity-60 hover:opacity-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium opacity-70">カードの間隔</div>
          <div className="flex gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
            {CARD_GAPS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setCardGap(id)}
                className={`flex-1 rounded px-1.5 py-1 text-xs transition-colors duration-150 ${
                  cardGap === id ? "bg-black/10 dark:bg-white/10" : "opacity-60 hover:opacity-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium opacity-70">フォント</div>
          <div className="grid grid-cols-2 gap-2">
            {FONTS.map((font) => (
              <button
                key={font.id}
                type="button"
                onClick={() => setFont(font.id)}
                style={font.cssValue ? { fontFamily: font.cssValue } : undefined}
                className={`rounded border px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                  fontId === font.id
                    ? "border-black/40 dark:border-white/40"
                    : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
                }`}
              >
                {font.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <div className="text-xs font-medium opacity-70">ウィンドウ</div>
          <ToggleRow label="常に最前面に表示" value={alwaysOnTop} onChange={setAlwaysOnTop} />
          <ToggleRow label="位置を固定（ドラッグで動かさない）" value={positionLocked} onChange={setPositionLocked} />
          <ToggleRow label="タイトルバーを表示" value={titleBarVisible} onChange={setTitleBarVisible} />
          {!titleBarVisible && (
            <p className="text-xs opacity-60">
              タイトルバーを隠すと閉じる/最小化ボタンも消えます。トレイメニューか、この設定パネル（外観設定アイコン）から再表示できます
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
