
pub mod conflicts;
pub mod curseforge;
pub mod modrinth;
pub mod mrpack;
pub mod packref;
pub mod safety;
pub mod updates;

use std::path::PathBuf;

use serde::{Deserialize, Serialize};

use crate::engine::core::paths::safe_join;
use crate::engine::instances;

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum ContentKind {
    Mod,
    Modpack,
    ResourcePack,
    Shader,
    Datapack,
}

impl ContentKind {
    pub fn folder(self) -> Option<&'static str> {
        match self {
            ContentKind::Mod => Some("mods"),
            ContentKind::ResourcePack => Some("resourcepacks"),
            ContentKind::Shader => Some("shaderpacks"),
            ContentKind::Modpack | ContentKind::Datapack => None,
        }
    }
}

pub const FOLDERS: [&str; 3] = ["mods", "resourcepacks", "shaderpacks"];
pub const DISABLED: &str = ".disabled";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct ContentEntry {
    pub project_id: String,
    pub version_id: String,
    pub title: String,
    pub folder: String,
    pub file: String,
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub source: Option<String>,
}

impl ContentEntry {
    pub fn is_curseforge(&self) -> bool {
        self.source.as_deref() == Some("curseforge")
    }
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct InstalledFile {
    pub folder: String,
    pub file: String,
    pub enabled: bool,
    pub title: String,
    pub project_id: Option<String>,
    pub size: u64,
    pub modified: u64,
}

fn index_path(instance_id: &str) -> Result<PathBuf, String> {
    Ok(instances::dir(instance_id)?.join("content.json"))
}

pub fn read_index(instance_id: &str) -> Vec<ContentEntry> {
    index_path(instance_id)
        .ok()
        .and_then(|p| std::fs::read(p).ok())
        .and_then(|b| serde_json::from_slice(&b).ok())
        .unwrap_or_default()
}

pub fn write_index(instance_id: &str, entries: &[ContentEntry]) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(entries).map_err(|e| e.to_string())?;
    std::fs::write(index_path(instance_id)?, json).map_err(|e| e.to_string())
}

/// Where the launcher puts the Kromvia client in Forge and NeoForge instances; not user content.
pub const BUILT_IN_CLIENT: &str = "kromvia-client.jar";

pub fn list(instance_id: &str) -> Result<Vec<InstalledFile>, String> {
    let game = instances::game_dir(instance_id)?;
    let index = read_index(instance_id);
    let mut out = Vec::new();
    for folder in FOLDERS {
        let Ok(entries) = std::fs::read_dir(game.join(folder)) else { continue };
        for entry in entries.flatten().filter(|e| e.path().is_file()) {
            let name = entry.file_name().to_string_lossy().into_owned();
            if folder == "mods" && name == BUILT_IN_CLIENT || folder == "shaderpacks" && name.ends_with(".txt") {
                continue;
            }
            let (file, enabled) = match name.strip_suffix(DISABLED) {
                Some(base) => (base.to_string(), false),
                None => (name, true),
            };
            let known = index.iter().find(|e| e.folder == folder && e.file == file);
            let meta = entry.metadata().ok();
            out.push(InstalledFile {
                size: meta.as_ref().map_or(0, |m| m.len()),
                modified: meta.and_then(|m| m.modified().ok()).and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_secs()),
                folder: folder.to_string(),
                title: known.map_or_else(|| file.clone(), |e| e.title.clone()),
                project_id: known.map(|e| e.project_id.clone()),
                file,
                enabled,
            });
        }
    }
    out.sort_by(|a, b| (&a.folder, a.title.to_lowercase()).cmp(&(&b.folder, b.title.to_lowercase())));
    Ok(out)
}

fn folder_for(path: &std::path::Path) -> Option<&'static str> {
    let ext = path.extension()?.to_str()?.to_ascii_lowercase();
    match ext.as_str() {
        "jar" => Some("mods"),
        "zip" => {
            let archive = zip::ZipArchive::new(std::fs::File::open(path).ok()?).ok()?;
            let shader = archive.file_names().any(|n| n.is_ok_and(|n| n.starts_with("shaders/")));
            Some(if shader { "shaderpacks" } else { "resourcepacks" })
        }
        _ => None,
    }
}

