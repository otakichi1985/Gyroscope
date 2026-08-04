mod commands;
mod db;
mod error;
mod fetch;
mod opml;
mod parse;
mod scheduler;
mod tray;
mod window;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

use db::Db;
use fetch::HttpClient;
use window::vibrancy;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_dialog::init())
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

            let data_dir = app.path().app_data_dir().expect("no app data dir available");
            let conn = db::open(&data_dir).expect("failed to open database");
            app.manage(Db(std::sync::Mutex::new(conn)));

            let client = fetch::client::build_client().expect("failed to build HTTP client");
            app.manage(HttpClient(client));

            // KNOWN ISSUE (tracked, not yet resolved): the tray icon does not
            // reliably appear in this dev environment even after this fix.
            // tray-icon-0.24.2's register_tray_icon() silently swallows a
            // failed Shell_NotifyIcon(NIM_ADD) ("Explorer/taskbar may not be
            // ready yet" -- see its own source comment), so a short post-setup
            // delay was tried as a mitigation for a suspected startup race.
            // It is NOT confirmed to fix icon visibility (testing in this
            // session was inconclusive/inconsistent, possibly confounded by
            // dozens of dirty process kills and Explorer restarts during
            // debugging). Keeping the delay since it's a plausible, harmless
            // mitigation, but this needs verification on a clean machine/
            // reboot before being considered solved.
            let tray_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                tokio::time::sleep(std::time::Duration::from_millis(500)).await;
                let _ = tray::setup(&tray_app);
            });
            scheduler::start(app.handle());

            // Once a tray exists, closing the main window should hide it
            // rather than quit the whole process -- true quit only happens
            // via the tray menu's "終了" item (`app.exit(0)`).
            let close_window = window.clone();
            window.on_window_event(move |event| {
                if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                    api.prevent_close();
                    let _ = close_window.hide();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vibrancy::get_vibrancy_mode,
            commands::feeds::add_feed,
            commands::feeds::list_feeds,
            commands::feeds::delete_feed,
            commands::feeds::rename_feed,
            commands::feeds::set_feed_folder,
            commands::feeds::set_feed_interval,
            commands::feeds::set_feed_notify,
            commands::feeds::reorder_feeds,
            commands::feeds::set_feed_tags,
            commands::feeds::refresh_feed,
            commands::feeds::refresh_all_feeds,
            commands::entries::list_entries,
            commands::entries::mark_entry_read,
            commands::entries::toggle_star,
            commands::entries::mark_all_read,
            commands::entries::list_read_history,
            commands::entries::clear_read_history,
            commands::opml::import_opml,
            commands::opml::export_opml,
            commands::opml::import_opml_from_path,
            commands::opml::export_opml_to_path,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
