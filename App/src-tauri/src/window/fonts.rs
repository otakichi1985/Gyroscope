#[cfg(target_os = "windows")]
#[tauri::command]
pub fn list_system_fonts() -> Vec<String> {
    use std::collections::BTreeSet;
    use windows_sys::Win32::Foundation::LPARAM;
    use windows_sys::Win32::Graphics::Gdi::{
        CreateCompatibleDC, DeleteDC, EnumFontFamiliesExW, DEFAULT_CHARSET, LOGFONTW, TEXTMETRICW,
    };

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