pub fn add_files(instance_id: &str, paths: &[PathBuf]) -> Result<Vec<String>, String> {
    let game = instances::game_dir(instance_id)?;
    let mut added = Vec::new();
    for path in paths {
        let Some(folder) = folder_for(path) else { continue };
        let Some(name) = path.file_name() else { continue };
        let dir = game.join(folder);
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        std::fs::copy(path, safe_join(&dir, &name.to_string_lossy())?).map_err(|e| e.to_string())?;
        added.push(format!("{folder}/{}", name.to_string_lossy()));
    }
    Ok(added)
}

pub async fn copy_mods(instance_id: &str, from_id: &str, job: &std::sync::Arc<crate::engine::core::jobs::Job>) -> Result<(), String> {
    let (to, from) = (instances::get(instance_id)?, instances::get(from_id)?);
    let same = to.mc_version == from.mc_version && to.loader.as_ref().map(|l| l.kind) == from.loader.as_ref().map(|l| l.kind);
    let index = read_index(from_id);
    let src = instances::game_dir(from_id)?.join("mods");
    let mut skipped = Vec::new();
    for f in list(from_id)?.into_iter().filter(|f| f.folder == "mods" && f.enabled) {
        let have = read_index(instance_id);
        match index.iter().find(|e| e.folder == "mods" && e.file == f.file) {
            Some(e) if have.iter().any(|h| h.project_id == e.project_id) => {}
            Some(e) if !e.is_curseforge() => {
                let version = same.then_some(e.version_id.as_str());
                if modrinth::install(instance_id, &e.project_id, version, ContentKind::Mod, job).await.is_err() {
                    skipped.push(f.title);
                }
            }
            _ if same => {
                add_files(instance_id, &[src.join(&f.file)])?;
            }
            _ => skipped.push(f.title),
        }
    }
    if skipped.is_empty() {
        Ok(())
    } else {
        Err(format!("no compatible version for: {}", skipped.join(", ")))
    }
}

pub fn checked_file(instance_id: &str, folder: &str, file: &str) -> Result<PathBuf, String> {
    if !FOLDERS.contains(&folder) || file.contains('/') {
        return Err("bad content path".into());
    }
    safe_join(&instances::game_dir(instance_id)?.join(folder), file)
}

pub fn set_enabled(instance_id: &str, file: &str, enabled: bool) -> Result<(), String> {
    let on = checked_file(instance_id, "mods", file)?;
    let off = checked_file(instance_id, "mods", &format!("{file}{DISABLED}"))?;
    let (from, to) = if enabled { (off, on) } else { (on, off) };
    std::fs::rename(from, to).map_err(|e| e.to_string())
}

pub fn remove(instance_id: &str, folder: &str, file: &str) -> Result<(), String> {
    for name in [file.to_string(), format!("{file}{DISABLED}")] {
        let path = checked_file(instance_id, folder, &name)?;
        if path.exists() {
            std::fs::remove_file(path).map_err(|e| e.to_string())?;
        }
    }
    let mut index = read_index(instance_id);
    index.retain(|e| !(e.folder == folder && e.file == file));
    write_index(instance_id, &index)
}

pub async fn identify(instance_id: &str) -> Result<usize, String> {
    let game = instances::game_dir(instance_id)?;
    let unknown: Vec<InstalledFile> = list(instance_id)?.into_iter().filter(|f| f.project_id.is_none()).collect();
    if unknown.is_empty() {
        return Ok(0);
    }
    let paths: Vec<(InstalledFile, PathBuf)> = unknown
        .into_iter()
        .map(|f| {
            let name = if f.enabled { f.file.clone() } else { format!("{}{DISABLED}", f.file) };
            let p = game.join(&f.folder).join(name);
            (f, p)
        })
        .collect();
    let hashed = tokio::task::spawn_blocking(move || {
        paths.into_iter().filter_map(|(f, p)| crate::engine::core::http::sha1_file(&p).ok().map(|h| (f, h))).collect::<Vec<_>>()
    })
    .await
    .map_err(|e| e.to_string())?;
    let hashes: Vec<String> = hashed.iter().map(|(_, h)| h.clone()).collect();
    let found = modrinth::by_hash(&hashes).await?;
    let ids: Vec<String> = found.values().map(|v| v.project_id.clone()).collect();
    let titles = modrinth::titles(&ids).await.unwrap_or_default();
    let mut index = read_index(instance_id);
    let mut n = 0;
    for (f, hash) in hashed {
        let Some(v) = found.get(&hash) else { continue };
        index.retain(|e| !(e.folder == f.folder && e.file == f.file));
        index.push(ContentEntry {
            project_id: v.project_id.clone(),
            version_id: v.id.clone(),
            title: titles.get(&v.project_id).cloned().unwrap_or_else(|| f.file.clone()),
            folder: f.folder,
            file: f.file,
            source: None,
        });
        n += 1;
    }
    if n > 0 {
        write_index(instance_id, &index)?;
    }
    Ok(n)
}

