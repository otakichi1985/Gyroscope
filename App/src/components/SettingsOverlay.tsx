import { useCallback, useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { type CardGap, type CardSize, type ClickBehavior, type ThemeMode } from "../stores/appearanceStore";
import { SKINS } from "../lib/skins";
import { SETTINGS_TABS } from "../lib/settingsTabs";
import type { DataDirInfo } from "../lib/types";
import { UPDATE_MODE_LABELS, useUpdateStore, type UpdateMode } from "../stores/updateStore";
import { useUiStore } from "../stores/uiStore";
import { useSmoothWheelScroll } from "../hooks/useSmoothWheelScroll";
import { useScrollTargetRef } from "../hooks/useScrollTargetRef";
import { FontPicker } from "./FontPicker";
import { ScreenOverlay } from "./ScreenOverlay";
import { ReaderSettingsControls } from "./ReaderSettings";
import { useSettingsController } from "./useSettingsController";

const UPDATE_MODES: UpdateMode[] = ["auto", "download", "manual"];

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

const THEME_MODES: { id: ThemeMode; label: string }[] = [
  { id: "system", label: "システム" },
  { id: "light", label: "ライト" },
  { id: "dark", label: "ダーク" },
];

const SKIN_GROUPS = [
  { id: "basic", label: "ベーシック" },
  { id: "contrast", label: "コントラスト" },
  { id: "style", label: "スタイル" },
] as const;

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
        <p className="allow-text-selection break-all rounded bg-black/5 px-2 py-1.5 font-mono text-[11px] dark:bg-white/5">
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

function formatPublishedAt(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString("ja-JP", { year: "numeric", month: "long", day: "numeric" });
  } catch {
    return iso;
  }
}

function UpdateSection({ onNoUpdate }: { onNoUpdate: () => void }) {
  const {
    currentVersion,
    backupVersion,
    status,
    phase,
    error,
    downloaded,
    updateMode,
    loadStatic,
    check,
    download,
    apply,
    rollback,
    setUpdateMode,
  } = useUpdateStore();

  useEffect(() => {
    // `useAutoCheckForUpdate` already runs `loadStatic` once at startup,
    // but this section can mount before that resolves, and a rollback
    // performed earlier in the same session wouldn't otherwise refresh
    // `backupVersion` here.
    loadStatic();
    // Only on mount -- `loadStatic` itself is stable (zustand action), and
    // re-running this on every store update would defeat the point.
  }, [loadStatic]);

  const busy = phase !== "idle";

  // 今すぐ確認: run the check, and if it turns out we're already current,
  // tell the user with the "更新はありません" dialog instead of leaving the
  // press to end in a silent "最新バージョンです" line.
  const handleCheck = async () => {
    await check();
    if (useUpdateStore.getState().status?.kind === "upToDate") {
      onNoUpdate();
    }
  };

  const handleUpdate = async () => {
    if (!downloaded) {
      const ok = await download();
      if (!ok) return;
    }
    await apply();
  };

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="mb-1.5 text-xs font-medium opacity-70">自動更新</div>
        <div className="flex flex-col gap-1">
          {UPDATE_MODES.map((mode) => (
            <button
              key={mode}
              type="button"
              aria-pressed={updateMode === mode}
              onClick={() => setUpdateMode(mode)}
              className={`rounded border px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                updateMode === mode
                  ? "accent-border accent-bg-soft accent-text"
                  : "border-black/10 hover:border-black/20 hover:bg-black/[0.03] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
              }`}
            >
              {UPDATE_MODE_LABELS[mode]}
            </button>
          ))}
        </div>
        <p className="mt-1.5 text-xs leading-relaxed opacity-70">
          おまかせは新しいバージョンが見つかった時点で自動でダウンロードし、再起動して適用します（表示中に再起動することがあります）。
          ダウンロードまでおまかせは取得だけを自動で行い、適用はこの画面から行います
        </p>
      </div>

      <div>
        <div className="mb-1.5 text-xs font-medium opacity-70">現在のバージョン</div>
        <p className="allow-text-selection rounded bg-black/5 px-2 py-1.5 font-mono text-[11px] dark:bg-white/5">
          {currentVersion ?? "確認中..."}
        </p>
      </div>

      {status?.kind === "available" ? (
        <div className="flex flex-col gap-1.5 rounded border border-black/10 p-2 dark:border-white/10">
          <p className="text-xs font-medium">
            新しいバージョン v{status.version} があります（{formatPublishedAt(status.publishedAt)}）
          </p>
          {status.notes && (
            <p className="allow-text-selection max-h-24 overflow-y-auto whitespace-pre-wrap text-xs leading-relaxed opacity-70">
              {status.notes}
            </p>
          )}
          <button
            type="button"
            onClick={() => void handleUpdate()}
            disabled={busy}
            className={`${OUTLINE_BUTTON} accent-border self-start`}
          >
            {phase === "downloading"
              ? "ダウンロード中..."
              : phase === "applying"
                ? "再起動しています..."
                : downloaded
                  ? "再起動して更新"
                  : "更新して再起動"}
          </button>
        </div>
      ) : (
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => void handleCheck()}
            disabled={busy}
            className={`${OUTLINE_BUTTON} self-start`}
          >
            {phase === "checking" ? "確認中..." : "今すぐ確認"}
          </button>
          {status?.kind === "upToDate" && <p className="text-xs opacity-60">最新バージョンです</p>}
          {status?.kind === "unsupported" && (
            <p className="text-xs opacity-60">この配布形態（インストーラ版）では自動更新に対応していません</p>
          )}
        </div>
      )}
      {error && <p className="text-xs text-red-500">{error}</p>}

      {backupVersion && (
        <div className="flex flex-col gap-1.5 border-t border-black/10 pt-3 dark:border-white/10">
          <p className="text-xs opacity-70">以前のバージョン（v{backupVersion}）に戻せます</p>
          <button type="button" onClick={rollback} disabled={busy} className={`${OUTLINE_BUTTON} self-start`}>
            {phase === "rollingBack" ? "戻しています..." : "このバージョンに戻す"}
          </button>
          <p className="text-xs leading-relaxed opacity-50">
            戻るのはアプリ本体のみです。この間にデータの構造が更新されていた場合、データベースの内容までは戻りません
          </p>
        </div>
      )}
    </div>
  );
}

