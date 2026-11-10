mod commands;
mod engine;
mod tray;
mod watchdog;

use tauri::{Emitter, Manager, WindowEvent};
use tauri_plugin_deep_link::DeepLinkExt;

use commands::desktop::{PendingLaunch, PendingPack};
use engine::core::{crashlog, jobs::Jobs, paths};
use engine::game::launch::Games;
use engine::shortcut;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            tray::show_main(app);
            if let Some(id) = shortcut::requested(argv) {
                let _ = app.emit("launch-request", id);
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(Jobs::default())
        .manage(Games::default())
        .manage(engine::game::report::Reports::default())
        .manage(watchdog::UiReady::default())
        .manage(engine::social::Live::default())
        .manage(PendingPack::default())
        .manage(PendingLaunch(std::sync::Mutex::new(shortcut::requested(std::env::args()))))
        .setup(|app| {
            paths::init(app.path().app_data_dir()?);
            crashlog::install();
            if paths::root() != paths::default_root() {
                let _ = app.asset_protocol_scope().allow_directory(paths::instances(), true);
            }
            paths::init_resources(app.path().resource_dir()?);
            if let Some(w) = app.get_webview_window("main") {
                engine::window_state::restore(&w);
            }
            app.manage(tray::init(app.handle()));
            #[cfg(any(windows, target_os = "linux"))]
            let _ = app.deep_link().register_all();
            let handle = app.handle().clone();
            app.deep_link().on_open_url(move |e| commands::desktop::open_pack(&handle, e.urls().iter().map(|u| u.as_str())));
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                commands::desktop::open_pack(app.handle(), urls.iter().map(|u| u.as_str()));
            }
            engine::discord::start(app.handle());
            engine::media::start(app.handle());
            watchdog::start(app.handle());
            Ok(())
        })
        .on_window_event(|window, event| {
            if let Some(w) = window.app_handle().get_webview_window(window.label()) {
                match event {
                    WindowEvent::Moved(_) | WindowEvent::Resized(_) => engine::window_state::save(&w, false),
                    WindowEvent::CloseRequested { .. } => engine::window_state::save(&w, true),
                    _ => {}
                }
            }
            if let WindowEvent::CloseRequested { api, .. } = event {
                let app = window.app_handle();
                if app.state::<tray::Tray>().available() && !app.state::<Games>().list().is_empty() {
                    api.prevent_close();
                    let _ = window.hide();
                }
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::jobs::jobs_list,
            commands::accounts::account_list,
            commands::accounts::account_login,
            commands::accounts::account_login_elyby,
            commands::accounts::account_select,
            commands::accounts::account_remove,
            commands::accounts::account_profile,
            commands::accounts::skin_wear,
            commands::accounts::skin_lookup,
            commands::accounts::wardrobe_add_data,
            commands::accounts::optifine_cape,
            commands::accounts::wardrobe_list,
            commands::accounts::wardrobe_add_file,
            commands::accounts::wardrobe_add_nick,
            commands::accounts::wardrobe_remove,
            commands::accounts::wardrobe_rename,
            commands::accounts::skin_reset,
            commands::accounts::cape_select,
            commands::jobs::job_cancel,
            commands::java::java_list,
            commands::java::java_supported,
            commands::java::java_install,
            commands::java::java_remove,
            commands::java::java_check,
            commands::game::mc_versions,
            commands::game::loader_versions,
            commands::game::instance_list,
            commands::game::instance_create,
            commands::game::instance_delete,
            commands::game::instance_set_icon,
            commands::game::renderer_get,
            commands::game::renderer_set,
            commands::game::template_list,
            commands::game::template_save,
            commands::game::template_delete,
            commands::game::template_create,
            commands::game::instance_cover,
            commands::game::instance_set_cover,
            commands::game::client_versions,
            commands::game::instance_update,
            commands::game::instance_metrics,
            commands::game::instance_duplicate,
            commands::game::preset_apply,
            commands::game::game_launch,
            commands::game::game_running,
            commands::game::game_stop,
            commands::game::game_toast,
            commands::game::game_social,
            commands::game::import_list,
            commands::game::import_scan,
            commands::game::import_instance,
            commands::servers::server_status,
            commands::worlds::world_list,
            commands::worlds::world_rename,
            commands::worlds::world_duplicate,
            commands::worlds::world_delete,
            commands::worlds::world_export,
            commands::worlds::saved_servers,
            commands::worlds::saved_server_add,
            commands::worlds::saved_server_remove,
            commands::worlds::saved_server_pin,
            commands::worlds::screenshot_list,
            commands::worlds::screenshot_delete,
            commands::worlds::screenshot_open,
            commands::worlds::screenshot_discord,
            commands::worlds::instance_open_folder,
            commands::worlds::crash_report_open,
            commands::game::crash_reports_get,
            commands::game::crash_reports_set,
            commands::game::crash_report_send,
            commands::worlds::instance_info,
            commands::worlds::instance_summary,
            commands::worlds::instance_open_log,
            commands::worlds::instance_clean,
            commands::worlds::instance_repair,
            commands::content::content_search,
            commands::content::content_categories,
            commands::content::content_install,
            commands::content::content_project,
            commands::content::content_versions,
            commands::content::content_plan,
            commands::content::content_identify,
            commands::content::content_safety,
            commands::content::pack_order,
            commands::content::pack_order_set,
            commands::content::modpack_install,
            commands::content::modpack_import,
            commands::content::modpack_export,
            commands::content::content_list,
            commands::content::content_add_files,
            commands::content::content_copy_mods,
            commands::content::content_icon,
            commands::content::content_conflicts,
            commands::content::lag_scan,
            commands::content::lag_fix,
            commands::content::memory_info,
            commands::content::instance_set_memory,
            commands::content::content_set_enabled,
            commands::content::content_remove,
            commands::content::content_updates,
            commands::content::content_update,
            commands::content::content_audit,
            commands::storage::storage_usage,
            commands::storage::storage_clear_temp,
            commands::storage::storage_dedup,
            commands::storage::storage_location,
            commands::storage::storage_move,
            commands::desktop::backup_list,
            commands::desktop::backup_create,
            commands::desktop::backup_restore,
            commands::desktop::backup_delete,
            commands::desktop::backup_open_folder,
            commands::desktop::shortcut_create,
            commands::desktop::launch_request,
            commands::desktop::pack_request,
            commands::desktop::launcher_log,
            commands::desktop::ui_ready,
            commands::update::update_check,
            commands::update::update_install,
            commands::desktop::launcher_log_open,
            commands::desktop::tray_labels,
            commands::desktop::autostart_get,
            commands::desktop::autostart_set,
            commands::desktop::theme_list,
            commands::desktop::media_now,
            commands::desktop::media_control,
            commands::desktop::theme_import,
            commands::desktop::theme_css,
            commands::desktop::theme_delete,
            commands::desktop::background_get,
            commands::desktop::background_set,
            commands::desktop::settings_export,
            commands::desktop::settings_import,
            commands::social::social_me,
            commands::social::wardrobe_push,
            commands::social::wardrobe_get,
            commands::social::social_cosmetics,
            commands::social::social_sign_up,
            commands::social::social_rename,
            commands::social::social_friends,
            commands::social::social_friend_request,
            commands::social::social_friend_accept,
            commands::social::social_request_delete,
            commands::social::social_friend_remove,
            commands::social::social_messages,
            commands::social::social_top,
            commands::social::social_search,
            commands::social::social_room,
            commands::social::social_user,
            commands::social::social_likes,
            commands::social::social_like,
            commands::social::social_link,
            commands::social::social_unlink,
            commands::social::social_delete,
            commands::social::social_connect,
            commands::social::social_chat,
            commands::social::social_presence,
            commands::social::social_party,
            commands::social::social_party_invite,
            commands::social::social_party_join,
            commands::social::social_party_decline,
            commands::social::social_party_leave,
            commands::social::social_party_room,
            commands::social::sync_list,
            commands::social::sync_get,
            commands::social::sync_put,
            commands::social::sync_delete,
            commands::social::sync_build,
            commands::social::share_build,
            commands::social::share_log,
            commands::social::share_screenshot,
            commands::social::share_screenshot_file,
            commands::social::share_get,
            commands::social::build_install,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
