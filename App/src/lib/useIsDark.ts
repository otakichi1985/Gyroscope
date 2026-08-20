import { useEffect, useState } from "react";
import { useAppearanceStore } from "../stores/appearanceStore";
import { getSkin } from "./skins";

/// Resolves whether the app is currently rendering in dark mode, mirroring
/// App.tsx (terminal forces dark, cardinality/ordinary force light). Chrome
/// outside App's render tree (e.g. the 配色 swatches) uses this to make the
/// same theme decision the CSS `dark:` variants are making.
export function useIsDark(): boolean {
  const skinId = useAppearanceStore((s) => s.skinId);
  const themeMode = useAppearanceStore((s) => s.themeMode);
  const [systemDark, setSystemDark] = useState(() => window.matchMedia("(prefers-color-scheme: dark)").matches);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const sync = () => setSystemDark(media.matches);
    sync();
    media.addEventListener("change", sync);
    return () => media.removeEventListener("change", sync);
  }, []);
  const skin = getSkin(skinId);
  const forcedLight = skin.visualStyle === "cardinality" || skin.visualStyle === "ordinary";
  return skin.visualStyle === "terminal" || (!forcedLight && (themeMode === "dark" || (themeMode === "system" && systemDark)));
}