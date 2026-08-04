use tauri::WebviewWindow;

use crate::error::AppResult;

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
#[tauri::command]
pub fn set_window_opacity(window: WebviewWindow, alpha: f64) -> AppResult<()> {
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
    let alpha_byte = (alpha.clamp(0.0, 1.0) * 255.0).round() as u8;

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
#[tauri::command]
pub fn set_window_opacity(_window: WebviewWindow, _alpha: f64) -> AppResult<()> {
    Ok(())
}
