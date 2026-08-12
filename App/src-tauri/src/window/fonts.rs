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

#[cfg(not(target_os = "windows"))]
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    Vec::new()
}
