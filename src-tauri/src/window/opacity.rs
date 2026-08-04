use std::sync::Mutex;

use tauri::{State, WebviewWindow};

use crate::error::AppResult;

/// The last alpha byte (0-255) applied via `apply()`. Windows can drop a
/// layered window's alpha on certain size transitions (observed: maximizing
/// resets it to fully opaque), so callers re-apply this value whenever the
/// window is resized -- see the `WindowEvent::Resized` handler in lib.rs.
pub struct LastOpacity(pub Mutex<u8>);

impl Default for LastOpacity {
    fn default() -> Self {
        Self(Mutex::new(255))
    }
}

/// True window-level opacity (blends the whole window -- including
/// whatever Mica/Acrylic itself rendered -- against everything actually
/// behind it: desktop, other apps). This is a different mechanism from the
/// panel's own CSS background color: Tauri/tao expose no window-opacity API
/// on Windows, so setting `background-color: rgb(.. / alpha)` on a div only
/// blends our color against the backdrop *material* (Mica's own blur), not
/// against the real desktop -- it can never look "more see-through than
/// Mica already is". Genuine transparency needs a raw `WS_EX_LAYERED` +
/// `SetLayeredWindowAttributes` call, same style as the Win32 calls already
/// used in `vibrancy.rs`.
#[cfg(target_os = "windows")]
pub fn apply(window: &WebviewWindow, alpha_byte: u8) -> AppResult<()> {
    use raw_window_handle::HasWindowHandle;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetLayeredWindowAttributes, SetWindowLongPtrW, GWL_EXSTYLE, LWA_ALPHA,
        WS_EX_LAYERED,
    };

    use crate::error::AppError;

    let handle = window
        .window_handle()
        .map_err(|e| AppError::Other(format!("failed to get window handle: {e}")))?;
    let raw_window_handle::RawWindowHandle::Win32(win32) = handle.as_raw() else {
        return Err(AppError::Other("not a Win32 window".to_string()));
    };
    let hwnd = win32.hwnd.get() as HWND;

    unsafe {
        let ex_style = GetWindowLongPtrW(hwnd, GWL_EXSTYLE);
        if ex_style & (WS_EX_LAYERED as isize) == 0 {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style | WS_EX_LAYERED as isize);
        }
        if SetLayeredWindowAttributes(hwnd, 0, alpha_byte, LWA_ALPHA) == 0 {
            return Err(AppError::Other("SetLayeredWindowAttributes failed".to_string()));
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_window: &WebviewWindow, _alpha_byte: u8) -> AppResult<()> {
    Ok(())
}

#[tauri::command]
pub fn set_window_opacity(window: WebviewWindow, state: State<'_, LastOpacity>, alpha: f64) -> AppResult<()> {
    let alpha_byte = (alpha.clamp(0.0, 1.0) * 255.0).round() as u8;
    apply(&window, alpha_byte)?;
    *state.0.lock().unwrap() = alpha_byte;
    Ok(())
}

/// Wraps Tauri's own `set_always_on_top` and immediately re-applies the last
/// opacity afterwards. The always-on-top toggle goes through Win32
/// `SetWindowPos(HWND_TOPMOST/NOTOPMOST)` under the hood, which -- like
/// resizing -- can reset a layered window's alpha; unlike resizing, it
/// doesn't fire `WindowEvent::Resized`, so the existing reapply-on-resize
/// hook in lib.rs never catches it (found via user report: opacity snapped
/// back to 100% specifically when toggling this, fixed by a resize).
#[tauri::command]
pub fn set_always_on_top(window: WebviewWindow, state: State<'_, LastOpacity>, value: bool) -> AppResult<()> {
    use crate::error::AppError;

    window
        .set_always_on_top(value)
        .map_err(|e| AppError::Other(e.to_string()))?;
    let alpha_byte = *state.0.lock().unwrap();
    apply(&window, alpha_byte)?;
    Ok(())
}
