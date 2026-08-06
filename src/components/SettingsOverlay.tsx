import { useEffect, useState, type ReactNode } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { SKINS } from "../lib/skins";
import { useVibrancyMode } from "../hooks/useVibrancyMode";
import {
  useAppearanceStore,
  type CardGap,
  type CardSize,
  type ClickBehavior,
  type ThemeMode,
} from "../stores/appearanceStore";
import type { DataDirInfo } from "../lib/types";
import { FontPicker } from "./FontPicker";
import { ScreenOverlay } from "./ScreenOverlay";
import { ChevronDownIcon } from "./icons";

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

type SettingsSectionId = "appearance" | "accessibility" | "behavior" | "privacy" | "data";

const SETTINGS_SECTIONS_STORAGE_KEY = "rss-widget:settings-sections";
const DEFAULT_OPEN_SECTIONS: Record<SettingsSectionId, boolean> = {
  appearance: true,
  accessibility: false,
  behavior: false,
  privacy: false,
  data: false,
};

function loadOpenSections(): Record<SettingsSectionId, boolean> {
  try {
    const saved = JSON.parse(localStorage.getItem(SETTINGS_SECTIONS_STORAGE_KEY) ?? "null") as
      | Partial<Record<SettingsSectionId, boolean>>
      | null;
    return saved ? { ...DEFAULT_OPEN_SECTIONS, ...saved } : DEFAULT_OPEN_SECTIONS;
  } catch {
    return DEFAULT_OPEN_SECTIONS;
  }
}

function SettingsSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="border-b border-black/10 pb-3 last:border-b-0 dark:border-white/10">
      <button
        type="button"
        aria-expanded={open}
        onClick={onToggle}
        className="group flex w-full items-center justify-between rounded px-1 py-1.5 text-left transition-colors duration-150 hover:bg-black/[0.035] dark:hover:bg-white/[0.05]"
      >
        <h2 className="text-xs font-semibold tracking-wide opacity-70">{title}</h2>
        <ChevronDownIcon
          className={`h-3.5 w-3.5 shrink-0 opacity-55 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        />
      </button>
      <div hidden={!open} className="flex flex-col gap-4 px-1 pt-3">
        {children}
      </div>
    </section>
  );
}

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
    themeMode,
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
    setThemeMode,
  } = useAppearanceStore();
  const vibrancy = useVibrancyMode();
  const opacityDisabled = vibrancy === "none";
  const selectedSkin = SKINS.find((skin) => skin.id === skinId) ?? SKINS[0];
  const terminalSelected = selectedSkin.visualStyle === "terminal";
  const cardinalitySelected = selectedSkin.visualStyle === "cardinality";
  const ordinarySelected = selectedSkin.visualStyle === "ordinary";
  const themeModeLocked = terminalSelected || cardinalitySelected || ordinarySelected;
  const displayedThemeMode: ThemeMode =
    terminalSelected || ordinarySelected ? "dark" : cardinalitySelected ? "light" : themeMode;
  const [openSections, setOpenSections] = useState(loadOpenSections);

  const toggleSection = (id: SettingsSectionId) => {
    setOpenSections((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem(SETTINGS_SECTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);
  useEffect(() => {
    invoke<string[]>("list_system_fonts")
      .then(setSystemFonts)
      .catch(() => setSystemFonts([]));
  }, []);

  return (
    <ScreenOverlay screen="settings" title="設定">
      <div className="flex flex-col gap-3 overflow-y-auto p-3 text-sm">
        <SettingsSection
          title="見た目"
          open={openSections.appearance}
          onToggle={() => toggleSection("appearance")}
        >
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
                  ? "オーディナリーは青白いAR表示を保つため、選択中のみダーク表示に固定されます"
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
        </SettingsSection>

        <SettingsSection
          title="アクセシビリティ"
          open={openSections.accessibility}
          onToggle={() => toggleSection("accessibility")}
        >
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
        </SettingsSection>

        <SettingsSection
          title="動作"
          open={openSections.behavior}
          onToggle={() => toggleSection("behavior")}
        >
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
        </SettingsSection>

        <SettingsSection
          title="プライバシー"
          open={openSections.privacy}
          onToggle={() => toggleSection("privacy")}
        >
        <div className="flex flex-col gap-2">
          <ToggleRow label="外部画像を読み込まない" value={blockImages} onChange={setBlockImages} />
          <p className="max-w-[72ch] text-xs leading-relaxed opacity-70">
            記事のサムネイルなどの画像を自動で読み込まなくなります。一部のフィードは画像に
            「読者が開いたかどうか」を検知する仕組み（トラッキングピクセル）を仕込んでいることがあり、
            それを避けたい場合にONにしてください
          </p>
        </div>
        </SettingsSection>

        <SettingsSection
          title="データ管理"
          open={openSections.data}
          onToggle={() => toggleSection("data")}
        >
        <HistoryRetentionSection />
        <DataDirSection />
        </SettingsSection>
      </div>
    </ScreenOverlay>
  );
}
