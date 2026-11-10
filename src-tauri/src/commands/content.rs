use tauri::{AppHandle, State};

use crate::engine::content::{self, curseforge, modrinth, mrpack, updates, ContentKind, InstalledFile};
use crate::engine::core::jobs::Jobs;
use crate::engine::instances;

#[tauri::command]
pub async fn content_search(
    query: String,
    kind: ContentKind,
    instance_id: Option<String>,
    offset: u32,
    source: Option<String>,
    filters: Option<modrinth::SearchFilters>,
) -> Result<modrinth::SearchResult, String> {
    let inst = instance_id.map(|id| instances::get(&id)).transpose()?;
    let filters = filters.unwrap_or_default();
    if is_curseforge(&source) {
        return curseforge::search(&query, kind, inst.as_ref(), offset, &filters).await;
    }
    modrinth::search(&query, kind, inst.as_ref(), offset, &filters).await
}

#[tauri::command]
pub async fn content_categories(kind: ContentKind, source: Option<String>) -> Result<Vec<modrinth::Category>, String> {
    if is_curseforge(&source) {
        return curseforge::categories(kind).await;
    }
    modrinth::categories(kind).await
}

fn is_curseforge(source: &Option<String>) -> bool {
    source.as_deref() == Some("curseforge")
}

#[tauri::command]
#[allow(clippy::too_many_arguments)]
pub fn content_install(
    app: AppHandle,
    jobs: State<'_, Jobs>,
    instance_id: String,
    project_id: String,
    kind: ContentKind,
    source: Option<String>,
    version_id: Option<String>,
    world: Option<String>,
) -> Result<u64, String> {
    let key = format!("content-{instance_id}-{project_id}");
    jobs.spawn(&app, key, move |job| async move {
        if is_curseforge(&source) {
            return curseforge::install(&instance_id, &project_id, kind, &job).await.map(|_| ());
        }
        if kind == ContentKind::Datapack {
            let world = world.ok_or("pick a world for the datapack")?;
            return modrinth::install_datapack(&instance_id, &project_id, version_id.as_deref(), &world, &job).await.map(|_| ());
        }
        modrinth::install(&instance_id, &project_id, version_id.as_deref(), kind, &job).await.map(|_| ())
    })
}

#[tauri::command]
pub async fn content_project(project_id: String) -> Result<modrinth::ProjectInfo, String> {
    modrinth::project(&project_id).await
}

#[tauri::command]
pub async fn content_versions(project_id: String, kind: ContentKind, instance_id: Option<String>) -> Result<Vec<modrinth::Version>, String> {
    let inst = instance_id.map(|id| instances::get(&id)).transpose()?;
    modrinth::compatible_versions(&project_id, kind, inst.as_ref()).await
}

#[tauri::command]
pub async fn content_plan(instance_id: String, project_id: String, version_id: Option<String>, kind: ContentKind) -> Result<modrinth::Plan, String> {
    modrinth::plan(&instance_id, &project_id, version_id.as_deref(), kind).await
}

#[tauri::command]
pub fn modpack_install(app: AppHandle, jobs: State<'_, Jobs>, project_id: String, source: Option<String>) -> Result<u64, String> {
    jobs.spawn(&app, format!("modpack-{project_id}"), move |job| async move {
        if is_curseforge(&source) {
            curseforge::install_pack(&project_id, &job).await.map(|_| ())
        } else {
            mrpack::install_from_modrinth(&project_id, &job).await.map(|_| ())
        }
    })
}

#[tauri::command]
pub fn modpack_import(app: AppHandle, jobs: State<'_, Jobs>, path: String) -> Result<u64, String> {
    jobs.spawn(&app, format!("modpack-file-{path}"), move |job| async move {
        let path = std::path::Path::new(&path);
        if path.extension().is_some_and(|e| e == "zip") {
            curseforge::install_zip(path, &job).await.map(|_| ())
        } else {
            mrpack::install_from_file(path, &job).await.map(|_| ())
        }
    })
}