export function SettingsOverlay() {
  const {
    opacity,
    skinId,
    cardSize,
    cardGap,
    latinFontId,
    japaneseFontId,
    alwaysOnTop,
    positionLocked,
    titleBarVisible,
    minimizeToTray,
    blockImages,
    clickBehavior,
    showIconLabels,
    titleMarquee,
    smoothScroll,
    setOpacity,
    setSkin,
    setCardSize,
    setCardGap,
    setLatinFont,
    setJapaneseFont,
    setAlwaysOnTop,
    setPositionLocked,
    setTitleBarVisible,
    setMinimizeToTray,
    setBlockImages,
    setClickBehavior,
    setShowIconLabels,
    setTitleMarquee,
    setSmoothScroll,
    setThemeMode,
    selectedSkin,
    terminalSelected,
    cardinalitySelected,
    ordinarySelected,
    themeModeLocked,
    displayedThemeMode,
    opacityDisabled,
    activeSection,
    setActiveSection,
    systemFonts,
  } = useSettingsController();

  // Settings shows one section at a time (tabs) -- the 7 accordions had made
  // the panel scroll-heavy, and the update-notice popup can also jump straight
  // to the アップデート tab via uiStore.
  const pendingSettingsSection = useUiStore((s) => s.pendingSettingsSection);
  const clearPendingSettingsSection = useUiStore((s) => s.clearPendingSettingsSection);
  useEffect(() => {
    if (!pendingSettingsSection) return;
    setActiveSection(pendingSettingsSection);
    clearPendingSettingsSection();
  }, [pendingSettingsSection, setActiveSection, clearPendingSettingsSection]);

  // "更新はありません" dialog, raised by UpdateSection's 今すぐ確認 when the
  // check finds nothing new. Auto-dismisses after a moment so it can't block.
  const [noUpdateOpen, setNoUpdateOpen] = useState(false);
  const noUpdateTimer = useRef<number | null>(null);
  const showNoUpdate = () => {
    setNoUpdateOpen(true);
    if (noUpdateTimer.current) window.clearTimeout(noUpdateTimer.current);
    noUpdateTimer.current = window.setTimeout(() => setNoUpdateOpen(false), 3500);
  };

  const updateAvailable = useUpdateStore((s) => s.status?.kind === "available");
  const wheelRef = useSmoothWheelScroll<HTMLDivElement>(smoothScroll);
  const targetRef = useScrollTargetRef<HTMLDivElement>();
  const settingsScrollRef = useCallback(
    (el: HTMLDivElement | null) => {
      wheelRef(el);
      targetRef(el);
    },
    [wheelRef, targetRef],
  );

  return (
    <ScreenOverlay screen="settings" title="設定">
      <div ref={settingsScrollRef} className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-3 text-sm">
        {/* Section tabs: one active at a time, so the panel stays short enough
            to browse without scrolling through every section. The アップデート
            tab carries the same "update available" dot as the settings icon in
            FilterBar, so where to go is visible before opening the panel. */}
        <div className="flex flex-wrap items-center gap-1 border-b border-black/10 pb-2 dark:border-white/10">
          {SETTINGS_TABS.map(({ id, label }) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={activeSection === id}
              onClick={() => setActiveSection(id)}
              className={`relative flex items-center gap-1 rounded-full px-2.5 py-1 text-xs transition-colors duration-150 ${
                activeSection === id
                  ? "accent-bg-soft accent-text font-medium"
                  : "bg-black/5 hover:bg-black/10 dark:bg-white/5 dark:hover:bg-white/10"
              }`}
            >
              {label}
              {id === "update" && updateAvailable && (
                <span className="h-1.5 w-1.5 rounded-full bg-red-500 dark:bg-red-400" aria-hidden="true" />
              )}
            </button>
          ))}
        </div>

        {activeSection === "appearance" && (
        <div className="flex flex-col gap-4 px-1">
        <div>
          <div className="mb-1.5 text-xs font-medium opacity-70">表示モード</div>
          <div className={`flex gap-0.5 rounded bg-black/5 p-0.5 dark:bg-white/5 ${themeModeLocked ? "opacity-45" : ""}`}>
            {THEME_MODES.map(({ id, label }) => (
              <button
                key={id}
                type="button"
                disabled={themeModeLocked}
                onClick={() => setThemeMode(id)}
                className={`flex-1 rounded px-1.5 py-1 text-xs transition-colors duration-150 ${
                  displayedThemeMode === id ? "accent-bg-soft accent-text font-medium" : "opacity-60 hover:opacity-100"
                } disabled:cursor-not-allowed`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="mt-1.5 text-xs leading-relaxed opacity-60">
            {terminalSelected
              ? "ターミナルは視認性と世界観を保つため、選択中のみダーク表示に固定されます"
              : cardinalitySelected
                ? "カーディナリティは白いVRメニュー表現を保つため、選択中のみライト表示に固定されます"
                : ordinarySelected
                  ? "オーディナリーは白い情報パネルと白い操作系で組まれたAR表示のため、選択中のみライト表示に固定されます"
                : "システムはWindowsのアプリモードに合わせて自動で切り替わります"}
          </p>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium opacity-70">カラーテーマ</div>
          <div className="flex flex-col gap-3">
            {SKIN_GROUPS.map((group) => (
              <div key={group.id}>
                <div className="mb-1.5 text-[10px] font-medium tracking-wide opacity-50">{group.label}</div>
                <div className="grid grid-cols-2 gap-1.5">
                  {SKINS.filter((skin) => skin.category === group.id).map((skin) => (
                    <button
                      key={skin.id}
                      type="button"
                      aria-pressed={skinId === skin.id}
                      onClick={() => setSkin(skin.id)}
                      className={`flex min-w-0 items-center gap-2 rounded border px-2 py-1.5 text-left text-xs transition-colors duration-150 ${
                        skinId === skin.id
                          ? "accent-border accent-bg-soft"
                          : "border-black/10 hover:border-black/20 hover:bg-black/[0.03] dark:border-white/10 dark:hover:border-white/20 dark:hover:bg-white/[0.04]"
                      }`}
                    >
                      {skin.dualSwatch ? (
                        <span
                          className="skin-swatch-frame h-4 w-4 shrink-0 overflow-hidden rounded-full border border-black/15 dark:border-white/25"
                          style={
                            {
                              "--swatch-primary": skin.swatchPrimary,
                              "--swatch-complement": skin.swatchComplement,
                            } as React.CSSProperties
                          }
                        >
                          <span className="skin-swatch-dual block h-full w-full" />
                        </span>
                      ) : (
                        <span
                          className="skin-swatch-frame h-4 w-4 shrink-0 overflow-hidden rounded-full border border-black/15 dark:border-white/25"
                          style={
                            {
                              "--swatch-rgb-light": skin.swatchLight ?? skin.accentLight,
                              "--swatch-rgb-dark": skin.swatchDark ?? skin.accentDark,
                            } as React.CSSProperties
                          }
                        >
                          <span className="skin-swatch block h-full w-full" />
                        </span>
                      )}
                      <span className="truncate">{skin.label}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs leading-relaxed opacity-60">{selectedSkin.description}</p>
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
            // `accent-color` is the only hook a native range control offers
            // for its fill; left unset it draws in the browser's own blue,
            // which sat outside every skin's palette (caught on a screenshot
            // of the amber-and-white SAO theme).
            className="range-input w-full disabled:opacity-40"
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
          <div className="mb-2 text-xs font-medium opacity-70">フォント</div>
          <div className="flex flex-col gap-2.5">
            <div>
              <div className="mb-1 text-[11px] opacity-60">英数字・記号</div>
              <FontPicker
                value={latinFontId}
                options={systemFonts}
                onChange={setLatinFont}
                defaultLabel={terminalSelected ? "ターミナル既定" : "システム既定"}
                previewText="Aa 0123"
              />
            </div>
            <div>
              <div className="mb-1 text-[11px] opacity-60">日本語</div>
              <FontPicker
                value={japaneseFontId}
                options={systemFonts}
                onChange={setJapaneseFont}
                defaultLabel={terminalSelected ? "ターミナル既定" : "システム既定"}
                previewText="日本語 かな"
              />
            </div>
          </div>
          {terminalSelected && (
            <p className="mt-1.5 text-xs leading-relaxed opacity-60">
              未指定時は英数字にCascadia Mono、日本語に細身のBIZ UDGothicを使います
            </p>
          )}
        </div>
        </div>
        )}

        {activeSection === "reader" && (
        <div className="flex flex-col gap-4 px-1">
        <ReaderSettingsControls />
        </div>
        )}

        {activeSection === "accessibility" && (
        <div className="flex flex-col gap-4 px-1">
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
        </div>
        )}

        {activeSection === "behavior" && (
        <div className="flex flex-col gap-4 px-1">
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

        <div className="flex flex-col gap-2 border-t border-black/10 pt-3 dark:border-white/10">
          <div className="text-xs font-medium opacity-70">スクロール</div>
          <ToggleRow
            label="マウスホイールをなめらかに"
            value={smoothScroll}
            onChange={setSmoothScroll}
          />
          <p className="max-w-[72ch] text-xs leading-relaxed opacity-70">
            ホイールの回転をなめらかにしながら進みを大きくして、同じ距離を少ない回転で移動できるようにします。
            慣性の動きが気になる場合はOFFにしてください
          </p>
        </div>
        </div>
        )}

        {activeSection === "privacy" && (
        <div className="flex flex-col gap-4 px-1">
        <div className="flex flex-col gap-2">
          <ToggleRow label="外部画像を読み込まない" value={blockImages} onChange={setBlockImages} />
          <p className="max-w-[72ch] text-xs leading-relaxed opacity-70">
            記事のサムネイルなどの画像を自動で読み込まなくなります。一部のフィードは画像に
            「読者が開いたかどうか」を検知する仕組み（トラッキングピクセル）を仕込んでいることがあり、
            それを避けたい場合にONにしてください
          </p>
        </div>
        </div>
        )}

        {activeSection === "data" && (
        <div className="flex flex-col gap-4 px-1">
        <HistoryRetentionSection />
        <DataDirSection />
        </div>
        )}

        {activeSection === "update" && (
        <div className="flex flex-col gap-4 px-1">
        <UpdateSection onNoUpdate={showNoUpdate} />
        </div>
        )}
      </div>

      {/* 更新はありません -- transient confirmation for 今すぐ確認 when the
          check finds nothing new. Centered over the settings panel so it
          can't be missed, and auto-dismisses (or OK) shortly after. */}
      {noUpdateOpen && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-black/30 p-4">
          <div className="panel-bg flex flex-col items-stretch gap-2 rounded-lg border border-black/15 p-4 text-sm shadow-xl ring-1 ring-black/5 dark:border-white/15 dark:ring-white/5">
            <p className="font-semibold">更新はありません</p>
            <p className="text-xs opacity-70">お使いのバージョンは最新です</p>
            <button
              type="button"
              onClick={() => setNoUpdateOpen(false)}
              className="accent-bg mt-1 rounded px-3 py-1.5 text-xs font-medium text-white transition-opacity duration-150 hover:opacity-90 active:opacity-80"
            >
              OK
            </button>
          </div>
        </div>
      )}
    </ScreenOverlay>
  );
}
