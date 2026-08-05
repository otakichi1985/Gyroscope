import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SKINS } from "../lib/skins";
import { useVibrancyMode } from "../hooks/useVibrancyMode";
import { useAppearanceStore, type CardGap, type CardSize, type ClickBehavior } from "../stores/appearanceStore";
import type { DataDirInfo } from "../lib/types";
import { FontPicker } from "./FontPicker";
import { ScreenOverlay } from "./ScreenOverlay";

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

const CLICK_BEHAVIORS: { id: ClickBehavior; label: string }[] = [
  { id: "browser", label: "既定のブラウザ" },
  { id: "reader", label: "アプリ内で読む" },
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

const RETENTION_OPTIONS: { value: string; label: string }[] = [
  { value: "unlimited", label: "無期限" },
  { value: "7", label: "7日" },
  { value: "30", label: "30日" },
  { value: "90", label: "90日" },
];

// 閲覧履歴（既読の記録、HistoryOverlay）だけを対象にした自動削除の保持期間。
// 記事本体やブックマークには影響しない -- see scheduler::cleanup_read_history.
function HistoryRetentionSection() {
  const [days, setDays] = useState<number | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    invoke<number | null>("get_read_history_retention")
      .then(setDays)
      .catch((e) => setError(String(e)));
  }, []);

  // While `days` is still loading (undefined), show "無期限" rather than an
  // empty string that matches none of the <option> values below --
  // `Number("")` is 0, not NaN, so a stray change event firing against that
  // unmatched blank value would have silently stored a 0-day retention
  // (i.e. delete everything, every tick) instead of failing loudly.
  // Disabling the <select> during that window closes the gap entirely.
  const value = days === undefined || days === null ? "unlimited" : String(days);

  const handleChange = async (next: string) => {
    const parsed = next === "unlimited" ? null : Number(next);
    setDays(parsed);
    try {
      await invoke("set_read_history_retention", { days: parsed });
    } catch (e) {
      setError(String(e));
    }
  };

  return (
    <div>
      <div className="mb-1.5 text-xs font-medium opacity-70">閲覧履歴の保持期間</div>
      <select
        value={value}
        disabled={days === undefined}
        onChange={(e) => handleChange(e.target.value)}
        className="w-full rounded border border-black/10 bg-black/5 px-2 py-1 text-xs outline-none disabled:opacity-50 dark:border-white/10 dark:bg-white/5"
      >
        {RETENTION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value} className="text-black">
            {opt.label}
          </option>
        ))}
      </select>
      <p className="mt-1 max-w-[72ch] text-xs leading-relaxed opacity-70">
        期限を過ぎた閲覧履歴は自動的に削除されます。記事本体やブックマークには影響しません
      </p>
      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}

