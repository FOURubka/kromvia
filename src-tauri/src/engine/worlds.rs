
use std::io::Write;
use std::path::{Path, PathBuf};

use base64::Engine;
use serde::Serialize;

use crate::engine::content::mrpack::walk;
use crate::engine::instances::{self, copy_dir};
use crate::engine::nbt::{self, Tag};

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct World {
    pub folder: String,
    pub name: String,
    pub last_played: i64,
    pub mode: &'static str,
    pub hardcore: bool,
    pub version: Option<String>,
    pub size: u64,
    pub icon: Option<String>,
}

fn saves(instance_id: &str) -> Result<PathBuf, String> {
    Ok(instances::game_dir(instance_id)?.join("saves"))
}

pub fn world_dir(instance_id: &str, folder: &str) -> Result<PathBuf, String> {
    if folder.is_empty() || folder.starts_with('.') || folder.contains(['/', '\\', ':']) {
        return Err(format!("bad world {folder}"));
    }
    let dir = saves(instance_id)?.join(folder);
    if !dir.join("level.dat").is_file() {
        return Err(format!("no world {folder}"));
    }
    Ok(dir)
}

/// Where `level.dat` sits inside a world zip: `""` for the root or `"Name/"`. `None` if it is not a world.
pub fn zip_world_root(archive: &mut zip::ZipArchive<std::fs::File>) -> Option<String> {
    archive
        .file_names()
        .filter_map(|n| n.ok())
        .filter(|n| n == "level.dat" || n.ends_with("/level.dat"))
        .map(|n| n.trim_end_matches("level.dat").to_string())
        .filter(|root| root.matches('/').count() <= 1)
        .min_by_key(|root| root.len())
}

/// Unpacks a world zip into `saves/`, under a folder name that is free. Returns that name.
pub fn import_zip(instance_id: &str, path: &Path) -> Result<String, String> {
    let mut archive = zip::ZipArchive::new(std::fs::File::open(path).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let root = zip_world_root(&mut archive).ok_or("this zip has no level.dat")?;
    let stem = path.file_stem().map(|s| s.to_string_lossy().into_owned()).unwrap_or_default();
    let base: String = root.trim_end_matches('/').to_string();
    let base = if base.is_empty() { stem } else { base };
    let base: String = base.chars().filter(|c| !matches!(c, '/' | '\\' | ':' | '*' | '?' | '"' | '<' | '>' | '|')).collect::<String>().trim().trim_start_matches('.').to_string();
    let base = if base.is_empty() { "World".to_string() } else { base };
    let saves = saves(instance_id)?;
    std::fs::create_dir_all(&saves).map_err(|e| e.to_string())?;
    let mut name = base.clone();
    let mut n = 2;
    while saves.join(&name).exists() {
        name = format!("{base} ({n})");
        n += 1;
    }
    let dest = saves.join(&name);
    for i in 0..archive.len() {
        let mut entry = archive.by_index(i).map_err(|e| e.to_string())?;
        let Some(rel) = entry.enclosed_name() else { continue };
        let Ok(rel) = rel.strip_prefix(&root) else { continue };
        let out = dest.join(rel);
        if entry.is_dir() {
            std::fs::create_dir_all(&out).map_err(|e| e.to_string())?;
            continue;
        }
        if let Some(parent) = out.parent() {
            std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
        }
        let mut file = std::fs::File::create(&out).map_err(|e| e.to_string())?;
        std::io::copy(&mut entry, &mut file).map_err(|e| e.to_string())?;
    }
    if !dest.join("level.dat").is_file() {
        let _ = std::fs::remove_dir_all(&dest);
        return Err("this zip has no level.dat".into());
    }
    Ok(name)
}

pub fn dir_size(dir: &Path) -> u64 {
    walk(dir, "").iter().filter_map(|(_, p)| std::fs::metadata(p).ok()).map(|m| m.len()).sum()
}

fn read_level(dir: &Path) -> Result<Tag, String> {
    nbt::parse_gzip(&std::fs::read(dir.join("level.dat")).map_err(|e| e.to_string())?)
}

fn describe(folder: String, dir: &Path) -> Option<World> {
    let root = read_level(dir).ok()?;
    let data = root.get("Data")?;
    let int = |k: &str| data.get(k).and_then(Tag::int);
    let icon = std::fs::read(dir.join("icon.png"))
        .ok()
        .filter(|b| b.len() <= 256 * 1024)
        .map(|b| format!("data:image/png;base64,{}", base64::engine::general_purpose::STANDARD.encode(b)));
    Some(World {
        name: data.get("LevelName").and_then(Tag::str).filter(|n| !n.is_empty()).unwrap_or(&folder).to_string(),
        last_played: int("LastPlayed").unwrap_or(0),
        mode: match int("GameType") {
            Some(1) => "creative",
            Some(2) => "adventure",
            Some(3) => "spectator",
            _ => "survival",
        },
        hardcore: int("hardcore") == Some(1),
        version: data.get("Version").and_then(|v| v.get("Name")).and_then(Tag::str).map(String::from),
        size: dir_size(dir),
        icon,
        folder,
    })
}

pub fn list(instance_id: &str) -> Result<Vec<World>, String> {
    let mut out: Vec<World> = std::fs::read_dir(saves(instance_id)?)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| describe(e.file_name().to_str()?.to_string(), &e.path()))
        .collect();
    out.sort_by_key(|w| std::cmp::Reverse(w.last_played));
    Ok(out)
}

