
use serde::Serialize;
use tauri::{AppHandle, Manager, State};
use tauri_plugin_updater::UpdaterExt;

use crate::engine::core::jobs::Jobs;
use crate::engine::game::launch::Games;

#[derive(Serialize)]
pub struct Available {
    pub version: String,
    pub notes: Option<String>,
}

#[tauri::command]
pub async fn update_check(app: AppHandle) -> Result<Option<Available>, String> {
    if app.path().resource_dir().is_ok_and(|d| d.join("package-managed").exists()) {
        return Ok(None);
    }
    let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| Available { version: u.version, notes: u.body }))
}

#[tauri::command]
pub fn update_install(app: AppHandle, jobs: State<'_, Jobs>, games: State<'_, Games>) -> Result<u64, String> {
    if !games.list().is_empty() {
        return Err("close the game first".into());
    }
    jobs.spawn(&app.clone(), "update".into(), move |job| async move {
        let update = app.updater().map_err(|e| e.to_string())?.check().await.map_err(|e| e.to_string())?;
        let Some(update) = update else { return Err("no update".into()) };
        let mut done = 0u64;
        update
            .download_and_install(
                |chunk, total| {
                    done += chunk as u64;
                    job.progress("download", done, total);
                },
                || {},
            )
            .await
            .map_err(|e| e.to_string())?;
        app.restart()
    })
}
