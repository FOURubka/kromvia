
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use futures_util::{stream, StreamExt};
use serde::{Deserialize, Serialize};

use super::version::{rules_allow, VersionJson};
use crate::engine::core::http::{self, Download, Hash};
use crate::engine::core::jobs::Job;
use crate::engine::core::paths::{self, safe_join};

const MANIFEST_URL: &str = "https://piston-meta.mojang.com/mc/game/version_manifest_v2.json";
const ASSETS_URL: &str = "https://resources.download.minecraft.net";

#[derive(Deserialize, Serialize, Clone)]
pub struct Manifest {
    pub versions: Vec<ManifestEntry>,
}

#[derive(Deserialize, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ManifestEntry {
    pub id: String,
    #[serde(rename = "type")]
    pub kind: String,
    pub url: String,
    pub sha1: String,
    pub release_time: String,
}

pub async fn manifest() -> Result<Manifest, String> {
    let cached = paths::versions().join("version_manifest_v2.json");
    match http::get_json::<Manifest>(MANIFEST_URL).await {
        Ok(m) => {
            let _ = std::fs::create_dir_all(paths::versions());
            let _ = std::fs::write(&cached, serde_json::to_vec(&m).unwrap_or_default());
            Ok(m)
        }
        Err(e) => std::fs::read(&cached)
            .ok()
            .and_then(|b| serde_json::from_slice(&b).ok())
            .ok_or(e),
    }
}

fn version_json_path(id: &str) -> Result<PathBuf, String> {
    safe_join(&paths::versions(), &format!("{id}/{id}.json"))
}

fn read_version(path: &Path) -> Option<VersionJson> {
    serde_json::from_slice(&std::fs::read(path).ok()?).ok()
}

pub async fn vanilla_json(id: &str, job: &Job) -> Result<VersionJson, String> {
    let path = version_json_path(id)?;
    if let Some(v) = read_version(&path) {
        return Ok(v);
    }
    let entry = manifest()
        .await?
        .versions
        .into_iter()
        .find(|v| v.id == id)
        .ok_or_else(|| format!("unknown Minecraft version {id}"))?;
    let d = Download { url: &entry.url, dest: &path, hash: Some(Hash::Sha1(entry.sha1)), size: None };
    http::download(&d, job.cancel_flag(), |_, _| {}).await?;
    read_version(&path).ok_or_else(|| format!("broken version file for {id}"))
}

pub fn client_jar(mc: &str) -> Result<PathBuf, String> {
    safe_join(&paths::versions(), &format!("{mc}/{mc}.jar"))
}

pub fn launch_jar(mc: &str, version_id: &str) -> Result<PathBuf, String> {
    if version_id == mc {
        return client_jar(mc);
    }
    safe_join(&paths::versions(), &format!("{version_id}/{version_id}.jar"))
}

pub fn log_config_path(id: &str) -> Result<PathBuf, String> {
    safe_join(&paths::assets(), &format!("log_configs/{id}"))
}

pub struct FileTask {
    pub url: String,
    pub dest: PathBuf,
    pub hash: Option<Hash>,
    pub size: Option<u64>,
}

#[derive(Deserialize)]
struct AssetIndex {
    objects: HashMap<String, AssetObject>,
    #[serde(default, rename = "virtual")]
    is_virtual: bool,
    #[serde(default)]
    map_to_resources: bool,
}

#[derive(Deserialize)]
struct AssetObject {
    hash: String,
    size: u64,
}

pub async fn ensure_files(mc: &str, version: &VersionJson, game_dir: &Path, job: &Arc<Job>) -> Result<(), String> {
    let (tasks, (index, index_id)) = file_tasks(mc, version, job).await?;
    download_all(tasks, job).await?;

    let jar = launch_jar(mc, &version.id)?;
    if !jar.exists() {
        std::fs::create_dir_all(jar.parent().unwrap()).map_err(|e| e.to_string())?;
        if std::fs::hard_link(client_jar(mc)?, &jar).is_err() {
            std::fs::copy(client_jar(mc)?, &jar).map_err(|e| e.to_string())?;
        }
    }

    if index.is_virtual || index.map_to_resources {
        let target = if index.map_to_resources {
            game_dir.join("resources")
        } else {
            legacy_assets_dir(&index_id)?
        };
        for (name, obj) in &index.objects {
            let dest = safe_join(&target, name)?;
            if !has_size(&dest, Some(obj.size)) {
                std::fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
                let src = paths::assets().join("objects").join(object_rel(&obj.hash)?);
                std::fs::copy(src, dest).map_err(|e| e.to_string())?;
            }
        }
    }
    Ok(())
}