pub fn rename(instance_id: &str, folder: &str, name: &str) -> Result<(), String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 64 {
        return Err("name must be 1–64 characters".into());
    }
    let dir = world_dir(instance_id, folder)?;
    let mut root = read_level(&dir)?;
    root.get_mut("Data").ok_or("level.dat has no Data")?.set("LevelName", Tag::String(name.to_string()));
    let _ = std::fs::copy(dir.join("level.dat"), dir.join("level.dat_old"));
    let tmp = dir.join("level.dat.tmp");
    std::fs::write(&tmp, nbt::write_gzip(&root)).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, dir.join("level.dat")).map_err(|e| e.to_string())
}

pub fn duplicate(instance_id: &str, folder: &str) -> Result<String, String> {
    let src = world_dir(instance_id, folder)?;
    let base = format!("{folder} (copy)");
    let mut new = base.clone();
    let mut n = 2;
    while saves(instance_id)?.join(&new).exists() {
        new = format!("{base} {n}");
        n += 1;
    }
    let dest = saves(instance_id)?.join(&new);
    copy_dir(&src, &dest)?;
    let _ = std::fs::remove_file(dest.join("session.lock"));
    let name = describe(new.clone(), &dest).map(|w| w.name).unwrap_or_else(|| folder.into());
    rename(instance_id, &new, &format!("{name} (copy)").chars().take(64).collect::<String>())?;
    Ok(new)
}

pub fn delete(instance_id: &str, folder: &str) -> Result<(), String> {
    std::fs::remove_dir_all(world_dir(instance_id, folder)?).map_err(|e| e.to_string())
}

pub fn export(instance_id: &str, folder: &str, dest: &Path) -> Result<(), String> {
    let dir = world_dir(instance_id, folder)?;
    let part = dest.with_extension("zip.part");
    let result = (|| {
        let mut zip = zip::ZipWriter::new(std::fs::File::create(&part).map_err(|e| e.to_string())?);
        let opts = zip::write::SimpleFileOptions::default();
        for (rel, path) in walk(&dir, folder) {
            if rel.ends_with("/session.lock") {
                continue;
            }
            zip.start_file(rel, opts).map_err(|e| e.to_string())?;
            std::io::copy(&mut std::fs::File::open(&path).map_err(|e| e.to_string())?, &mut zip).map_err(|e| e.to_string())?;
        }
        zip.flush().map_err(|e| e.to_string())?;
        zip.finish().map_err(|e| e.to_string())?;
        Ok(())
    })();
    match result {
        Ok(()) => std::fs::rename(&part, dest).map_err(|e| e.to_string()),
        Err(e) => {
            let _ = std::fs::remove_file(&part);
            Err(e)
        }
    }
}

