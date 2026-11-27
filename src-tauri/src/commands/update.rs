
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

fn updater(app: &AppHandle, beta: bool) -> Result<tauri_plugin_updater::Updater, String> {
    if !beta {
        return app.updater().map_err(|e| e.to_string());
    }
    let url = tauri::Url::parse("https://api.kromvia.com/update/{{target}}/{{arch}}/{{current_version}}?channel=beta").map_err(|e| e.to_string())?;
    app.updater_builder().endpoints(vec![url]).map_err(|e| e.to_string())?.build().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_check(app: AppHandle, beta: Option<bool>) -> Result<Option<Available>, String> {
    if app.path().resource_dir().is_ok_and(|d| d.join("package-managed").exists()) {
        return Ok(None);
    }
    let update = updater(&app, beta.unwrap_or(false))?.check().await.map_err(|e| e.to_string())?;
    Ok(update.map(|u| Available { version: u.version, notes: u.body }))
}

#[tauri::command]
pub fn update_install(app: AppHandle, jobs: State<'_, Jobs>, games: State<'_, Games>, beta: Option<bool>) -> Result<u64, String> {
    if !games.list().is_empty() {
        return Err("close the game first".into());
    }
    jobs.spawn(&app.clone(), "update".into(), move |job| async move {
        let update = updater(&app, beta.unwrap_or(false))?.check().await.map_err(|e| e.to_string())?;
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
