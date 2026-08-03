mod window;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;
use window::vibrancy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_window_state::Builder::new()
                .with_state_flags(StateFlags::POSITION | StateFlags::SIZE)
                .build(),
        )
        .setup(|app| {
            let window = app
                .get_webview_window("main")
                .expect("main window must exist");
            let mode = vibrancy::apply(&window);
            app.manage(mode);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![vibrancy::get_vibrancy_mode])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
