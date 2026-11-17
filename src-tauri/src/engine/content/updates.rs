
use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use serde::Serialize;

use super::modrinth::{self, primary_file};
use super::{checked_file, curseforge, read_index, write_index, ContentEntry, ContentKind, DISABLED};
use crate::engine::core::http::{self, Hash};
use crate::engine::core::jobs::Job;
use crate::engine::game::install::{download_all, FileTask};
use crate::engine::instances;

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct Update {
    pub folder: String,
    pub file: String,
    pub title: String,
    pub new_file: String,
    pub version: String,
    pub changelog: Option<String>,
    #[serde(skip)]
    enabled: bool,
    #[serde(skip)]
    task: Option<FileTask>,
    #[serde(skip)]
    entry: Option<ContentEntry>,
}

fn kind_of(folder: &str) -> ContentKind {
    match folder {
        "resourcepacks" => ContentKind::ResourcePack,
        "shaderpacks" => ContentKind::Shader,
        _ => ContentKind::Mod,
    }
}

fn on_disk(file: &str, enabled: bool) -> String {
    if enabled { file.to_string() } else { format!("{file}{DISABLED}") }
}

pub async fn check(instance_id: &str) -> Result<Vec<Update>, String> {
    let inst = instances::get(instance_id)?;
    let game = instances::game_dir(instance_id)?;
    let index = read_index(instance_id);
    let files: Vec<_> = super::list(instance_id)?.into_iter().filter(|f| !f.locked).collect();
    let mut out = vec![];

    let (cf, rest): (Vec<_>, Vec<_>) =
        files.into_iter().partition(|f| index.iter().any(|e| e.is_curseforge() && e.folder == f.folder && e.file == f.file));
    for f in cf {
        let e = index.iter().find(|e| e.folder == f.folder && e.file == f.file).unwrap();
        let Ok(id) = e.project_id.parse() else { continue };
        let Ok(new) = curseforge::latest_file(id, kind_of(&f.folder), Some(&inst)).await else { continue };
        if new.id.to_string() == e.version_id || new.download_url.is_none() {
            continue;
        }
        let dest = checked_file(instance_id, &f.folder, &on_disk(&new.file_name, f.enabled))?;
        out.push(Update {
            new_file: new.file_name.clone(),
            version: new.display_name.clone(),
            changelog: None,
            task: Some(curseforge::task(&new, dest, &f.title)?),
            entry: Some(curseforge::entry(&new, e.title.clone(), &f.folder)),
            folder: f.folder,
            file: f.file,
            title: f.title,
            enabled: f.enabled,
        });
    }

    let hashed = {
        let paths: Vec<_> = rest.iter().map(|f| game.join(&f.folder).join(on_disk(&f.file, f.enabled))).collect();
        tokio::task::spawn_blocking(move || paths.iter().map(|p| http::sha1_file(p).ok()).collect::<Vec<_>>()).await.map_err(|e| e.to_string())?
    };
    let mut found = vec![];
    for folder in super::FOLDERS {
        let kind = kind_of(folder);
        if kind == ContentKind::Mod && inst.loader.is_none() {
            continue;
        }
        let hashes: Vec<String> = rest.iter().zip(&hashed).filter(|(f, _)| f.folder == folder).filter_map(|(_, h)| h.clone()).collect();
        let latest = modrinth::latest_by_hash(&hashes, &modrinth::loaders_for(kind, Some(&inst)), &inst.mc_version).await?;
        for (f, h) in rest.iter().zip(&hashed).filter(|(f, _)| f.folder == folder) {
            let Some(v) = h.as_ref().and_then(|h| latest.get(h).map(|v| (h, v))).and_then(|(h, v)| (primary_file(v).ok()?.hashes.sha1 != *h).then_some(v)) else { continue };
            found.push((f.clone(), v.clone()));
        }
    }
    let unknown: Vec<String> = found.iter().filter(|(f, _)| f.project_id.is_none()).map(|(_, v)| v.project_id.clone()).collect();
    let titles = modrinth::titles(&unknown).await.unwrap_or_default();
    for (f, v) in found {
        let p = primary_file(&v)?;
        if p.filename.contains(['/', '\\']) {
            continue;
        }
        let title = if f.project_id.is_some() { f.title.clone() } else { titles.get(&v.project_id).cloned().unwrap_or_else(|| f.title.clone()) };
        out.push(Update {
            new_file: p.filename.clone(),
            version: v.version_number.clone(),
            changelog: v.changelog.clone().filter(|c| !c.trim().is_empty()),
            task: Some(FileTask {
                url: p.url.clone(),
                dest: checked_file(instance_id, &f.folder, &on_disk(&p.filename, f.enabled))?,
                hash: Some(Hash::Sha512(p.hashes.sha512.clone())),
                size: Some(p.size),
            }),
            entry: Some(ContentEntry {
                project_id: v.project_id.clone(),
                version_id: v.id.clone(),
                title: title.clone(),
                folder: f.folder.clone(),
                file: p.filename.clone(),
                source: None,
            }),
            folder: f.folder,
            file: f.file,
            title,
            enabled: f.enabled,
        });
    }
    out.sort_by(|a, b| (&a.folder, a.title.to_lowercase()).cmp(&(&b.folder, b.title.to_lowercase())));
    Ok(out)
}

