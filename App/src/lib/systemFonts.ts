import { invoke } from "@tauri-apps/api/core";

/** Family name -> the real face names (PostScript names) installed for it.
 * Chromium matches `@font-face src:local()` against a font's *face* name, not
 * reliably against the family name, so families whose full name differs from
 * the family name (Yu Gothic UI, the per-user SAO UI family, ...) need these
 * names in the src list to actually load. Fetched once per app session; an
 * empty map just leaves the family-name fallback in place. */
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