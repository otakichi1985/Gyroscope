import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SKINS } from "../lib/skins";
import { useVibrancyMode } from "../hooks/useVibrancyMode";
import {
  useAppearanceStore,
  type ThemeMode,
} from "../stores/appearanceStore";

export type SettingsSectionId = "appearance" | "reader" | "accessibility" | "behavior" | "privacy" | "data" | "update";

const SETTINGS_SECTIONS_STORAGE_KEY = "gyroscope:settings-sections";
const DEFAULT_OPEN_SECTIONS: Record<SettingsSectionId, boolean> = {
  appearance: true,
  reader: false,
  accessibility: false,
  behavior: false,
  privacy: false,
  data: false,
  update: false,
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

export function useSettingsController() {
  const appearance = useAppearanceStore();
  const vibrancy = useVibrancyMode();
  const selectedSkin = SKINS.find((skin) => skin.id === appearance.skinId) ?? SKINS[0];
  const terminalSelected = selectedSkin.visualStyle === "terminal";
  const cardinalitySelected = selectedSkin.visualStyle === "cardinality";
  const ordinarySelected = selectedSkin.visualStyle === "ordinary";
  const themeModeLocked = terminalSelected || cardinalitySelected || ordinarySelected;
  const displayedThemeMode: ThemeMode =
    terminalSelected || ordinarySelected ? "dark" : cardinalitySelected ? "light" : appearance.themeMode;
  const [openSections, setOpenSections] = useState(loadOpenSections);
  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);

  useEffect(() => {
    invoke<string[]>("list_system_fonts")
      .then(setSystemFonts)
      .catch(() => setSystemFonts([]));
  }, []);

  const toggleSection = (id: SettingsSectionId) => {
    setOpenSections((current) => {
      const next = { ...current, [id]: !current[id] };
      localStorage.setItem(SETTINGS_SECTIONS_STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  };

  return {
    ...appearance,
    vibrancy,
    selectedSkin,
    terminalSelected,
    cardinalitySelected,
    ordinarySelected,
    themeModeLocked,
    displayedThemeMode,
    opacityDisabled: vibrancy === "none",
    openSections,
    toggleSection,
    systemFonts,
  };
}
