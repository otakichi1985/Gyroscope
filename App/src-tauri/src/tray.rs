use std::sync::Mutex;

use tauri::menu::MenuBuilder;
use tauri::tray::{MouseButton, MouseButtonState, TrayIconBuilder, TrayIconEvent};
use tauri::{AppHandle, Manager, State};

use crate::db::Db;
use crate::scheduler;
use crate::window::opacity;

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
        .tooltip("Gyroscope")
        .menu(&menu)
        .on_menu_event(|app, event| match event.id().as_ref() {
            "toggle" => toggle_main_window(app),
            "refresh" => trigger_refresh_all(app),
            "quit" => {
                crate::diag::log(app, "exit: tray quit");
                app.exit(0);
            }
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
