use std::sync::Mutex;

use tauri::{AppHandle, Manager, State, WebviewWindow};

use crate::error::AppResult;
use crate::window::vibrancy::FloatingMode;

pub struct LastOpacity(pub Mutex<u8>);

impl Default for LastOpacity {
    fn default() -> Self {
        Self(Mutex::new(255))
    }
}

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
            return Err(AppError::Other(
                "SetLayeredWindowAttributes failed".to_string(),
            ));
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn apply(_window: &WebviewWindow, _alpha_byte: u8) -> AppResult<()> {
    Ok(())
}

#[cfg(target_os = "windows")]
pub fn clear_layered(window: &WebviewWindow) -> AppResult<()> {
    use raw_window_handle::HasWindowHandle;
    use windows_sys::Win32::Foundation::HWND;
    use windows_sys::Win32::UI::WindowsAndMessaging::{
        GetWindowLongPtrW, SetWindowLongPtrW, GWL_EXSTYLE, WS_EX_LAYERED,
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
        if ex_style & (WS_EX_LAYERED as isize) != 0 {
            SetWindowLongPtrW(hwnd, GWL_EXSTYLE, ex_style & !(WS_EX_LAYERED as isize));
        }
    }
    Ok(())
}

#[cfg(not(target_os = "windows"))]
pub fn clear_layered(_window: &WebviewWindow) -> AppResult<()> {
    Ok(())
}

pub fn restore(app: &AppHandle, window: &WebviewWindow) {
    let floating = app
        .try_state::<FloatingMode>()
        .map(|state| *state.0.lock().unwrap())
        .unwrap_or(false);
    if floating {
        return;
    }
    if let Some(state) = app.try_state::<LastOpacity>() {
        let alpha_byte = *state.0.lock().unwrap();
        let _ = apply(window, alpha_byte);
    }
}

#[tauri::command]
pub fn set_window_opacity(
    window: WebviewWindow,
    state: State<'_, LastOpacity>,
    floating: State<'_, FloatingMode>,
    alpha: f64,
) -> AppResult<()> {
    let alpha_byte = (alpha.clamp(0.0, 1.0) * 255.0).round() as u8;
    *state.0.lock().unwrap() = alpha_byte;
    if *floating.0.lock().unwrap() {
        return Ok(());
    }
    apply(&window, alpha_byte)
}

#[tauri::command]
pub fn set_always_on_top(
    window: WebviewWindow,
    state: State<'_, LastOpacity>,
    floating: State<'_, FloatingMode>,
    value: bool,
) -> AppResult<()> {
    use crate::error::AppError;

    window
        .set_always_on_top(value)
        .map_err(|e| AppError::Other(e.to_string()))?;
    if *floating.0.lock().unwrap() {
        return Ok(());
    }
    let alpha_byte = *state.0.lock().unwrap();
    apply(&window, alpha_byte)?;
    Ok(())
}