#[derive(Serialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Screenshot {
    pub name: String,
    pub path: String,
    pub taken: u64,
    /// The world or server the game was in when the file was written, if the launcher saw it.
    pub place: Option<Place>,
}

#[derive(Serialize, serde::Deserialize, Clone, Debug, PartialEq, Eq)]
pub struct Place {
    /// `world` or `server`.
    pub kind: String,
    pub name: String,
}

#[derive(Serialize, serde::Deserialize)]
struct Mark {
    at: u64,
    place: Option<Place>,
}

const MAX_MARKS: usize = 2000;

fn places_path(instance_id: &str) -> Result<PathBuf, String> {
    Ok(instances::dir(instance_id)?.join("places.json"))
}

fn read_marks(instance_id: &str) -> Vec<Mark> {
    places_path(instance_id).ok().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

/// Remembers where the game is from now on, so screenshots can be filtered by world or server later.
pub fn mark_place(instance_id: &str, place: Option<Place>) {
    let mut marks = read_marks(instance_id);
    if marks.last().is_some_and(|m| m.place == place) {
        return;
    }
    let at = std::time::SystemTime::now().duration_since(std::time::UNIX_EPOCH).map_or(0, |d| d.as_secs());
    marks.push(Mark { at, place });
    let skip = marks.len().saturating_sub(MAX_MARKS);
    if let (Ok(path), Ok(json)) = (places_path(instance_id), serde_json::to_vec(&marks[skip..])) {
        let _ = std::fs::write(path, json);
    }
}

/// The singleplayer world open right now: the one whose `session.lock` was written last.
fn open_world_dir(instance_id: &str) -> Option<(String, PathBuf)> {
    let saves = saves(instance_id).ok()?;
    std::fs::read_dir(&saves)
        .ok()?
        .flatten()
        .filter_map(|e| Some((e.metadata().ok()?.is_dir().then_some(())?, e)))
        .filter_map(|(_, e)| Some((e.path().join("session.lock").metadata().ok()?.modified().ok()?, e)))
        .max_by_key(|(t, _)| *t)
        .map(|(_, e)| (e.file_name().to_string_lossy().into_owned(), e.path()))
}

pub fn open_world_folder(instance_id: &str) -> Option<String> {
    open_world_dir(instance_id).map(|(folder, _)| folder)
}

pub fn open_world(instance_id: &str) -> Option<Place> {
    let (folder, dir) = open_world_dir(instance_id)?;
    let name = describe(folder.clone(), &dir).map_or(folder, |w| w.name);
    Some(Place { kind: "world".into(), name })
}

fn place_at(marks: &[Mark], at: u64) -> Option<Place> {
    marks.iter().rev().find(|m| m.at <= at).and_then(|m| m.place.clone())
}

fn screenshots(instance_id: &str) -> Result<PathBuf, String> {
    Ok(instances::game_dir(instance_id)?.join("screenshots"))
}

pub fn list_screenshots(instance_id: &str) -> Result<Vec<Screenshot>, String> {
    let mut out: Vec<Screenshot> = std::fs::read_dir(screenshots(instance_id)?)
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| {
            let name = e.file_name().to_str()?.to_string();
            if !name.ends_with(".png") || !e.file_type().ok()?.is_file() {
                return None;
            }
            let taken = e.metadata().ok()?.modified().ok()?.duration_since(std::time::UNIX_EPOCH).ok()?.as_secs();
            Some(Screenshot { path: e.path().to_string_lossy().into_owned(), name, taken, place: None })
        })
        .collect();
    let marks = read_marks(instance_id);
    for s in &mut out {
        s.place = place_at(&marks, s.taken);
    }
    out.sort_by_key(|s| std::cmp::Reverse(s.taken));
    Ok(out)
}

