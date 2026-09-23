import { invoke } from "@tauri-apps/api/core";

export type FontFaceNameMap = Record<string, string[]>;

let cached: Promise<FontFaceNameMap> | null = null;

export function fetchFontFaceNames(): Promise<FontFaceNameMap> {
  if (!cached) {
    cached = invoke<FontFaceNameMap>("list_font_face_names").catch((error) => {
      console.error("list_font_face_names failed", error);
      return {};
    });
  }
  return cached;
}
