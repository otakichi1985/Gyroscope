use std::sync::Mutex;

use serde::Serialize;
use tauri::{State, WebviewWindow};

use crate::error::AppResult;
use crate::window::opacity;

/// Which backdrop effect ended up applied to the main window. Reported to the
/// frontend so it can switch between a translucent panel (vibrancy visible
/// through the webview) and a fully opaque fallback background.
///
/// This records what the machine *can* do and is resolved once at startup --
/// it is not the live on/off state. Whether the backdrop is currently painted
/// is `FloatingMode` below, which the SAO-style skins turn off.
#[derive(Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "lowercase")]
pub enum VibrancyMode {
    Mica,
    Acrylic,
    None,
}

/// Whether the window is currently in "floating" mode: no DWM backdrop at
/// all, so the transparent areas of the webview show the real desktop rather
/// than Mica/Acrylic's own blur.
///
/// Only the two SAO-derived skins (カーディナリティ / オーディナリー) ask for
/// this, because their whole premise is a heads-up display hanging in space
/// rather than a window with a surface. Every other skin keeps the normal
/// backdrop, so this stays a per-skin behavior rather than a user setting.
///
/// While it is on, native window alpha is *not* used: see the comment on
/// `opacity::clear_layered` for why the two mechanisms can't both be in play.
pub struct FloatingMode(pub Mutex<bool>);

impl Default for FloatingMode {
    fn default() -> Self {
        Self(Mutex::new(false))
    }
}

/// Applies the best available backdrop for the current platform. Windows 11
/// gets Mica; older Windows gets Acrylic; anything else (including a Mica/
/// Acrylic call that errors out) falls back to a solid CSS background so the
/// UI never ends up see-through by accident.
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

/// Turns the startup-selected backdrop on or off without re-deciding which
/// one this machine supports (`base` is the answer `apply` already reached).
///
/// Corner rounding is tied to the backdrop on purpose. Rounding is requested
/// so DWM's *own* backdrop painting follows the CSS shape; with no backdrop
/// there is nothing to round, and DWM's clip would instead cut into whatever
/// floating element happens to reach a corner.
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

/// Sets the HWND's own corner shape (not just the webview content) via
/// DWMWA_WINDOW_CORNER_PREFERENCE. This native outline is the single source
/// of truth for the corner shape: a second, larger CSS radius exposes a strip
/// of the Mica/Acrylic surface between the two curves. Frameless windows don't
/// get Windows 11's automatic rounding, so this is requested explicitly.
#[cfg(target_os = "windows")]
fn set_corner_preference(window: &WebviewWindow, preference: i32) {
    use raw_window_handle::HasWindowHandle;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::Graphics::Dwm::{DwmSetWindowAttribute, DWMWA_WINDOW_CORNER_PREFERENCE};

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

/// Switches the window between "normal panel" and "floating HUD".
///
/// Called by the frontend whenever the selected skin changes (see
/// `useSyncFloatingMode`), including once on startup, so the two states stay
/// fully reversible: picking a SAO skin strips the backdrop, picking anything
/// else puts it back along with the user's opacity slider value.
#[tauri::command]
pub fn set_floating_mode(
    window: WebviewWindow,
    base: State<'_, VibrancyMode>,
    floating: State<'_, FloatingMode>,
    last_opacity: State<'_, opacity::LastOpacity>,
    enabled: bool,
) -> AppResult<()> {
    // Written before touching the window so that anything reacting to the
    // resulting repaint (notably lib.rs's re-apply-opacity-on-Resized hook)
    // already sees the new mode and doesn't put WS_EX_LAYERED straight back.
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
