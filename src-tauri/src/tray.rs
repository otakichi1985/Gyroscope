use std::sync::Mutex;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State};

use crate::db::Db;
use crate::scheduler;
use crate::window::opacity;

/// Whether the X button hides the window to the tray (default, existing
/// behaviour) or quits the app like an ordinary window close. Read by the
/// `CloseRequested` handler in lib.rs. Defaults to `true` so every existing
/// build/config keeps behaving exactly as before this setting was added.
pub struct MinimizeToTray(pub Mutex<bool>);

impl Default for MinimizeToTray {
    fn default() -> Self {
        Self(Mutex::new(true))
    }
}

#[tauri::command]
pub fn set_minimize_to_tray(state: State<'_, MinimizeToTray>, value: bool) {
    *state.0.lock().unwrap() = value;
}

/// Builds the tray icon + menu once. Called from `.setup()`. Quit uses a
/// plain custom item + `app.exit(0)` rather than `MenuBuilder::quit_with_text`
/// (a predefined muda item) -- what the predefined item does natively before
/// reaching our own handler isn't obvious from the vendored source, and we
/// need quitting to be unambiguous now that closing the window only hides it.
pub fn setup(app: &AppHandle) -> tauri::Result<()> {
    let menu = MenuBuilder::new(app)
        .text("toggle", "表示/非表示")
        .separator()
        .text("refresh", "更新")
        .separator()
        .text("quit", "終了")
        .build()?;

    let tray = TrayIconBuilder::new()
        .icon(tauri::include_image!("icons/icon.ico"))
        .tooltip("RSS Widget")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => toggle_main_window(app),
            "refresh" => trigger_refresh_all(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                button_state: MouseButtonState::Up,
                ..
            } = event
            {
                toggle_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    // The tray icon is removed (on Windows: Drop for tray_icon::TrayIcon
    // calls Shell_NotifyIcon's NIM_DELETE) as soon as this value is dropped
    // -- it must be kept alive for the app's lifetime, not just this fn's.
    app.manage(tray);
    Ok(())
}

fn toggle_main_window(app: &AppHandle) {
    let Some(window) = app.get_webview_window("main") else {
        return;
    };
    if window.is_visible().unwrap_or(false) {
        let _ = window.hide();
    } else {
        let _ = window.show();
        let _ = window.set_focus();
        // Same DWM-recomposition-resets-layered-alpha issue documented on
        // set_always_on_top in opacity.rs: unhiding a window is another
        // transition Windows can use as a cue to drop a layered window back
        // to fully opaque, and it fires neither WindowEvent::Resized nor the
        // always-on-top toggle, so neither existing reapply hook catches it
        // (user report: opacity snapped to 100% after show/hide via tray).
        opacity::restore(app, &window);
    }
}

fn trigger_refresh_all(app: &AppHandle) {
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let ids: Vec<i64> = {
            let db = app.state::<Db>();
            let conn = db.0.lock().unwrap();
            let Ok(mut stmt) = conn.prepare("SELECT id FROM feeds") else {
                return;
            };
            stmt.query_map([], |r| r.get(0))
                .and_then(Iterator::collect)
                .unwrap_or_default()
        };
        let _ = scheduler::refresh_many(&app, ids).await;
    });
}
