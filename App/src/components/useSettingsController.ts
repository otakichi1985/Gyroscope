import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { SKINS } from "../lib/skins";
import {
  loadSettingsTab,
  saveSettingsTab,
  type SettingsSectionId,
} from "../lib/settingsTabs";
import { useVibrancyMode } from "../hooks/useVibrancyMode";
import {
  useAppearanceStore,
  type ThemeMode,
} from "../stores/appearanceStore";

export type { SettingsSectionId };

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
  const [activeSection, setActiveSectionState] = useState<SettingsSectionId>(loadSettingsTab);
  const [systemFonts, setSystemFonts] = useState<string[] | null>(null);

  useEffect(() => {
    invoke<string[]>("list_system_fonts")
      .then(setSystemFonts)
      .catch(() => setSystemFonts([]));
  }, []);

  const setActiveSection = (id: SettingsSectionId) => {
    setActiveSectionState(id);
    saveSettingsTab(id);
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
    activeSection,
    setActiveSection,
    systemFonts,
  };
}