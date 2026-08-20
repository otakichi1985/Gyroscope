/// Lists every installed font family name so the appearance settings can
/// offer the full system font list instead of a small curated set (user
/// request: "OS内にあるものを全部使えるようにしてほしい"). Same "call raw
/// Win32 directly from Rust" style already used in vibrancy.rs/opacity.rs.
#[cfg(target_os = "windows")]
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    use std::collections::BTreeSet;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, EnumFontFamiliesExW, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW,
    };
    use windows_sys::Win32::Foundation::LPARAM;

    unsafe extern "system" fn enum_proc(
        logfont: *const LOGFONTW,
        _metrics: *const TEXTMETRICW,
        _font_type: u32,
        lparam: LPARAM,
    ) -> i32 {
        let names = unsafe { &mut *(lparam as *mut BTreeSet<String>) };
        let face = unsafe { &(*logfont).lfFaceName };
        let end = face.iter().position(|&c| c == 0).unwrap_or(face.len());
        let name = String::from_utf16_lossy(&face[..end]);
        // Names starting with '@' are the vertical-writing variant Windows
        // registers alongside most CJK fonts (e.g. "@MS Gothic") -- not
        // something a user would ever intentionally pick here.
        if !name.is_empty() && !name.starts_with('@') {
            names.insert(name);
        }
        1
    }

    let mut names: BTreeSet<String> = BTreeSet::new();
    unsafe {
        let hdc = CreateCompatibleDC(std::ptr::null_mut());
        let mut logfont: LOGFONTW = std::mem::zeroed();
        logfont.lfCharSet = DEFAULT_CHARSET;
        EnumFontFamiliesExW(
            hdc,
            &logfont,
            Some(enum_proc),
            &mut names as *mut BTreeSet<String> as LPARAM,
            0,
        );
        DeleteDC(hdc);
    }
    names.into_iter().collect()
}

/// Maps every installed font family to the real face names (PostScript names,
/// nameID 6) that `@font-face src:local()` resolves on this machine. Chromium
/// matches local() against a font's *face* name, not reliably against its
/// family name -- families whose full name differs from the family name (the
/// Yu family, the per-user SAO UI family, ...) silently drop out unless the
/// face names are supplied. fontdb reads the name tables directly, and on
/// Windows scans the per-user font directory too, so HKCU-registered fonts
/// like SAO UI are included. Runs off-thread because loading the database
/// parses every installed font (hundreds of files).
#[cfg(target_os = "windows")]
#[tauri::command]
pub async fn list_font_face_names() -> std::collections::HashMap<String, Vec<String>> {
    tauri::async_runtime::spawn_blocking(|| {
        let mut db = fontdb::Database::new();
        db.load_system_fonts();

        let mut by_family: std::collections::HashMap<String, std::collections::BTreeSet<String>> =
            std::collections::HashMap::new();
        for face in db.faces() {
            let ps_name = face.post_script_name.trim().to_string();
            if ps_name.is_empty() {
                continue;
            }
            // A face can carry several family names (typographic + legacy +
            // localized); register the face name under each so the lookup
            // matches whichever name the picker's family list uses.
            for (family, _) in &face.families {
                by_family
                    .entry(family.clone())
                    .or_default()
                    .insert(ps_name.clone());
            }
        }

        by_family
            .into_iter()
            .map(|(family, names)| (family, names.into_iter().collect()))
            .collect()
    })
    .await
    .unwrap_or_default()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn list_font_face_names() -> std::collections::HashMap<String, Vec<String>> {
    std::collections::HashMap::new()
}

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    Vec::new()
}
