import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SKINS } from "../lib/skins";
import { useVibrancyMode } from "../hooks/useVibrancyMode";
import { useAppearanceStore, type CardGap, type CardSize } from "../stores/appearanceStore";
import { useUiStore } from "../stores/uiStore";
import type { DataDirInfo } from "../lib/types";
import { CloseIcon } from "./icons";
import { FontPicker } from "./FontPicker";

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
          value ? "accent-bg" : "bg-black/15 dark:bg-white/15"
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

const OUTLINE_BUTTON =
  "rounded border border-black/10 px-2 py-1 text-xs transition-colors duration-150 hover:border-black/20 " +
  "active:bg-black/10 disabled:opacity-50 dark:border-white/10 dark:hover:border-white/20 dark:active:bg-white/10";

function DataDirSection() {
  const [info, setInfo] = useState<DataDirInfo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingRestart, setPendingRestart] = useState(false);

  useEffect(() => {
    invoke<DataDirInfo>("get_data_dir_info")
      .then(setInfo)
      .catch((e) => setError(String(e)));
  }, []);

  const applyNewDir = async (path: string | null) => {
    setBusy(true);
    setError(null);
    try {
      await invoke("set_data_dir", { path });
      setPendingRestart(true);
    } catch (e) {
      setError(String(e));
    } finally {
      setBusy(false);
    }
  };

  const handleChange = async () => {
    const selected = await open({ directory: true, multiple: false });
    if (typeof selected === "string") {
      await applyNewDir(selected);
    }
  };

  const handleRestart = () => {
    invoke("restart_app").catch((e) => setError(String(e)));
  };

  if (pendingRestart) {
    return (
      <div>
        <div className="mb-1.5 text-xs font-medium opacity-70">データ保存先</div>
        <div className="flex flex-col gap-2 rounded border border-black/10 p-2 text-xs dark:border-white/10">
          <p>変更を反映するには再起動が必要です</p>
          <button type="button" onClick={handleRestart} className={`${OUTLINE_BUTTON} accent-border self-start`}>
            今すぐ再起動
          </button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-1.5 text-xs font-medium opacity-70">データ保存先</div>
      <div className="flex flex-col gap-1.5">
        {info?.is_portable && (
          <span className="accent-text w-fit rounded bg-black/5 px-1.5 py-0.5 text-[10px] font-medium dark:bg-white/5">
            ポータブル版（パッケージ内に保存）
          </span>
        )}
        <p className="break-all rounded bg-black/5 px-2 py-1.5 font-mono text-[11px] dark:bg-white/5">
          {info?.path ?? "読み込み中..."}
        </p>
        {info?.fallback_reason && <p className="text-xs text-red-500">{info.fallback_reason}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={handleChange} disabled={busy} className={OUTLINE_BUTTON}>
            変更...
          </button>
          {info?.is_custom && (
            <button type="button" onClick={() => applyNewDir(null)} disabled={busy} className={OUTLINE_BUTTON}>
              既定に戻す
            </button>
          )}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    </div>
  );
}

export function SettingsOverlay() {
  const activeScreen = useUiStore((s) => s.activeScreen);
  const goHome = useUiStore((s) => s.goHome);
  const isActive = activeScreen === "settings";
  const {
    opacity,
    skinId,
    cardSize,
    cardGap,
    fontId,
    alwaysOnTop,
    positionLocked,
    titleBarVisible,
    minimizeToTray,
    setOpacity,
    setSkin,
    setCardSize,
    setCardGap,
    setFont,
    setAlwaysOnTop,
    setPositionLocked,
    setTitleBarVisible,
    setMinimizeToTray,
  } = useAppearanceStore();
  const vibrancy = useVibrancyMode();
  const opacityDisabled = vibrancy === "none";

  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);
  useEffect(() => {
    invoke<string[]>("list_system_fonts")
      .then(setSystemFonts)
      .catch(() => setSystemFonts([]));
  }, []);

  return (
    <div
      className={`panel-bg absolute inset-0 z-10 flex flex-col transition-all duration-200 ease-out ${
        isActive ? "translate-x-0 opacity-100" : "translate-x-3 opacity-0 pointer-events-none"
      }`}
      inert={!isActive}
    >
      <div className="flex h-8 shrink-0 items-center justify-between border-b border-black/10 px-2 text-sm font-medium dark:border-white/10">
        <span>設定</span>
        <button
          type="button"
          onClick={goHome}
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
                    ? "accent-border"
                    : "border-black/10 hover:border-black/20 dark:border-white/10 dark:hover:border-white/20"
                }`}
              >
                <span
                  className="skin-swatch h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                  style={
                    {
                      "--swatch-rgb-light": skin.accentLight,
                      "--swatch-rgb-dark": skin.accentDark,
                    } as React.CSSProperties
                  }
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
                  cardSize === id ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
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
                  cardGap === id ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        <div>
          <div className="mb-1.5 text-xs font-medium opacity-70">フォント</div>
          <FontPicker value={fontId} options={systemFonts} onChange={setFont} />
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
          <ToggleRow
            label="閉じるボタンでタスクトレイに格納"
            value={minimizeToTray}
            onChange={setMinimizeToTray}
          />
          <p className="text-xs opacity-60">
            {minimizeToTray
              ? "×ボタンで閉じてもタスクトレイに常駐します。終了するにはトレイメニューの「終了」を選んでください"
              : "×ボタンで閉じるとアプリを終了します"}
          </p>
        </div>

        <DataDirSection />
      </div>
    </div>
  );
}