#[derive(Serialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct PackOrder {
    pub enabled: Vec<String>,
    pub available: Vec<String>,
}

fn options_path(instance_id: &str) -> Result<PathBuf, String> {
    Ok(instances::game_dir(instance_id)?.join("options.txt"))
}

fn parse_packs(options: &str) -> Vec<String> {
    options
        .lines()
        .find_map(|l| l.strip_prefix("resourcePacks:"))
        .and_then(|v| serde_json::from_str::<Vec<String>>(v).ok())
        .unwrap_or_default()
}

pub fn pack_order(instance_id: &str) -> Result<PackOrder, String> {
    let options = std::fs::read_to_string(options_path(instance_id)?).unwrap_or_default();
    let enabled: Vec<String> = parse_packs(&options).into_iter().filter_map(|p| p.strip_prefix("file/").map(str::to_string)).collect();
    let dir = instances::game_dir(instance_id)?.join("resourcepacks");
    let mut available: Vec<String> = std::fs::read_dir(dir)
        .map(|rd| rd.flatten().map(|e| e.file_name().to_string_lossy().into_owned()).filter(|n| !enabled.contains(n)).collect())
        .unwrap_or_default();
    available.sort_by_key(|n| n.to_lowercase());
    Ok(PackOrder { enabled, available })
}

pub fn set_pack_order(instance_id: &str, enabled: &[String]) -> Result<(), String> {
    for p in enabled {
        checked_pack(instance_id, p)?;
    }
    let path = options_path(instance_id)?;
    let options = std::fs::read_to_string(&path).unwrap_or_default();
    let mut packs: Vec<String> = parse_packs(&options).into_iter().filter(|p| !p.starts_with("file/")).collect();
    if packs.is_empty() {
        packs.push("vanilla".into());
    }
    packs.extend(enabled.iter().map(|p| format!("file/{p}")));
    let line = format!("resourcePacks:{}", serde_json::to_string(&packs).map_err(|e| e.to_string())?);
    let mut out: Vec<String> = options.lines().filter(|l| !l.starts_with("incompatibleResourcePacks:")).map(str::to_string).collect();
    match out.iter_mut().find(|l| l.starts_with("resourcePacks:")) {
        Some(l) => *l = line,
        None => out.push(line),
    }
    std::fs::write(path, out.join("\n") + "\n").map_err(|e| e.to_string())
}

fn checked_pack(instance_id: &str, name: &str) -> Result<PathBuf, String> {
    if name.is_empty() || name.contains(['/', '\\', '"']) || name == ".." {
        return Err(format!("bad pack name {name}"));
    }
    safe_join(&instances::game_dir(instance_id)?.join("resourcepacks"), name)
}