pub async fn apply(instance_id: &str, only: Option<Vec<String>>, job: &Arc<Job>) -> Result<usize, String> {
    job.progress("resolve", 0, None);
    let mut updates = check(instance_id).await?;
    if let Some(only) = only {
        let only: HashSet<String> = only.into_iter().collect();
        updates.retain(|u| only.contains(&format!("{}/{}", u.folder, u.file)));
    }
    download_all(updates.iter_mut().filter_map(|u| u.task.take()).collect(), job).await?;

    let mut index = read_index(instance_id);
    for u in &updates {
        if u.new_file != u.file {
            let old = checked_file(instance_id, &u.folder, &on_disk(&u.file, u.enabled))?;
            if old.exists() {
                std::fs::remove_file(old).map_err(|e| e.to_string())?;
            }
        }
        index.retain(|e| !(e.folder == u.folder && (e.file == u.file || e.file == u.new_file)));
        index.extend(u.entry.clone());
    }
    write_index(instance_id, &index)?;
    Ok(updates.len())
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Issue {
    pub kind: &'static str,
    pub title: String,
    pub other: String,
}

pub async fn audit(instance_id: &str) -> Result<Vec<Issue>, String> {
    let installed = modrinth::installed_mods(instance_id).await?;
    let have: HashSet<&str> = installed.iter().map(|v| v.project_id.as_str()).collect();
    let mut raw: Vec<(&'static str, String, String)> = modrinth::incompatible_pairs(&installed, &installed)
        .into_iter()
        .map(|(a, b)| ("incompatible", a.to_string(), b.to_string()))
        .collect();
    for v in &installed {
        for d in v.dependencies.iter().filter(|d| d.dependency_type == "required") {
            if let Some(p) = d.project_id.as_deref().filter(|p| !have.contains(p)) {
                raw.push(("missing", v.project_id.clone(), p.to_string()));
            }
        }
    }
    raw.dedup();
    let ids: Vec<String> = raw.iter().flat_map(|(_, a, b)| [a.clone(), b.clone()]).collect::<HashSet<_>>().into_iter().collect();
    let names: HashMap<String, String> = modrinth::titles(&ids).await.unwrap_or_default();
    let name = |id: &String| names.get(id).cloned().unwrap_or_else(|| id.clone());
    Ok(raw.iter().map(|(kind, a, b)| Issue { kind, title: name(a), other: name(b) }).collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::core::paths;
    use crate::engine::game::loaders::{Loader, LoaderKind};

    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn updates_old_sodium() {
        paths::init(std::env::temp_dir().join(format!("kromvia-upd-{}", std::process::id())));
        let inst = instances::create("upd", "1.21.4", Some(Loader { kind: LoaderKind::Fabric, version: "0.16.10".into() })).unwrap();
        let old = "https://cdn.modrinth.com/data/AANobbMI/versions/joBzVWtR/sodium-fabric-0.6.2%2Bmc1.21.4.jar";
        let dest = instances::game_dir(&inst.id).unwrap().join("mods/sodium-old.jar.disabled");
        let job = Arc::new(Job::detached("upd"));
        download_all(vec![FileTask { url: old.into(), dest, hash: None, size: None }], &job).await.unwrap();

        let found = check(&inst.id).await.unwrap();
        println!("{:?}", found.iter().map(|u| (&u.title, &u.version, &u.new_file)).collect::<Vec<_>>());
        assert_eq!(found.len(), 1);
        assert_eq!(found[0].title, "Sodium");
        assert_eq!(apply(&inst.id, None, &job).await.unwrap(), 1);
        let files = super::super::list(&inst.id).unwrap();
        assert_eq!((files.len(), files[0].enabled, files[0].title.as_str()), (1, false, "Sodium"));
        assert!(check(&inst.id).await.unwrap().is_empty());
        println!("audit: {:?}", audit(&inst.id).await.unwrap());
        instances::delete(&inst.id).unwrap();
    }
}
