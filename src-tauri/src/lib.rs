mod commands;
mod db;
mod error;
mod fetch;
mod opml;
mod parse;
mod paths;
mod scheduler;
mod tray;
mod window;

use std::path::Path;

use tauri::Manager;
use tauri_plugin_window_state::StateFlags;

use db::Db;
use fetch::HttpClient;
use window::{fonts, opacity, vibrancy};

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

            // MUST stay a direct call on the main thread. tray-icon creates a
            // real HWND (with its own WNDPROC) on whatever thread calls it,
            // and muda's menu does the same -- so the owning thread has to be
            // one that pumps a Win32 message loop. Only the main thread does
            // (tao's event loop); `tauri::async_runtime::spawn` hands you a
            // tokio worker that never pumps.
            //
            // Putting the tray on a tokio worker (previously done as a
            // mitigation for a suspected "explorer isn't ready yet" startup
            // race) is what caused the system-wide hangs reported after
            // running the portable build: a top-level window whose thread
            // never pumps blocks every cross-process SendMessage aimed at it,
            // and the shell talks to notification-area owner windows
            // constantly. Observed fallout was explorer.exe and
            // SystemSettings.exe both logging Application Hang (event 1002,
            // hang type "Cross-process;Activation") and needing a reboot.
            //
            // It also explains the old "tray icon never appears" bug: the
            // crate handles a failed Shell_NotifyIcon(NIM_ADD) by waiting for
            // the shell's TaskbarCreated broadcast to re-register, and a
            // broadcast can only arrive via a message pump. So no delay is
            // needed here -- the retry path works by itself once the tray
            // lives on the pumping thread.
            let _ = tray::setup(app.handle());
            scheduler::start(app.handle());

            // Catch-up for feeds added before favicon discovery existed
            // (add_feed only fetches a favicon for newly-added feeds).
            // Network-bound and per-feed, so it's spawned rather than run
            // inline here -- SPEC §7 requires startup to stay under 2s.
            let favicon_app = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                commands::feeds::backfill_favicons(&favicon_app).await;
            });

            // By default (MinimizeToTray = true), closing the main window
            // hides it to the tray rather than quitting the process -- see
            // the "タスクトレイに最小化" setting, backed by
            // tray::MinimizeToTray. When the user turns that setting off,
            // CloseRequested is left unhandled so Tauri's normal behavior
            // applies: the window closes and, since it's the only window,
            // the process exits -- same end result as the tray menu's "終了"
            // item (`app.exit(0)`), just reached via the X button instead.
            //
            // Windows can drop a layered window's alpha on certain size
            // transitions (observed: maximizing resets it to fully opaque),
            // so re-apply the last value the user asked for on every resize
            // (covers maximize/restore/manual drag-resize alike).
            let close_window = window.clone();
            let close_app = app.handle().clone();
            let resize_window = window.clone();
            let resize_app = app.handle().clone();
            window.on_window_event(move |event| match event {
                tauri::WindowEvent::CloseRequested { api, .. } => {
                    let minimize_to_tray = close_app.state::<tray::MinimizeToTray>();
                    if *minimize_to_tray.0.lock().unwrap() {
                        api.prevent_close();
                        let _ = close_window.hide();
                    }
                }
                tauri::WindowEvent::Resized(_) => {
                    opacity::restore(&resize_app, &resize_window);
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
            commands::feeds::add_feed,
            commands::feeds::list_feeds,
            commands::feeds::delete_feed,
            commands::feeds::rename_feed,
            commands::feeds::set_feed_folder,
            commands::feeds::list_genres,
            commands::feeds::create_genre,
            commands::feeds::delete_genre,
            commands::feeds::set_feed_interval,
            commands::feeds::set_feed_notify,
            commands::feeds::reorder_feeds,
            commands::feeds::set_feed_tags,
            commands::feeds::refresh_feed,
            commands::feeds::refresh_all_feeds,
            commands::entries::list_entries,
            commands::entries::mark_entry_read,
            commands::entries::toggle_star,
            commands::entries::delete_entry,
            commands::entries::restore_entry,
            commands::entries::list_deleted_entries,
            commands::entries::mark_all_read,
            commands::entries::mark_all_unread,
            commands::entries::list_read_history,
            commands::entries::clear_read_history,
            commands::opml::import_opml,
            commands::opml::export_opml,
            commands::opml::import_opml_from_path,
            commands::opml::export_opml_to_path,
            commands::settings::get_data_dir_info,
            commands::settings::set_data_dir,
            commands::settings::restart_app,
            commands::settings::get_read_history_retention,
            commands::settings::set_read_history_retention,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