fn embedded_icon(path: &std::path::Path) -> Option<String> {
    use base64::Engine;
    use std::io::Read;
    let mut zip = zip::ZipArchive::new(std::fs::File::open(path).ok()?).ok()?;
    let mut text = |name: &str| -> Option<String> {
        let mut s = String::new();
        zip.by_name(name).ok()?.take(1 << 20).read_to_string(&mut s).ok()?;
        Some(s)
    };
    let json_icon = |v: &serde_json::Value| -> Option<String> {
        match v {
            serde_json::Value::String(s) => Some(s.clone()),
            serde_json::Value::Object(m) => m.iter().filter_map(|(k, v)| Some((k.parse::<u32>().ok()?, v.as_str()?))).max_by_key(|(k, _)| *k).map(|(_, v)| v.to_string()),
            _ => None,
        }
    };
    let toml_logo = |t: &str| {
        t.lines().find_map(|l| {
            let (k, v) = l.split_once('=')?;
            (k.trim() == "logoFile").then(|| v.split(" #").next().unwrap_or(v).trim().trim_matches(['"', '\'']).to_string())
        })
    };
    let parse = |t: Option<String>| t.and_then(|t| serde_json::from_str::<serde_json::Value>(&t).ok());
    let mut declared = parse(text("fabric.mod.json")).and_then(|v| json_icon(&v["icon"]));
    if declared.is_none() {
        declared = parse(text("quilt.mod.json")).and_then(|v| json_icon(&v["quilt_loader"]["metadata"]["icon"]));
    }
    if declared.is_none() {
        declared = text("META-INF/neoforge.mods.toml").or_else(|| text("META-INF/mods.toml")).and_then(|t| toml_logo(&t));
    }
    if declared.is_none() {
        declared = parse(text("mcmod.info")).and_then(|v| v.get(0).or(v.get("modList").and_then(|l| l.get(0))).and_then(|m| m["logoFile"].as_str()).map(String::from));
    }
    let declared = declared.filter(|n| !n.is_empty());
    for name in declared.into_iter().chain(["pack.png".to_string(), "icon.png".to_string()]) {
        let Ok(mut f) = zip.by_name(name.trim_start_matches('/')) else { continue };
        if f.size() > 2 << 20 {
            continue;
        }
        let mut bytes = Vec::new();
        if f.read_to_end(&mut bytes).is_ok() && bytes.starts_with(b"\x89PNG") {
            return Some(format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(bytes)));
        }
    }
    None
}

