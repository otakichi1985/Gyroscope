use std::sync::Mutex;

use serde::Serialize;
use tauri::{State, WebviewWindow};

use crate::error::AppResult;
use crate::window::opacity;

#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VibrancyMode {
    Mica,
    Acrylic,
    None,
}

pub struct FloatingMode(pub Mutex<bool>);

impl Default for FloatingMode {
    fn default() -> Self {
        Self(Mutex::new(false))
    }
}

#[cfg(target_os = "windows")]
pub fn apply(window: &WebviewWindow) -> VibrancyMode {
    if window_vibrancy::apply_mica(window, None).is_ok() {
        set_corner_preference(window, ROUNDED);
        return VibrancyMode::Mica;
    }
    if window_vibrancy::apply_acrylic(window, Some(ACRYLIC_TINT)).is_ok() {
        set_corner_preference(window, ROUNDED);
        return VibrancyMode::Acrylic;
    }
    VibrancyMode::None
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_window: &WebviewWindow) -> VibrancyMode {
    VibrancyMode::None
}

#[cfg(target_os = "windows")]
const ACRYLIC_TINT: (u8, u8, u8, u8) = (18, 18, 18, 125);
#[cfg(target_os = "windows")]
const ROUNDED: i32 = windows_sys::Win32::Graphics::Dwm::DWMWCP_ROUND;
#[cfg(target_os = "windows")]
const NOT_ROUNDED: i32 = windows_sys::Win32::Graphics::Dwm::DWMWCP_DONOTROUND;

#[cfg(target_os = "windows")]
fn set_backdrop(window: &WebviewWindow, base: VibrancyMode, enabled: bool) {
    match (base, enabled) {
        (VibrancyMode::Mica, true) => {
            let _ = window_vibrancy::apply_mica(window, None);
        }
        (VibrancyMode::Mica, false) => {
            let _ = window_vibrancy::clear_mica(window);
        }
        (VibrancyMode::Acrylic, true) => {
            let _ = window_vibrancy::apply_acrylic(window, Some(ACRYLIC_TINT));
        }
        (VibrancyMode::Acrylic, false) => {
            let _ = window_vibrancy::clear_acrylic(window);
        }
        (VibrancyMode::None, _) => {}
    }
    set_corner_preference(window, if enabled { ROUNDED } else { NOT_ROUNDED });
}

#[cfg(target_os = "windows")]
fn set_corner_preference(window: &WebviewWindow, preference: i32) {
    use raw_window_handle::HasWindowHandle;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Dwm::{
        DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE,
    };

    let Ok(handle) = window.window_handle() else {
        return;
    };
    let raw_window_handle::RawWindowHandle::Win32(win32) = handle.as_raw() else {
        return;
    };
    let hwnd = win32.hwnd.get() as HWND;
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
pub fn get_vibrancy_mode(mode: State<'_, VibrancyMode>) -> VibrancyMode {
    *mode.inner()
}

#[tauri::command]
pub fn set_floating_mode(
    window: WebviewWindow,
    base: State<'_, VibrancyMode>,
    floating: State<'_, FloatingMode>,
    last_opacity: State<'_, opacity::LastOpacity>,
    enabled: bool,
) -> AppResult<()> {
    *floating.0.lock().unwrap() = enabled;

    #[cfg(target_os = "windows")]
    {
        set_backdrop(&window, *base.inner(), !enabled);
        if enabled {
            opacity::clear_layered(&window)?;
        } else {
            let alpha_byte = *last_opacity.0.lock().unwrap();
            opacity::apply(&window, alpha_byte)?;
        }
    }
    #[cfg(not(target_os = "windows"))]
    {
        let _ = (&window, &base, &last_opacity);
    }

    Ok(())
}
