
use std::collections::{HashMap, HashSet, VecDeque};
use std::sync::Arc;

use serde::{Deserialize, Serialize};

use super::{read_index, write_index, ContentEntry, ContentKind};
use crate::engine::core::http::{self, Hash};
use crate::engine::core::jobs::Job;
use crate::engine::core::paths::safe_join;
use crate::engine::game::install::{download_all, FileTask};
use crate::engine::instances::{self, Instance};

const API: &str = "https://api.modrinth.com/v2";

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchHit {
    pub project_id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    pub icon_url: Option<String>,
    pub downloads: u64,
    pub author: String,
    #[serde(default)]
    pub follows: u64,
    #[serde(default)]
    pub date_modified: String,
}

#[derive(Deserialize, Default)]
pub struct SearchFilters {
    #[serde(default)]
    pub sort: Option<String>,
    #[serde(default)]
    pub categories: Vec<String>,
    #[serde(default)]
    pub game_version: Option<String>,
    #[serde(default)]
    pub loader: Option<String>,
}

#[derive(Serialize, Clone, Debug)]
pub struct Category {
    pub id: String,
    pub name: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct SearchResult {
    pub hits: Vec<SearchHit>,
    pub total_hits: u64,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Version {
    pub id: String,
    pub project_id: String,
    #[serde(default)]
    pub version_number: String,
    #[serde(default)]
    pub name: String,
    #[serde(default)]
    pub date_published: String,
    #[serde(default)]
    pub game_versions: Vec<String>,
    #[serde(default)]
    pub loaders: Vec<String>,
    pub version_type: String,
    #[serde(default, skip_serializing)]
    pub changelog: Option<String>,
    pub files: Vec<VersionFile>,
    #[serde(default)]
    pub dependencies: Vec<Dependency>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct VersionFile {
    pub url: String,
    pub filename: String,
    pub primary: bool,
    pub size: u64,
    pub hashes: FileHashes,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct FileHashes {
    #[serde(default)]
    pub sha1: String,
    pub sha512: String,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct Dependency {
    pub version_id: Option<String>,
    pub project_id: Option<String>,
    pub dependency_type: String,
}

#[derive(Deserialize)]
struct Project {
    title: String,
}

pub fn loaders_for(kind: ContentKind, inst: Option<&Instance>) -> Vec<&'static str> {
    match kind {
        ContentKind::Mod => inst.and_then(|i| i.loader.as_ref()).map(|l| l.kind.modrinth_tags().to_vec()).unwrap_or_default(),
        ContentKind::Shader => vec!["iris", "optifine"],
        ContentKind::ResourcePack => vec!["minecraft"],
        ContentKind::Modpack => vec![],
        ContentKind::Datapack => vec!["datapack"],
    }
}

fn project_type(kind: ContentKind) -> &'static str {
    match kind {
        ContentKind::Mod => "mod",
        ContentKind::Modpack => "modpack",
        ContentKind::ResourcePack => "resourcepack",
        ContentKind::Shader => "shader",
        ContentKind::Datapack => "datapack",
    }
}

pub async fn search(query: &str, kind: ContentKind, inst: Option<&Instance>, offset: u32, f: &SearchFilters) -> Result<SearchResult, String> {
    let project_type = project_type(kind);
    let mut facets = vec![vec![format!("project_type:{project_type}")]];
    let loaders = loaders_for(kind, inst);
    if !matches!(kind, ContentKind::ResourcePack | ContentKind::Datapack) && !loaders.is_empty() {
        facets.push(loaders.iter().map(|l| format!("categories:{l}")).collect());
    }
    if let (Some(inst), true) = (inst, kind != ContentKind::Modpack) {
        facets.push(vec![format!("versions:{}", inst.mc_version)]);
    }
    if inst.is_none() || kind == ContentKind::Modpack {
        if let Some(v) = &f.game_version {
            facets.push(vec![format!("versions:{v}")]);
        }
        if let Some(l) = &f.loader {
            facets.push(vec![format!("categories:{l}")]);
        }
    }
    if !f.categories.is_empty() {
        facets.push(f.categories.iter().map(|c| format!("categories:{c}")).collect());
    }
    let facets = serde_json::to_string(&facets).map_err(|e| e.to_string())?;
    let offset = offset.to_string();
    let index = f.sort.as_deref().filter(|s| ["downloads", "follows", "newest", "updated"].contains(s)).unwrap_or("relevance");
    http::get_json_query(
        &format!("{API}/search"),
        &[("query", query), ("facets", &facets), ("index", index), ("limit", "20"), ("offset", &offset)],
    )
    .await
}

#[derive(Deserialize)]
struct Tag {
    name: String,
    project_type: String,
    header: String,
}

pub async fn categories(kind: ContentKind) -> Result<Vec<Category>, String> {
    let tags: Vec<Tag> = http::get_json_query(&format!("{API}/tag/category"), &[]).await?;
    let wanted = match kind {
        ContentKind::Datapack => "mod",
        k => project_type(k),
    };
    let mut out: Vec<Category> = tags
        .into_iter()
        .filter(|t| t.project_type == wanted && t.header == "categories")
        .map(|t| Category { name: titled(&t.name), id: t.name })
        .collect();
    out.sort_by(|a, b| a.name.cmp(&b.name));
    out.dedup_by(|a, b| a.id == b.id);
    Ok(out)
}

fn titled(s: &str) -> String {
    let s = s.replace('-', " ");
    let mut c = s.chars();
    c.next().map(|f| f.to_uppercase().chain(c).collect()).unwrap_or_default()
}

pub async fn compatible_versions(project_id: &str, kind: ContentKind, inst: Option<&Instance>) -> Result<Vec<Version>, String> {
    let tags = loaders_for(kind, inst);
    let loaders = serde_json::to_string(&tags).map_err(|e| e.to_string())?;
    let mut query = vec![];
    if !tags.is_empty() {
        query.push(("loaders", loaders.as_str()));
    }
    let versions_filter;
    if let (Some(inst), true) = (inst, kind != ContentKind::Modpack) {
        versions_filter = serde_json::to_string(&[&inst.mc_version]).map_err(|e| e.to_string())?;
        query.push(("game_versions", &versions_filter));
    }
    http::get_json_query(&format!("{API}/project/{}/version", check_id(project_id)?), &query).await
}

pub async fn latest_version(project_id: &str, kind: ContentKind, inst: Option<&Instance>) -> Result<Version, String> {
    let versions = compatible_versions(project_id, kind, inst).await?;
    versions
        .iter()
        .find(|v| v.version_type == "release")
        .or(versions.first())
        .cloned()
        .ok_or_else(|| "no compatible version".to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct GalleryImage {
    pub url: String,
    #[serde(default)]
    pub title: Option<String>,
}

#[derive(Serialize, Deserialize, Clone, Debug)]
pub struct ProjectInfo {
    pub id: String,
    pub slug: String,
    pub title: String,
    pub description: String,
    #[serde(default)]
    pub body: String,
    pub icon_url: Option<String>,
    #[serde(default)]
    pub gallery: Vec<GalleryImage>,
    pub source_url: Option<String>,
    pub issues_url: Option<String>,
    pub wiki_url: Option<String>,
    #[serde(default)]
    pub downloads: u64,
    #[serde(default)]
    pub followers: u64,
}

pub async fn project(id: &str) -> Result<ProjectInfo, String> {
    http::get_json(&format!("{API}/project/{}", check_id(id)?)).await
}

pub async fn version(id: &str) -> Result<Version, String> {
    http::get_json(&format!("{API}/version/{}", check_id(id)?)).await
}

pub async fn title(project_id: &str) -> String {
    match http::get_json::<Project>(&format!("{API}/project/{project_id}")).await {
        Ok(p) => p.title,
        Err(_) => project_id.to_string(),
    }
}

fn check_id(id: &str) -> Result<&str, String> {
    let ok = !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-' || b == b'_');
    if ok { Ok(id) } else { Err(format!("bad Modrinth id {id}")) }
}

pub fn primary_file(v: &Version) -> Result<&VersionFile, String> {
    v.files.iter().find(|f| f.primary).or(v.files.first()).ok_or_else(|| "version has no files".to_string())
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Planned {
    pub project_id: String,
    pub title: String,
    pub version_number: String,
    pub file: String,
    pub size: u64,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Plan {
    pub files: Vec<Planned>,
    pub conflicts: Vec<String>,
}

async fn resolve(instance_id: &str, inst: &Instance, project_id: &str, version_id: Option<&str>, kind: ContentKind) -> Result<Vec<(Version, String)>, String> {
    let index = read_index(instance_id);
    let mut seen: HashSet<String> = index.iter().map(|e| e.project_id.clone()).collect();
    let mut queue = VecDeque::from([(project_id.to_string(), version_id.map(str::to_string))]);
    let mut planned: Vec<(Version, String)> = Vec::new();
    while let Some((pid, version_id)) = queue.pop_front() {
        let v = match version_id {
            Some(id) => version(&id).await?,
            None => latest_version(&pid, kind, Some(inst)).await.map_err(|e| format!("{pid}: {e}"))?,
        };
        if !seen.insert(v.project_id.clone()) {
            continue;
        }
        if kind == ContentKind::Mod {
            for dep in v.dependencies.iter().filter(|d| d.dependency_type == "required") {
                match (&dep.project_id, &dep.version_id) {
                    (Some(p), _) if seen.contains(p) => {}
                    (Some(p), vid) => queue.push_back((p.clone(), vid.clone())),
                    (None, Some(vid)) => queue.push_back((String::new(), Some(vid.clone()))),
                    (None, None) => {}
                }
            }
        }
        let t = title(&v.project_id).await;
        planned.push((v, t));
    }
    Ok(planned)
}

pub async fn plan(instance_id: &str, project_id: &str, version_id: Option<&str>, kind: ContentKind) -> Result<Plan, String> {
    let inst = instances::get(instance_id)?;
    let planned = resolve(instance_id, &inst, project_id, version_id, kind).await?;
    let conflicts = if kind == ContentKind::Mod { conflicts_with_installed(instance_id, &planned).await? } else { vec![] };
    let files = planned
        .iter()
        .map(|(v, title)| {
            let f = primary_file(v)?;
            Ok(Planned { project_id: v.project_id.clone(), title: title.clone(), version_number: v.version_number.clone(), file: f.filename.clone(), size: f.size })
        })
        .collect::<Result<_, String>>()?;
    Ok(Plan { files, conflicts })
}

pub async fn install(instance_id: &str, project_id: &str, version_id: Option<&str>, kind: ContentKind, job: &Arc<Job>) -> Result<Vec<String>, String> {
    let inst = instances::get(instance_id)?;
    let folder = kind.folder().ok_or("this kind is not installed into the instance folder")?;
    if kind == ContentKind::Mod && inst.loader.is_none() {
        return Err("mods need an instance with a mod loader".into());
    }
    let game = instances::game_dir(instance_id)?;
    let mut index = read_index(instance_id);
    job.progress("resolve", 0, None);
    let planned = resolve(instance_id, &inst, project_id, version_id, kind).await?;
    if kind == ContentKind::Mod {
        let conflicts = conflicts_with_installed(instance_id, &planned).await?;
        if !conflicts.is_empty() {
            return Err(format!("incompatible with installed mods: {}", conflicts.join(", ")));
        }
    }

    let mut tasks = Vec::new();
    for (v, _) in &planned {
        let f = primary_file(v)?;
        if f.filename.contains('/') {
            return Err(format!("bad file name {}", f.filename));
        }
        tasks.push(FileTask {
            url: f.url.clone(),
            dest: safe_join(&game.join(folder), &f.filename)?,
            hash: Some(Hash::Sha512(f.hashes.sha512.clone())),
            size: Some(f.size),
        });
    }
    download_all(tasks, job).await?;

    let mut added = Vec::new();
    for (v, title) in planned {
        let file = primary_file(&v)?.filename.clone();
        index.retain(|e| !(e.folder == folder && e.file == file));
        index.push(ContentEntry { project_id: v.project_id, version_id: v.id, title: title.clone(), folder: folder.into(), file, source: None });
        added.push(title);
    }
    write_index(instance_id, &index)?;
    Ok(added)
}

pub async fn install_datapack(instance_id: &str, project_id: &str, version_id: Option<&str>, world: &str, job: &Arc<Job>) -> Result<String, String> {
    let inst = instances::get(instance_id)?;
    let world_dir = crate::engine::worlds::world_dir(instance_id, world)?;
    job.progress("resolve", 0, None);
    let v = match version_id {
        Some(id) => version(id).await?,
        None => latest_version(project_id, ContentKind::Datapack, Some(&inst)).await?,
    };
    let f = primary_file(&v)?;
    if f.filename.contains(['/', '\\']) {
        return Err(format!("bad file name {}", f.filename));
    }
    let dest = safe_join(&world_dir.join("datapacks"), &f.filename)?;
    if let Some(parent) = dest.parent() {
        std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    download_all(vec![FileTask { url: f.url.clone(), dest, hash: Some(Hash::Sha512(f.hashes.sha512.clone())), size: Some(f.size) }], job).await?;
    Ok(f.filename.clone())
}

pub async fn by_hash(sha1s: &[String]) -> Result<HashMap<String, Version>, String> {
    if sha1s.is_empty() {
        return Ok(HashMap::new());
    }
    let url = format!("{API}/version_files");
    let body = serde_json::json!({ "hashes": sha1s, "algorithm": "sha1" });
    post_json(&url, &body).await
}

pub async fn latest_by_hash(sha1s: &[String], loaders: &[&str], mc: &str) -> Result<HashMap<String, Version>, String> {
    if sha1s.is_empty() {
        return Ok(HashMap::new());
    }
    let url = format!("{API}/version_files/update");
    let mut body = serde_json::json!({ "hashes": sha1s, "algorithm": "sha1", "game_versions": [mc] });
    if !loaders.is_empty() {
        body["loaders"] = serde_json::json!(loaders);
    }
    post_json(&url, &body).await
}

async fn post_json<T: serde::de::DeserializeOwned>(url: &str, body: &serde_json::Value) -> Result<T, String> {
    let resp = http::client().post(url).json(body).send().await.map_err(|e| format!("{url}: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("{url}: HTTP {}", resp.status()));
    }
    resp.json().await.map_err(|e| format!("{url}: {e}"))
}

#[derive(Deserialize)]
struct ProjectTitle {
    id: String,
    title: String,
}

pub async fn titles(ids: &[String]) -> Result<HashMap<String, String>, String> {
    if ids.is_empty() {
        return Ok(HashMap::new());
    }
    let ids = serde_json::to_string(ids).map_err(|e| e.to_string())?;
    let list: Vec<ProjectTitle> = http::get_json_query(&format!("{API}/projects"), &[("ids", &ids)]).await?;
    Ok(list.into_iter().map(|p| (p.id, p.title)).collect())
}

pub async fn installed_mods(instance_id: &str) -> Result<Vec<Version>, String> {
    let game = instances::game_dir(instance_id)?;
    let paths: Vec<_> = super::list(instance_id)?.into_iter().filter(|f| f.folder == "mods" && f.enabled).map(|f| game.join("mods").join(f.file)).collect();
    let hashes = tokio::task::spawn_blocking(move || paths.iter().filter_map(|p| http::sha1_file(p).ok()).collect::<Vec<_>>())
        .await
        .map_err(|e| e.to_string())?;
    Ok(by_hash(&hashes).await?.into_values().collect())
}

fn incompatible(v: &Version) -> impl Iterator<Item = &str> {
    v.dependencies.iter().filter(|d| d.dependency_type == "incompatible").filter_map(|d| d.project_id.as_deref())
}

pub fn incompatible_pairs<'a>(a: &'a [Version], b: &'a [Version]) -> Vec<(&'a str, &'a str)> {
    let mut out = vec![];
    for x in a {
        for y in b {
            if x.project_id != y.project_id
                && (incompatible(x).any(|p| p == y.project_id) || incompatible(y).any(|p| p == x.project_id))
                && !out.iter().any(|&(p, q)| (p, q) == (y.project_id.as_str(), x.project_id.as_str()))
            {
                out.push((x.project_id.as_str(), y.project_id.as_str()));
            }
        }
    }
    out
}

async fn conflicts_with_installed(instance_id: &str, planned: &[(Version, String)]) -> Result<Vec<String>, String> {
    let installed = installed_mods(instance_id).await?;
    let new: Vec<Version> = planned.iter().map(|(v, _)| v.clone()).collect();
    let mut pairs: Vec<(String, String)> = incompatible_pairs(&new, &installed).into_iter().map(|(a, b)| (a.to_string(), b.to_string())).collect();
    pairs.extend(incompatible_pairs(&new, &new).into_iter().map(|(a, b)| (a.to_string(), b.to_string())));
    if pairs.is_empty() {
        return Ok(vec![]);
    }
    let ids: Vec<String> = pairs.iter().flat_map(|(a, b)| [a.clone(), b.clone()]).collect();
    let names = titles(&ids).await.unwrap_or_default();
    let name = |id: &String| names.get(id).cloned().unwrap_or_else(|| id.clone());
    Ok(pairs.iter().map(|(a, b)| format!("{} ↔ {}", name(a), name(b))).collect())
}

#[cfg(test)]
mod tests {
    use super::*;

    fn v(project: &str, incompatible: &[&str]) -> Version {
        Version {
            id: format!("{project}-v"),
            project_id: project.into(),
            version_number: "1".into(),
            name: String::new(),
            date_published: String::new(),
            game_versions: vec![],
            loaders: vec![],
            version_type: "release".into(),
            changelog: None,
            files: vec![],
            dependencies: incompatible
                .iter()
                .map(|p| Dependency { version_id: None, project_id: Some(p.to_string()), dependency_type: "incompatible".into() })
                .collect(),
        }
    }

    #[test]
    fn finds_incompatible_pairs_once() {
        let a = [v("sodium", &["optifine"]), v("lithium", &[])];
        let b = [v("optifine", &["sodium"]), v("iris", &[])];
        assert_eq!(incompatible_pairs(&a, &b), vec![("sodium", "optifine")]);
        let all = [v("sodium", &["optifine"]), v("optifine", &["sodium"])];
        assert_eq!(incompatible_pairs(&all, &all), vec![("sodium", "optifine")]);
    }
}
