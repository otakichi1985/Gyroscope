mod commands;
mod db;
mod diag;
mod error;
mod fetch;
mod opml;
mod parse;
mod paths;
mod scheduler;
mod search;
mod tray;
mod window;

use std::path::Path;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

use db::Db;
use fetch::HttpClient;
use window::{fonts, opacity, vibrancy};

fn ensure_startup_window_visible(window: &tauri::WebviewWindow) {
    let on_screen = window
        .outer_position()
        .ok()
        .zip(window.outer_size().ok())
        .and_then(|(position, size)| {
            let right = position
                .x
                .saturating_add(size.width.min(i32::MAX as u32) as i32);
            let bottom = position
                .y
                .saturating_add(size.height.min(i32::MAX as u32) as i32);
            window.available_monitors().ok().map(|monitors| {
                monitors.into_iter().any(|monitor| {
                    let monitor_position = monitor.position();
                    let monitor_size = monitor.size();
                    let monitor_right = monitor_position
                        .x
                        .saturating_add(monitor_size.width.min(i32::MAX as u32) as i32);
                    let monitor_bottom = monitor_position
                        .y
                        .saturating_add(monitor_size.height.min(i32::MAX as u32) as i32);
                    let overlap_width =
                        right.min(monitor_right) - position.x.max(monitor_position.x);
                    let overlap_height =
                        bottom.min(monitor_bottom) - position.y.max(monitor_position.y);
                    overlap_width >= 40 && overlap_height >= 40
                })
            })
        })
        .unwrap_or(false);

    if !window.is_visible().unwrap_or(false) || !on_screen {
        let _ = window.center();
        let _ = window.show();
    }
    let _ = window.set_focus();
}

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
            diag::log(app.handle(), "startup");
            let window = app
                .get_webview_window("main")
                .expect("main window must exist");
            let mode = vibrancy::apply(&window);
            app.manage(mode);

            let data_dir_info = paths::resolve(app.handle());
            if let Some(reason) = &data_dir_info.fallback_reason {
                eprintln!("data dir fallback: {reason}");
            }
            let conn = db::open(Path::new(&data_dir_info.path)).expect("failed to open database");
            app.manage(Db(std::sync::Mutex::new(conn)));

            let client = fetch::client::build_client().expect("failed to build HTTP client");
            app.manage(HttpClient(client));

            app.manage(opacity::LastOpacity::default());
            app.manage(vibrancy::FloatingMode::default());
            app.manage(tray::MinimizeToTray::default());
            app.manage(commands::update::PendingUpdate::default());
            app.manage(fetch::booth::BoothScrapeLimiter::default());

            let _ = tray::setup(app.handle());

            ensure_startup_window_visible(&window);
            diag::log(app.handle(), "startup_window: shown_and_focused");

            scheduler::start(app.handle());

            let favicon_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                commands::feed_maintenance::backfill_favicons(&favicon_app).await;
            });

            let close_window = window.clone();
            let close_app = app.handle().clone();
            let resize_window = window.clone();
            let resize_app = app.handle().clone();
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let minimize_to_tray = close_app.state::<tray::MinimizeToTray>();
                    if *minimize_to_tray.0.lock().unwrap() {
                        diag::log(&close_app, "close_requested: prevent_close (tray)");
                        api.prevent_close();
                        let _ = close_window.hide();
                    } else {
                        diag::log(
                            &close_app,
                            "close_requested: not prevented (process exit path)",
                        );
                    }
                }
                tauri::WindowEvent::Resized(_) => {
                    opacity::restore(&resize_app, &resize_window);
                }
                tauri::WindowEvent::Destroyed => {
                    diag::log(&close_app, "main window destroyed");
                }
                _ => {}
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vibrancy::get_vibrancy_mode,
            vibrancy::set_floating_mode,
            opacity::set_window_opacity,
            opacity::set_always_on_top,
            tray::set_minimize_to_tray,
            fonts::list_system_fonts,
            fonts::list_font_face_names,
            commands::feeds::add_feed,
            commands::feeds::list_feeds,
            commands::feed_settings::delete_feed,
            commands::feed_settings::rename_feed,
            commands::feed_settings::set_feed_folder,
            commands::feed_genres::list_genres,
            commands::feed_genres::create_genre,
            commands::feed_genres::delete_genre,
            commands::feed_settings::set_feed_interval,
            commands::feed_settings::set_feed_notify,
            commands::feed_settings::reorder_feeds,
            commands::feed_settings::set_feed_tags,
            commands::feed_refresh::refresh_feed,
            commands::feed_refresh::refresh_all_feeds,
            commands::entries::list_entries,
            commands::entries::mark_entry_read,
            commands::entries::toggle_star,
            commands::entries::delete_entry,
            commands::entries::restore_entry,
            commands::entries::list_deleted_entries,
            commands::entries::mark_all_read,
            commands::entries::mark_all_unread,
            commands::entries::list_read_history,
            commands::entries::record_external_read,
            commands::entries::clear_read_history,
            commands::opml::import_opml,
            commands::opml::export_opml,
            commands::opml::import_opml_from_path,
            commands::opml::export_opml_to_path,
            commands::search::search_sources,
            commands::search::browse_category,
            commands::search::list_search_categories,
            commands::article::fetch_article_full_text,
            commands::article::fetch_article_image,
            commands::saved::save_article,
            commands::saved::unsave_article,
            commands::saved::list_saved_article_urls,
            commands::settings::get_data_dir_info,
            commands::settings::set_data_dir,
            commands::settings::restart_app,
            commands::settings::get_read_history_retention,
            commands::settings::set_read_history_retention,
            commands::update::get_app_version,
            commands::update::get_update_backup_info,
            commands::update::check_for_update,
            commands::update::download_update,
            commands::update::apply_update,
            commands::update::rollback_update,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
