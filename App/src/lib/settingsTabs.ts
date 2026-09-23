export type SettingsSectionId =
  | "appearance"
  | "reader"
  | "accessibility"
  | "behavior"
  | "privacy"
  | "data"
  | "update";

export const SETTINGS_TABS: { id: SettingsSectionId; label: string }[] = [
  { id: "appearance", label: "見た目" },
  { id: "reader", label: "リーダー" },
  { id: "accessibility", label: "アクセシビリティ" },
  { id: "behavior", label: "動作" },
  { id: "privacy", label: "プライバシー" },
  { id: "data", label: "データ管理" },
  { id: "update", label: "アップデート" },
];

const SETTINGS_TAB_STORAGE_KEY = "gyroscope:settings-tab";

export function loadSettingsTab(): SettingsSectionId {
  const saved = localStorage.getItem(SETTINGS_TAB_STORAGE_KEY);
  if (!saved) return "appearance";
  try {
    const parsed = JSON.parse(saved) as unknown;
    if (SETTINGS_TABS.some((t) => t.id === parsed)) return parsed as SettingsSectionId;
  } catch {
  }
  return "appearance";
}

export function saveSettingsTab(id: SettingsSectionId) {
  localStorage.setItem(SETTINGS_TAB_STORAGE_KEY, JSON.stringify(id));
}