pub fn screenshot_path(instance_id: &str, name: &str) -> Result<PathBuf, String> {
    if !name.ends_with(".png") || name.starts_with('.') || name.contains(['/', '\\', ':']) {
        return Err(format!("bad screenshot {name}"));
    }
    let path = screenshots(instance_id)?.join(name);
    if !path.is_file() {
        return Err(format!("no screenshot {name}"));
    }
    Ok(path)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::engine::core::paths;

    fn level(name: &str) -> Vec<u8> {
        nbt::write_gzip(&Tag::Compound(vec![(
            "Data".into(),
            Tag::Compound(vec![
                ("LevelName".into(), Tag::String(name.into())),
                ("LastPlayed".into(), Tag::Long(5)),
                ("GameType".into(), Tag::Int(1)),
                ("Version".into(), Tag::Compound(vec![("Name".into(), Tag::String("1.21.4".into()))])),
            ]),
        )]))
    }

    #[test]
    fn lists_renames_copies_and_exports() {
        paths::init(std::env::temp_dir().join(format!("kromvia-worlds-{}", std::process::id())));
        let inst = instances::create("Worlds", "1.21.4", None).unwrap();
        let w = saves(&inst.id).unwrap().join("New World");
        std::fs::create_dir_all(w.join("region")).unwrap();
        std::fs::write(w.join("level.dat"), level("My World")).unwrap();
        std::fs::write(w.join("region/r.0.0.mca"), [0u8; 100]).unwrap();
        std::fs::write(w.join("session.lock"), "x").unwrap();

        let list = list(&inst.id).unwrap();
        assert_eq!(list.len(), 1);
        assert_eq!((list[0].name.as_str(), list[0].mode, list[0].version.as_deref()), ("My World", "creative", Some("1.21.4")));
        assert!(list[0].size > 100);

        rename(&inst.id, "New World", "Renamed").unwrap();
        assert_eq!(super::list(&inst.id).unwrap()[0].name, "Renamed");
        assert!(rename(&inst.id, "../New World", "x").is_err());
        assert!(rename(&inst.id, "Missing", "x").is_err());

        let copy = duplicate(&inst.id, "New World").unwrap();
        assert_eq!(copy, "New World (copy)");
        assert!(!saves(&inst.id).unwrap().join(&copy).join("session.lock").exists());
        assert_eq!(describe(copy.clone(), &saves(&inst.id).unwrap().join(&copy)).unwrap().name, "Renamed (copy)");

        let zip_path = std::env::temp_dir().join(format!("kromvia-world-{}.zip", std::process::id()));
        export(&inst.id, "New World", &zip_path).unwrap();
        let mut names: Vec<String> = zip::ZipArchive::new(std::fs::File::open(&zip_path).unwrap()).unwrap().file_names().map(|n| n.unwrap().into_owned()).collect();
        names.sort();
        assert_eq!(names, ["New World/level.dat", "New World/level.dat_old", "New World/region/r.0.0.mca"]);

        delete(&inst.id, &copy).unwrap();
        assert_eq!(super::list(&inst.id).unwrap().len(), 1);
        assert_eq!(import_zip(&inst.id, &zip_path).unwrap(), "New World (2)");
        assert!(saves(&inst.id).unwrap().join("New World (2)/region/r.0.0.mca").is_file());
        let _ = std::fs::remove_file(zip_path);
        instances::delete(&inst.id).unwrap();
    }

    #[test]
    fn checks_screenshot_names() {
        paths::init(std::env::temp_dir().join(format!("kromvia-shots-{}", std::process::id())));
        assert!(screenshot_path("x", "../a.png").is_err());
        assert!(screenshot_path("x", "a.txt").is_err());
    }

    #[test]
    fn finds_the_place_a_screenshot_was_taken_in() {
        let p = |n: &str| Some(Place { kind: "server".into(), name: n.into() });
        let marks = [Mark { at: 10, place: p("a") }, Mark { at: 20, place: None }, Mark { at: 30, place: p("b") }];
        assert_eq!(place_at(&marks, 5), None);
        assert_eq!(place_at(&marks, 15), p("a"));
        assert_eq!(place_at(&marks, 25), None);
        assert_eq!(place_at(&marks, 99), p("b"));
    }
}