#[tauri::command]
pub async fn content_updates(instance_id: String) -> Result<Vec<updates::Update>, String> {
    updates::check(&instance_id).await
}

#[tauri::command]
pub fn content_update(app: AppHandle, jobs: State<'_, Jobs>, instance_id: String, files: Option<Vec<String>>) -> Result<u64, String> {
    jobs.spawn(&app, format!("update-{instance_id}"), move |job| async move {
        updates::apply(&instance_id, files, &job).await.map(|_| ())
    })
}

#[tauri::command]
pub async fn content_audit(instance_id: String) -> Result<Vec<updates::Issue>, String> {
    updates::audit(&instance_id).await
}

#[tauri::command]
pub fn modpack_export(app: AppHandle, jobs: State<'_, Jobs>, instance_id: String, path: String) -> Result<u64, String> {
    jobs.spawn(&app, format!("export-{instance_id}"), move |job| async move {
        mrpack::export(&instance_id, std::path::Path::new(&path), &job).await
    })
}

#[tauri::command]
pub async fn content_identify(instance_id: String) -> Result<usize, String> {
    content::identify(&instance_id).await
}

#[tauri::command]
pub async fn content_safety(instance_id: String) -> Result<content::safety::Report, String> {
    content::safety::check(&instance_id).await
}

#[tauri::command]
pub fn pack_order(instance_id: String) -> Result<content::PackOrder, String> {
    content::pack_order(&instance_id)
}

#[tauri::command]
pub fn pack_order_set(instance_id: String, enabled: Vec<String>) -> Result<(), String> {
    content::set_pack_order(&instance_id, &enabled)
}

#[tauri::command]
pub fn content_add_files(instance_id: String, paths: Vec<std::path::PathBuf>) -> Result<Vec<String>, String> {
    content::add_files(&instance_id, &paths)
}

#[tauri::command]
pub fn content_copy_mods(app: AppHandle, jobs: State<'_, Jobs>, instance_id: String, from_id: String) -> Result<u64, String> {
    jobs.spawn(&app, format!("copymods-{instance_id}"), move |job| async move { content::copy_mods(&instance_id, &from_id, &job).await })
}

#[tauri::command]
pub fn content_list(instance_id: String) -> Result<Vec<InstalledFile>, String> {
    content::list(&instance_id)
}

#[tauri::command]
pub async fn content_conflicts(instance_id: String) -> Result<Vec<content::conflicts::Conflict>, String> {
    content::conflicts::scan(&instance_id).await
}

#[tauri::command]
pub async fn lag_scan(instance_id: String) -> Result<Vec<crate::engine::game::lag::Finding>, String> {
    crate::engine::game::lag::scan(&instance_id).await
}

#[tauri::command]
pub fn lag_fix(instance_id: String, fix: crate::engine::game::lag::Fix) -> Result<(), String> {
    crate::engine::game::lag::fix(&instance_id, fix)
}

#[tauri::command]
pub fn memory_info(instance_id: String) -> (u64, u64) {
    use crate::engine::game::{lag, tuning};
    (tuning::total_ram_bytes() / (1024 * 1024), lag::auto_memory(&instance_id))
}

#[tauri::command]
pub fn instance_set_memory(instance_id: String, memory_mb: Option<u64>) -> Result<(), String> {
    if memory_mb.is_some_and(|m| !(512..=65536).contains(&m)) {
        return Err("memory must be 512–65536 MB".into());
    }
    crate::engine::instances::set_memory(&instance_id, memory_mb).map(|_| ())
}

#[tauri::command]
pub async fn content_icon(instance_id: String, folder: String, file: String) -> Result<Option<String>, String> {
    content::icon(&instance_id, &folder, &file).await
}

#[tauri::command]
pub fn content_set_enabled(instance_id: String, file: String, enabled: bool) -> Result<(), String> {
    content::set_enabled(&instance_id, &file, enabled)
}

#[tauri::command]
pub fn content_remove(instance_id: String, folder: String, file: String) -> Result<(), String> {
    content::remove(&instance_id, &folder, &file)
}