export function SettingsOverlay() {
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
    blockImages,
    clickBehavior,
    showIconLabels,
    titleMarquee,
    setOpacity,
    setSkin,
    setCardSize,
    setCardGap,
    setFont,
    setAlwaysOnTop,
    setPositionLocked,
    setTitleBarVisible,
    setMinimizeToTray,
    setBlockImages,
    setClickBehavior,
    setShowIconLabels,
    setTitleMarquee,
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
    <ScreenOverlay screen="settings" title="設定">
      <div className="flex flex-col gap-6 overflow-y-auto p-3 text-sm">
        {/* Grouped into 4 labeled sections with dividers between them --
            previously every field (スキン, 不透明度, カードサイズ, ... 10 in
            total) sat in one flat flex-col with identical-weight labels, no
            visual break between unrelated settings (reported as cluttered,
            especially here in Appearance). Group headers use a visibly
            lighter/smaller treatment than each field's own label so the two
            levels of hierarchy don't compete. */}
        <section className="flex flex-col gap-4">
        <h2 className="text-xs font-semibold tracking-wide opacity-70">見た目</h2>
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
                {skin.dualSwatch ? (
                  <span
                    className="skin-swatch-dual h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                    style={
                      {
                        "--swatch-a-light": skin.light,
                        "--swatch-a-dark": skin.dark,
                        "--swatch-b-light": skin.accentLight,
                        "--swatch-b-dark": skin.accentDark,
                      } as React.CSSProperties
                    }
                  />
                ) : (
                  <span
                    className="skin-swatch h-4 w-4 shrink-0 rounded-full border border-black/10 dark:border-white/20"
                    style={
                      {
                        "--swatch-rgb-light": skin.accentLight,
                        "--swatch-rgb-dark": skin.accentDark,
                      } as React.CSSProperties
                    }
                  />
                )}
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
            <p className="mt-1 max-w-[72ch] text-xs leading-relaxed opacity-70">
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
        </section>

        {/* Was the last section (after データ管理), which read oddly --
            moved right after 見た目 since it's really about how the rest of
            the appearance-related UI (icon labels) reads (user feedback). */}
        <section className="flex flex-col gap-4 border-t border-black/10 pt-4 dark:border-white/10">
        <h2 className="text-xs font-semibold tracking-wide opacity-70">アクセシビリティ</h2>
        <div className="flex flex-col gap-2">
          <ToggleRow label="アイコンにテキストラベルを表示" value={showIconLabels} onChange={setShowIconLabels} />
          <p className="max-w-[72ch] text-xs leading-relaxed opacity-70">
            記事検索欄の隣やタイムライン上部のアイコン（履歴・ゴミ箱・フィード管理・設定・ブックマーク）に、
            見ただけでは分かりにくい場合のために短いラベルを添えます
          </p>
          <ToggleRow
            label="長いタイトルをホバー中にスクロール"
            value={titleMarquee}
            onChange={setTitleMarquee}
          />
          <p className="max-w-[72ch] text-xs leading-relaxed opacity-70">
            見切れたタイトルにマウスを重ねると、電光掲示板のように横スクロールして全文を表示します。
            動く文字が気になる場合はOFFにしてください（OFFでも「…」で省略表示されます）
          </p>
        </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-black/10 pt-4 dark:border-white/10">
        <h2 className="text-xs font-semibold tracking-wide opacity-70">動作</h2>
        <div>
          <div className="mb-1.5 text-xs font-medium opacity-70">記事を開く方法</div>
          <div className="flex gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5">
            {CLICK_BEHAVIORS.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                onClick={() => setClickBehavior(id)}
                className={`flex-1 rounded px-1.5 py-1 text-xs transition-colors duration-150 ${
                  clickBehavior === id ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
                }`}
              >
                {label}
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
            <p className="max-w-[72ch] text-xs leading-relaxed opacity-70">
              タイトルバーを隠すと閉じる/最小化ボタンも消えます。トレイメニューか、この設定パネル（外観設定アイコン）から再表示できます
            </p>
          )}
          <ToggleRow
            label="閉じるボタンでタスクトレイに格納"
            value={minimizeToTray}
            onChange={setMinimizeToTray}
          />
          <p className="max-w-[72ch] text-xs leading-relaxed opacity-70">
            {minimizeToTray
              ? "×ボタンで閉じてもタスクトレイに常駐します。終了するにはトレイメニューの「終了」を選んでください"
              : "×ボタンで閉じるとアプリを終了します"}
          </p>
        </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-black/10 pt-4 dark:border-white/10">
        <h2 className="text-xs font-semibold tracking-wide opacity-70">プライバシー</h2>
        <div className="flex flex-col gap-2">
          <ToggleRow label="外部画像を読み込まない" value={blockImages} onChange={setBlockImages} />
          <p className="max-w-[72ch] text-xs leading-relaxed opacity-70">
            記事のサムネイルなどの画像を自動で読み込まなくなります。一部のフィードは画像に
            「読者が開いたかどうか」を検知する仕組み（トラッキングピクセル）を仕込んでいることがあり、
            それを避けたい場合にONにしてください
          </p>
        </div>
        </section>

        <section className="flex flex-col gap-4 border-t border-black/10 pt-4 dark:border-white/10">
        <h2 className="text-xs font-semibold tracking-wide opacity-70">データ管理</h2>
        <HistoryRetentionSection />
        <DataDirSection />
        </section>
      </div>
    </ScreenOverlay>
  );
}
