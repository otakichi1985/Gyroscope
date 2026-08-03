mod commands;
mod db;
mod error;
mod fetch;
mod opml;
mod parse;
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
            commands::entries::list_entries,
            commands::entries::mark_entry_read,
            commands::entries::toggle_star,
            commands::entries::mark_all_read,
            commands::opml::import_opml,
            commands::opml::export_opml,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
