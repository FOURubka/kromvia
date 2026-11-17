
use std::sync::Mutex;

use tauri::{AppHandle, Emitter, Manager, State};

use crate::engine::backups::{self, Backup};
use crate::engine::core::{crashlog, jobs::Jobs};
use crate::engine::game::launch::Games;
use crate::engine::shortcut;
use crate::tray::Tray;

fn not_running(games: &Games, instance_id: &str) -> Result<(), String> {
    if games.list().iter().any(|r| r.instance_id == instance_id) {
        return Err("stop the game first".into());
    }
    Ok(())
}

#[tauri::command]
pub fn backup_list(instance_id: String) -> Result<Vec<Backup>, String> {
    backups::list(&instance_id)
}

#[tauri::command]
pub fn backup_create(app: AppHandle, jobs: State<'_, Jobs>, instance_id: String) -> Result<u64, String> {
    jobs.spawn(&app, format!("backup-{instance_id}"), move |job| async move {
        tauri::async_runtime::spawn_blocking(move || backups::create(&instance_id, &job).map(|_| ())).await.map_err(|e| e.to_string())?
    })
}

#[tauri::command]
pub async fn backup_restore(games: State<'_, Games>, instance_id: String, name: String) -> Result<(), String> {
    not_running(&games, &instance_id)?;
    tauri::async_runtime::spawn_blocking(move || backups::restore(&instance_id, &name)).await.map_err(|e| e.to_string())?
}

#[tauri::command]
pub fn backup_delete(instance_id: String, name: String) -> Result<(), String> {
    backups::delete(&instance_id, &name)
}

#[tauri::command]
pub fn backup_open_folder(instance_id: String) -> Result<(), String> {
    crate::engine::opener::open_path(backups::folder(&instance_id)?)
}

#[tauri::command]
pub fn shortcut_create(instance_id: String) -> Result<String, String> {
    shortcut::create(&instance_id).map(|p| p.to_string_lossy().into_owned())
}

#[derive(Default)]
pub struct PendingLaunch(pub Mutex<Option<String>>);

#[tauri::command]
pub fn launch_request(pending: State<'_, PendingLaunch>) -> Option<String> {
    pending.0.lock().unwrap().take()
}

#[derive(Default)]
pub struct PendingPack(pub Mutex<Option<String>>);

pub fn pack_code(url: &str) -> Option<String> {
    let code = url.strip_prefix("kromvia://pack/")?.trim_end_matches('/');
    ((4..=16).contains(&code.len()) && code.chars().all(|c| c.is_ascii_alphanumeric())).then(|| code.to_ascii_uppercase())
}

pub fn open_pack<'a>(app: &AppHandle, urls: impl IntoIterator<Item = &'a str>) {
    let Some(code) = urls.into_iter().find_map(pack_code) else { return };
    *app.state::<PendingPack>().0.lock().unwrap() = Some(code);
    crate::tray::show_main(app);
    let _ = app.emit("pack-request", ());
}

#[tauri::command]
pub fn pack_request(pending: State<'_, PendingPack>) -> Option<String> {
    pending.0.lock().unwrap().take()
}

#[tauri::command]
pub fn launcher_log(text: String) {
    crashlog::write("webview", &text.chars().take(8000).collect::<String>());
}

#[tauri::command]
pub fn ui_ready(app: AppHandle) {
    crate::watchdog::ready(&app);
}

#[tauri::command]
pub fn launcher_log_open() -> Result<(), String> {
    let dir = crashlog::dir();
    std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
    crate::engine::opener::open_path(dir)
}

#[tauri::command]
pub fn tray_labels(tray: State<'_, Tray>, show: String, quit: String) {
    tray.set_labels(&show, &quit);
}

#[tauri::command]
pub fn autostart_get() -> bool {
    crate::engine::autostart::enabled()
}

#[tauri::command]
pub fn autostart_set(on: bool) -> Result<(), String> {
    crate::engine::autostart::set(on)
}

#[tauri::command]
pub fn theme_list() -> Vec<crate::engine::appearance::Theme> {
    crate::engine::appearance::themes()
}

#[tauri::command]
pub fn theme_import(path: String) -> Result<crate::engine::appearance::Theme, String> {
    crate::engine::appearance::import_theme(&path)
}

#[tauri::command]
pub fn theme_css(id: String) -> Result<String, String> {
    crate::engine::appearance::theme_css(&id)
}

#[tauri::command]
pub fn theme_delete(id: String) -> Result<(), String> {
    crate::engine::appearance::delete_theme(&id)
}

#[tauri::command]
pub fn background_get() -> Option<String> {
    crate::engine::appearance::background()
}

#[tauri::command]
pub fn background_set(image: Option<String>) -> Result<(), String> {
    crate::engine::appearance::set_background(image.as_deref())
}

#[tauri::command]
pub fn settings_export(path: String, local: serde_json::Map<String, serde_json::Value>) -> Result<(), String> {
    crate::engine::appearance::export(&path, local)
}

#[tauri::command]
pub fn settings_import(path: String) -> Result<serde_json::Map<String, serde_json::Value>, String> {
    crate::engine::appearance::import(&path)
}

#[tauri::command]
pub fn media_now() -> Option<crate::engine::media::Track> {
    crate::engine::media::last()
}

#[tauri::command]
pub async fn media_control(action: String) -> Result<(), String> {
    crate::engine::media::control(&action, &serde_json::Value::Null).await
}

#[cfg(test)]
mod tests {
    use super::pack_code;

    #[test]
    fn reads_pack_links() {
        assert_eq!(pack_code("kromvia://pack/ab23cd45"), Some("AB23CD45".into()));
        assert_eq!(pack_code("kromvia://pack/AB23CD45/"), Some("AB23CD45".into()));
        assert_eq!(pack_code("kromvia://pack/../x"), None);
        assert_eq!(pack_code("kromvia://room/AB23CD45"), None);
        assert_eq!(pack_code("https://kromvia.com/s/AB23CD45"), None);
    }
}

#[tauri::command]
pub fn network_get() -> crate::engine::core::http::Limits {
    crate::engine::core::http::limits()
}

#[tauri::command]
pub fn network_set(limits: crate::engine::core::http::Limits) -> Result<(), String> {
    crate::engine::core::http::set_limits(limits)
}

#[tauri::command]
pub fn menu_media_list() -> crate::engine::menu_media::Media {
    crate::engine::menu_media::list()
}

#[tauri::command]
pub fn menu_media_add(paths: Vec<String>) -> Result<crate::engine::menu_media::Media, String> {
    crate::engine::menu_media::add(&paths)
}

#[tauri::command]
pub fn menu_media_remove(kind: String, name: String) -> Result<crate::engine::menu_media::Media, String> {
    crate::engine::menu_media::remove(&kind, &name)
}
