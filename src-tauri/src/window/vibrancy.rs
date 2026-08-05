use serde::Serialize;
use tauri::WebviewWindow;

/// Which backdrop effect ended up applied to the main window. Reported to the
/// frontend so it can switch between a translucent panel (vibrancy visible
/// through the webview) and a fully opaque fallback background.
#[derive(Clone, Copy, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VibrancyMode {
    Mica,
    Acrylic,
    None,
}

/// Applies the best available backdrop for the current platform. Windows 11
/// gets Mica; older Windows gets Acrylic; anything else (including a Mica/
/// Acrylic call that errors out) falls back to a solid CSS background so the
/// UI never ends up see-through by accident.
#[cfg(target_os = "windows")]
pub fn apply(window: &WebviewWindow) -> VibrancyMode {
    if window_vibrancy::apply_mica(window, None).is_ok() {
        round_corners(window);
        return VibrancyMode::Mica;
    }
    if window_vibrancy::apply_acrylic(window, Some((18, 18, 18, 125))).is_ok() {
        round_corners(window);
        return VibrancyMode::Acrylic;
    }
    VibrancyMode::None
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_window: &WebviewWindow) -> VibrancyMode {
    VibrancyMode::None
}

/// Rounds the actual HWND (not just the webview content) via
/// DWMWA_WINDOW_CORNER_PREFERENCE. This native outline is the single source
/// of truth for the corner shape: a second, larger CSS radius exposes a strip
/// of the Mica/Acrylic surface between the two curves. Frameless windows don't
/// get Windows 11's automatic rounding, so this is requested explicitly.
#[cfg(target_os = "windows")]
fn round_corners(window: &WebviewWindow) {
    use raw_window_handle::HasWindowHandle;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE, DWMWCP_ROUND,
    };

    let Ok(handle) = window.window_handle() else {
        return;
    };
    let raw_window_handle::RawWindowHandle::Win32(win32) = handle.as_raw() else {
        return;
    };
    let hwnd = win32.hwnd.get() as HWND;
    let preference = DWMWCP_ROUND;
    unsafe {
        let _ = DwmSetWindowAttribute(
            hwnd,
            DWMWA_WINDOW_CORNER_PREFERENCE as u32,
            &preference as *const _ as *const _,
            std::mem::size_of_val(&preference) as u32,
        );
    }
}

#[tauri::command]
pub fn get_vibrancy_mode(mode: tauri::State<VibrancyMode>) -> VibrancyMode {
    *mode.inner()
}