pub async fn icon(instance_id: &str, folder: &str, file: &str) -> Result<Option<String>, String> {
    static REMOTE: std::sync::LazyLock<std::sync::Mutex<std::collections::HashMap<String, Option<String>>>> = std::sync::LazyLock::new(Default::default);
    let on = checked_file(instance_id, folder, file)?;
    let path = if on.exists() { on } else { checked_file(instance_id, folder, &format!("{file}{DISABLED}"))? };
    if let Some(url) = tokio::task::spawn_blocking(move || embedded_icon(&path)).await.map_err(|e| e.to_string())? {
        return Ok(Some(url));
    }
    let Some(entry) = read_index(instance_id).into_iter().find(|e| e.folder == folder && e.file == file && !e.is_curseforge()) else {
        return Ok(None);
    };
    if let Some(cached) = REMOTE.lock().unwrap().get(&entry.project_id) {
        return Ok(cached.clone());
    }
    let url = modrinth::project(&entry.project_id).await?.icon_url;
    REMOTE.lock().unwrap().insert(entry.project_id, url.clone());
    Ok(url)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn reads_embedded_icons() {
        use std::io::Write;
        let dir = std::env::temp_dir().join(format!("kromvia-icons-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        let png = b"\x89PNG\r\n\x1a\nrest";
        let make = |name: &str, files: &[(&str, &[u8])]| {
            let path = dir.join(name);
            let mut z = zip::ZipWriter::new(std::fs::File::create(&path).unwrap());
            for (n, b) in files {
                z.start_file(*n, zip::write::SimpleFileOptions::default()).unwrap();
                z.write_all(b).unwrap();
            }
            z.finish().unwrap();
            path
        };
        let fabric = make("f.jar", &[("fabric.mod.json", br#"{"icon":{"16":"s.png","128":"assets/m/icon.png"}}"#), ("assets/m/icon.png", png)]);
        let forge = make("n.jar", &[("META-INF/mods.toml", b"[[mods]]\nlogoFile=\"logo.png\"\n"), ("logo.png", png)]);
        let pack = make("p.zip", &[("pack.png", png)]);
        let none = make("x.jar", &[("fabric.mod.json", b"{}")]);
        for p in [&fabric, &forge, &pack] {
            assert!(embedded_icon(p).unwrap().starts_with("data:image/png;base64,"), "{p:?}");
        }
        assert!(embedded_icon(&none).is_none());
    }

    #[test]
    fn orders_resource_packs() {
        crate::engine::core::paths::init(std::env::temp_dir().join(format!("kromvia-packs-{}", std::process::id())));
        let inst = instances::create("Packs", "1.21.4", None).unwrap();
        let game = instances::game_dir(&inst.id).unwrap();
        std::fs::create_dir_all(game.join("resourcepacks")).unwrap();
        for p in ["A.zip", "B.zip", "C"] {
            std::fs::write(game.join("resourcepacks").join(p), b"").unwrap();
        }
        std::fs::write(game.join("options.txt"), "fov:0.5\nresourcePacks:[\"vanilla\",\"fabric\",\"file/B.zip\"]\nincompatibleResourcePacks:[]\n").unwrap();
        assert_eq!(pack_order(&inst.id).unwrap(), PackOrder { enabled: vec!["B.zip".into()], available: vec!["A.zip".into(), "C".into()] });
        set_pack_order(&inst.id, &["A.zip".into(), "B.zip".into()]).unwrap();
        let text = std::fs::read_to_string(game.join("options.txt")).unwrap();
        assert!(text.contains(r#"resourcePacks:["vanilla","fabric","file/A.zip","file/B.zip"]"#), "{text}");
        assert!(text.starts_with("fov:0.5\n"));
        assert!(set_pack_order(&inst.id, &["../x".into()]).is_err());
        instances::delete(&inst.id).unwrap();
    }
}

#[cfg(test)]
mod install_tests {
    use super::*;
    use crate::engine::core::jobs::Jobs;
    use crate::engine::core::paths;
    use crate::engine::game::launch::prepare;
    use std::future::Future;
    use std::sync::{Arc, Mutex};
    use tauri::Manager;

    async fn run_job<T: Send + 'static, F: Future<Output = Result<T, String>> + Send + 'static>(
        app: &tauri::App<tauri::test::MockRuntime>,
        key: &str,
        task: impl FnOnce(Arc<crate::engine::core::jobs::Job>) -> F + Send + 'static,
    ) -> Result<T, String> {
        let (tx, rx) = tokio::sync::oneshot::channel();
        let tx = Mutex::new(Some(tx));
        app.state::<Jobs>()
            .spawn(app.handle(), key.into(), move |job| async move {
                let r = task(job).await;
                let _ = tx.lock().unwrap().take().unwrap().send(r);
                Ok(())
            })
            .unwrap();
        rx.await.unwrap()
    }

    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn installs_from_modrinth() {
        let root = std::env::var("KROMVIA_TEST_ROOT").map(std::path::PathBuf::from).unwrap_or_else(|_| std::env::temp_dir().join("kromvia-it"));
        paths::init(root);
        let app = tauri::test::mock_builder()
            .manage(Jobs::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();

        use crate::engine::game::loaders::{self, Loader, LoaderKind};
        let version = loaders::versions(LoaderKind::Fabric, "1.21.4").await.unwrap()[0].version.clone();
        let inst = instances::create("mods test", "1.21.4", Some(Loader { kind: LoaderKind::Fabric, version })).unwrap();
        let id = inst.id.clone();

        let added = run_job(&app, "content-iris", move |job| async move {
            modrinth::install(&id, "iris", None, ContentKind::Mod, &job).await
        })
        .await
        .unwrap();
        println!("installed: {added:?}");
        assert!(added.iter().any(|t| t.contains("Iris")) && added.iter().any(|t| t == "Sodium"), "{added:?}");

        let info = modrinth::project("sodium").await.unwrap();
        assert!(info.title == "Sodium" && !info.body.is_empty());
        let vs = modrinth::compatible_versions("sodium", ContentKind::Mod, Some(&inst)).await.unwrap();
        assert!(vs.iter().all(|v| v.game_versions.contains(&"1.21.4".to_string())));
        let plan = modrinth::plan(&inst.id, "lithium", None, ContentKind::Mod).await.unwrap();
        assert!(plan.files.iter().any(|f| f.title == "Lithium") && plan.conflicts.is_empty(), "{plan:?}");

        let saves = instances::game_dir(&inst.id).unwrap().join("saves/World");
        std::fs::create_dir_all(&saves).unwrap();
        std::fs::write(saves.join("level.dat"), b"").unwrap();
        let id2 = inst.id.clone();
        let file = run_job(&app, "content-terralith", move |job| async move {
            modrinth::install_datapack(&id2, "terralith", None, "World", &job).await
        })
        .await
        .unwrap();
        assert!(saves.join("datapacks").join(&file).is_file(), "{file}");

        let unknown = instances::game_dir(&inst.id).unwrap().join("mods/hand-dropped.jar");
        std::fs::copy(instances::game_dir(&inst.id).unwrap().join("mods").join(&list(&inst.id).unwrap().iter().find(|f| f.title.contains("Iris")).unwrap().file), &unknown).unwrap();
        assert!(identify(&inst.id).await.unwrap() >= 1);
        assert!(list(&inst.id).unwrap().iter().find(|f| f.file == "hand-dropped.jar").unwrap().project_id.is_some());
        let report = safety::check(&inst.id).await.unwrap();
        assert!(report.files.iter().all(|f| f.verified && !f.infected), "{report:?}");

        use crate::engine::game::renderer;
        let id3 = inst.id.clone();
        run_job(&app, "renderer-on", move |job| async move { renderer::set(&id3, true, &job).await }).await.unwrap();
        assert!(renderer::is_vulkan(&inst.id).unwrap());
        assert!(!list(&inst.id).unwrap().iter().find(|f| f.title == "Sodium").unwrap().enabled);
        let id4 = inst.id.clone();
        run_job(&app, "renderer-off", move |job| async move { renderer::set(&id4, false, &job).await }).await.unwrap();
        assert!(!renderer::is_vulkan(&inst.id).unwrap());
        assert!(list(&inst.id).unwrap().iter().find(|f| f.title == "Sodium").unwrap().enabled);

        let files = list(&inst.id).unwrap();
        let sodium = files.iter().find(|f| f.title == "Sodium").unwrap();
        set_enabled(&inst.id, &sodium.file, false).unwrap();
        assert!(!list(&inst.id).unwrap().iter().find(|f| f.title == "Sodium").unwrap().enabled);
        set_enabled(&inst.id, &sodium.file, true).unwrap();
        remove(&inst.id, "mods", &sodium.file).unwrap();
        assert!(list(&inst.id).unwrap().iter().all(|f| f.title != "Sodium"));
        instances::delete(&inst.id).unwrap();

        let pack = run_job(&app, "modpack-fo", |job| async move {
            mrpack::install_from_modrinth("fabulously-optimized", &job).await
        })
        .await
        .unwrap();
        let mods = std::fs::read_dir(instances::game_dir(&pack.id).unwrap().join("mods")).unwrap().count();
        println!("modpack {} for {}: {mods} mods", pack.name, pack.mc_version);
        assert!(mods > 5);
        let pack_id = pack.id.clone();
        let p = run_job(&app, "launch-fo", move |job| async move { prepare(&pack, &crate::engine::game::launch::offline_session("Steve").unwrap(), &job).await }).await.unwrap();
        let out = std::process::Command::new(&p.java).arg("-version").output().unwrap();
        assert!(out.status.success());

        let file = paths::temp().join("fo-export.mrpack");
        let (id, f) = (pack_id.clone(), file.clone());
        run_job(&app, "export-fo", move |job| async move { mrpack::export(&id, &f, &job).await }).await.unwrap();
        let back = run_job(&app, "import-fo", move |job| async move { mrpack::install_from_file(&file, &job).await }).await.unwrap();
        let names = |id: &str| {
            let mut v: Vec<String> = list(id).unwrap().into_iter().filter(|f| f.enabled).map(|f| f.file).collect();
            v.sort();
            v
        };
        assert_eq!(names(&pack_id), names(&back.id));
        println!("round trip: {} files", names(&back.id).len());
        instances::delete(&back.id).unwrap();
        instances::delete(&pack_id).unwrap();
    }
}
