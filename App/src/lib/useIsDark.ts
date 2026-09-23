import { useEffect, useState } from "react";
import { useAppearanceStore } from "../stores/appearanceStore";
import { getSkin } from "./skins";

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