pub async fn verify_files(mc: &str, version: &VersionJson, job: &Arc<Job>) -> Result<usize, String> {
    let (tasks, _) = file_tasks(mc, version, job).await?;
    let tasks: Vec<FileTask> = tasks.into_iter().filter(|t| t.hash.is_some() && t.dest.is_file()).collect();
    let total: u64 = tasks.iter().filter_map(|t| t.size).sum();
    let done = Arc::new(AtomicU64::new(0));
    job.progress("verify", 0, Some(total));
    let mut results = stream::iter(tasks)
        .map(|t| {
            let (done, job) = (done.clone(), job.clone());
            async move {
                let size = t.size.unwrap_or(0);
                let bad = tokio::task::spawn_blocking(move || {
                    let bad = http::verify_hash_blocking(&t.dest, t.hash.as_ref().unwrap()).is_err();
                    if bad {
                        let _ = std::fs::remove_file(&t.dest);
                    }
                    bad
                })
                .await
                .unwrap_or(false);
                job.progress("verify", (done.fetch_add(size, Ordering::Relaxed) + size).min(total), Some(total));
                bad
            }
        })
        .buffer_unordered(http::parallel());
    let mut broken = 0;
    while let Some(bad) = results.next().await {
        if job.is_cancelled() {
            return Err("cancelled".into());
        }
        broken += bad as usize;
    }
    let jar = launch_jar(mc, &version.id)?;
    if !client_jar(mc)?.exists() && jar != client_jar(mc)? {
        let _ = std::fs::remove_file(jar);
    }
    Ok(broken)
}

async fn file_tasks(mc: &str, version: &VersionJson, job: &Arc<Job>) -> Result<(Vec<FileTask>, (AssetIndex, String)), String> {
    let mut tasks = Vec::new();

    let client = version.downloads.as_ref().ok_or("version has no client download")?;
    tasks.push(FileTask {
        url: client.client.url.clone(),
        dest: client_jar(mc)?,
        hash: client.client.sha1.clone().map(Hash::Sha1),
        size: client.client.size,
    });

    for lib in version.libraries.iter().filter(|l| rules_allow(&l.rules)) {
        for art in [lib.artifact(), lib.native_artifact()].into_iter().flatten() {
            let path = art.path.ok_or_else(|| format!("library {} has no path", lib.name))?;
            tasks.push(FileTask { url: art.url, dest: safe_join(&paths::libraries(), &path)?, hash: art.sha1.map(Hash::Sha1), size: art.size });
        }
    }

    if let Some(log) = version.logging.as_ref().and_then(|l| l.client.as_ref()) {
        tasks.push(FileTask {
            url: log.file.url.clone(),
            dest: log_config_path(&log.file.id)?,
            hash: Some(Hash::Sha1(log.file.sha1.clone())),
            size: Some(log.file.size),
        });
    }

    let index_ref = version.asset_index.as_ref().ok_or("version has no asset index")?;
    let index_path = safe_join(&paths::assets(), &format!("indexes/{}.json", index_ref.id))?;
    if !has_size(&index_path, Some(index_ref.size)) {
        let d = Download {
            url: &index_ref.url,
            dest: &index_path,
            hash: Some(Hash::Sha1(index_ref.sha1.clone())),
            size: Some(index_ref.size),
        };
        http::download(&d, job.cancel_flag(), |_, _| {}).await?;
    }
    let index: AssetIndex = serde_json::from_slice(&std::fs::read(&index_path).map_err(|e| e.to_string())?)
        .map_err(|e| format!("broken asset index: {e}"))?;
    for obj in index.objects.values() {
        tasks.push(FileTask {
            url: format!("{ASSETS_URL}/{}", object_rel(&obj.hash)?),
            dest: safe_join(&paths::assets(), &format!("objects/{}", object_rel(&obj.hash)?))?,
            hash: Some(Hash::Sha1(obj.hash.clone())),
            size: Some(obj.size),
        });
    }
    Ok((tasks, (index, index_ref.id.clone())))
}

pub fn legacy_assets_dir(index_id: &str) -> Result<PathBuf, String> {
    safe_join(&paths::assets(), &format!("virtual/{index_id}"))
}

fn object_rel(hash: &str) -> Result<String, String> {
    if hash.len() != 40 || !hash.bytes().all(|b| b.is_ascii_hexdigit()) {
        return Err(format!("bad asset hash {hash}"));
    }
    Ok(format!("{}/{hash}", &hash[..2]))
}

fn has_size(path: &Path, size: Option<u64>) -> bool {
    match std::fs::metadata(path) {
        Ok(m) => size.is_none_or(|s| m.len() == s),
        Err(_) => false,
    }
}

pub async fn download_all(tasks: Vec<FileTask>, job: &Arc<Job>) -> Result<(), String> {
    let mut seen = std::collections::HashSet::new();
    let tasks: Vec<FileTask> = tasks
        .into_iter()
        .filter(|t| !has_size(&t.dest, t.size) && seen.insert(t.dest.clone()))
        .collect();
    if let Some(t) = tasks.iter().find(|t| t.url.is_empty()) {
        return Err(format!("{} is missing and has no download URL", t.dest.display()));
    }
    let total: u64 = tasks.iter().filter_map(|t| t.size).sum();
    let done = Arc::new(AtomicU64::new(0));
    job.progress("download", 0, Some(total));

    let mut results = stream::iter(tasks)
        .map(|t| {
            let (done, job) = (done.clone(), job.clone());
            async move {
                let mut last = 0u64;
                let d = Download { url: &t.url, dest: &t.dest, hash: t.hash, size: t.size };
                http::download(&d, job.cancel_flag(), |got, _| {
                    let delta = got.saturating_sub(last);
                    last = got;
                    let now = done.fetch_add(delta, Ordering::Relaxed) + delta;
                    job.progress("download", now.min(total), Some(total));
                })
                .await
            }
        })
        .buffer_unordered(http::parallel());
    while let Some(result) = results.next().await {
        result?;
    }
    Ok(())
}
