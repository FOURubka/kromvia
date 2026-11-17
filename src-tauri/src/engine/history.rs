use std::collections::{BTreeMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Mutex;

use serde::{Deserialize, Serialize};

use crate::engine::core::{http, paths};
use crate::engine::{instances, metrics};

const KEEP: usize = 60;
const MAX_FILE: u64 = 256 * 1024 * 1024;
const DISABLED: &str = ".disabled";

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Commit {
    pub id: String,
    pub time: u64,
    pub reason: String,
    pub mod_set: String,
    pub files: BTreeMap<String, String>,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Entry {
    pub id: String,
    pub time: u64,
    pub reason: String,
    pub mod_set: String,
    pub mods: usize,
    pub added: Vec<String>,
    pub removed: Vec<String>,
    pub configs: usize,
    pub current: bool,
}

static LOCK: Mutex<()> = Mutex::new(());

fn objects() -> PathBuf {
    paths::root().join("objects")
}

fn object(sha: &str) -> PathBuf {
    objects().join(&sha[..2]).join(sha)
}

fn history_path(instance_id: &str) -> Result<PathBuf, String> {
    Ok(instances::dir(instance_id)?.join("history.json"))
}

fn load(instance_id: &str) -> Vec<Commit> {
    history_path(instance_id).map(|p| load_at(&p)).unwrap_or_default()
}

fn load_at(path: &Path) -> Vec<Commit> {
    std::fs::read(path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn store_at(path: &Path, commits: &[Commit]) -> Result<(), String> {
    let tmp = path.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_vec(commits).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    std::fs::rename(tmp, path).map_err(|e| e.to_string())
}

fn is_jar(rel: &str) -> bool {
    rel.starts_with("mods/") && (rel.ends_with(".jar") || rel.ends_with(&format!(".jar{DISABLED}")))
}

fn tracked(game: &Path) -> Vec<String> {
    let mut out = Vec::new();
    if let Ok(entries) = std::fs::read_dir(game.join("mods")) {
        for e in entries.flatten() {
            let name = e.file_name().to_string_lossy().into_owned();
            if e.path().is_file() && name != crate::engine::content::BUILT_IN_CLIENT && is_jar(&format!("mods/{name}")) {
                out.push(format!("mods/{name}"));
            }
        }
    }
    let mut stack = vec![game.join("config")];
    while let Some(dir) = stack.pop() {
        let Ok(entries) = std::fs::read_dir(&dir) else { continue };
        for e in entries.flatten() {
            let p = e.path();
            if p.is_dir() {
                stack.push(p);
            } else if let Ok(rel) = p.strip_prefix(game) {
                out.push(rel.to_string_lossy().replace('\\', "/"));
            }
        }
    }
    if game.join("options.txt").is_file() {
        out.push("options.txt".into());
    }
    out.sort();
    out
}

fn put(src: &Path, sha: &str, link: bool) -> Result<(), String> {
    let dest = object(sha);
    if dest.is_file() {
        return Ok(());
    }
    std::fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
    let tmp = dest.with_extension("tmp");
    let _ = std::fs::remove_file(&tmp);
    if !(link && std::fs::hard_link(src, &tmp).is_ok()) {
        std::fs::copy(src, &tmp).map_err(|e| e.to_string())?;
    }
    std::fs::rename(tmp, dest).map_err(|e| e.to_string())
}

fn mod_set(files: &BTreeMap<String, String>) -> String {
    let names: Vec<String> = files.keys().filter(|k| k.starts_with("mods/") && k.ends_with(".jar")).map(|k| k["mods/".len()..].to_string()).collect();
    metrics::mod_set(&names)
}

type Cache = BTreeMap<String, (u64, u64, String)>;

fn stamp(meta: &std::fs::Metadata) -> u64 {
    meta.modified().ok().and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok()).map_or(0, |d| d.as_nanos() as u64)
}

fn scan(game: &Path, cache_path: &Path) -> Result<BTreeMap<String, String>, String> {
    let old: Cache = std::fs::read(cache_path).ok().and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default();
    let mut cache = Cache::new();
    let mut files = BTreeMap::new();
    for rel in tracked(game) {
        let path = game.join(&rel);
        let Ok(meta) = std::fs::metadata(&path) else { continue };
        if meta.len() > MAX_FILE {
            continue;
        }
        let (size, at) = (meta.len(), stamp(&meta));
        let sha = match old.get(&rel) {
            Some((s, t, sha)) if *s == size && *t == at && object(sha).is_file() => sha.clone(),
            _ => {
                let sha = http::sha1_file(&path)?;
                put(&path, &sha, is_jar(&rel))?;
                sha
            }
        };
        cache.insert(rel.clone(), (size, at, sha.clone()));
        files.insert(rel, sha);
    }
    let _ = std::fs::write(cache_path, serde_json::to_vec(&cache).unwrap_or_default());
    Ok(files)
}

/// Records the instance's mods and configs when they differ from the last commit.
pub fn snapshot(instance_id: &str, reason: &str) -> Result<Option<String>, String> {
    snapshot_at(&instances::game_dir(instance_id)?, &history_path(instance_id)?, reason)
}

fn snapshot_at(game: &Path, history: &Path, reason: &str) -> Result<Option<String>, String> {
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let files = scan(game, &history.with_file_name("history-cache.json"))?;
    let mut commits = load_at(history);
    if commits.last().is_some_and(|c| c.files == files) {
        return Ok(None);
    }
    let time = instances::now();
    let id = format!("{time:x}{:04x}", commits.len() % 0xffff);
    commits.push(Commit { id: id.clone(), time, reason: reason.into(), mod_set: mod_set(&files), files });
    let skip = commits.len().saturating_sub(KEEP);
    commits.drain(..skip);
    store_at(history, &commits)?;
    if skip > 0 {
        gc();
    }
    Ok(Some(id))
}

fn mods_of(c: &Commit) -> Vec<String> {
    c.files.keys().filter(|k| k.starts_with("mods/") && k.ends_with(".jar")).map(|k| k["mods/".len()..].trim_end_matches(".jar").to_string()).collect()
}

pub fn list(instance_id: &str) -> Vec<Entry> {
    let commits = load(instance_id);
    let now = instances::game_dir(instance_id).ok().and_then(|g| {
        let t = tracked(&g);
        let last = commits.last()?;
        (t.len() == last.files.len() && t.iter().all(|f| last.files.contains_key(f))).then_some(())
    });
    let mut out: Vec<Entry> = commits
        .iter()
        .enumerate()
        .map(|(i, c)| {
            let mods = mods_of(c);
            let before = if i == 0 { vec![] } else { mods_of(&commits[i - 1]) };
            let configs = if i == 0 {
                0
            } else {
                c.files.iter().filter(|(k, v)| !k.starts_with("mods/") && commits[i - 1].files.get(*k) != Some(v)).count()
            };
            Entry {
                id: c.id.clone(),
                time: c.time,
                reason: c.reason.clone(),
                mod_set: c.mod_set.clone(),
                mods: mods.len(),
                added: if i == 0 { vec![] } else { mods.iter().filter(|m| !before.contains(m)).cloned().collect() },
                removed: before.iter().filter(|m| !mods.contains(m)).cloned().collect(),
                configs,
                current: i + 1 == commits.len() && now.is_some(),
            }
        })
        .collect();
    out.reverse();
    out
}

pub fn find_set(instance_id: &str, set: &str) -> Option<String> {
    load(instance_id).iter().rev().find(|c| c.mod_set == set).map(|c| c.id.clone())
}

/// Puts the instance back to a commit. The current state is committed first, so this can be undone.
pub fn restore(instance_id: &str, id: &str) -> Result<(), String> {
    restore_at(&instances::game_dir(instance_id)?, &history_path(instance_id)?, id)
}

fn restore_at(game: &Path, history: &Path, id: &str) -> Result<(), String> {
    snapshot_at(game, history, "before restore")?;
    let _guard = LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let commit = load_at(history).into_iter().find(|c| c.id == id).ok_or("that point in history is gone")?;
    for sha in commit.files.values() {
        if !object(sha).is_file() {
            return Err("some files of that point are missing".into());
        }
    }
    for rel in tracked(game) {
        if !commit.files.contains_key(&rel) {
            std::fs::remove_file(game.join(&rel)).map_err(|e| e.to_string())?;
        }
    }
    for (rel, sha) in &commit.files {
        let dest = game.join(rel);
        if dest.is_file() && http::sha1_file(&dest).ok().as_deref() == Some(sha) {
            continue;
        }
        std::fs::create_dir_all(dest.parent().unwrap()).map_err(|e| e.to_string())?;
        let _ = std::fs::remove_file(&dest);
        if !(is_jar(rel) && std::fs::hard_link(object(sha), &dest).is_ok()) {
            std::fs::copy(object(sha), &dest).map_err(|e| e.to_string())?;
        }
    }
    drop(_guard);
    snapshot_at(game, history, "restored")?;
    Ok(())
}

fn gc() {
    let mut keep = HashSet::new();
    for inst in instances::list() {
        for c in load(&inst.id) {
            keep.extend(c.files.into_values());
        }
    }
    let Ok(dirs) = std::fs::read_dir(objects()) else { return };
    for d in dirs.flatten() {
        let Ok(files) = std::fs::read_dir(d.path()) else { continue };
        for f in files.flatten() {
            if !keep.contains(&f.file_name().to_string_lossy().into_owned()) {
                let _ = std::fs::remove_file(f.path());
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn snapshots_and_restores_with_shared_objects() {
        let root = std::env::temp_dir().join(format!("kromvia-history-{}", std::process::id()));
        let _ = std::fs::remove_dir_all(&root);
        paths::init(root.join("data"));
        let game = root.join("game");
        let hist = root.join("history.json");
        std::fs::create_dir_all(game.join("mods")).unwrap();
        std::fs::create_dir_all(game.join("config/sub")).unwrap();
        std::fs::write(game.join("mods/a.jar"), b"A1").unwrap();
        std::fs::write(game.join("config/sub/a.json"), b"{}").unwrap();
        let first = snapshot_at(&game, &hist, "launch").unwrap().unwrap();
        assert!(snapshot_at(&game, &hist, "launch").unwrap().is_none());
        std::fs::remove_file(game.join("mods/a.jar")).unwrap();
        std::fs::write(game.join("mods/b.jar"), b"B1").unwrap();
        std::fs::write(game.join("config/sub/a.json"), b"{\"x\":1}").unwrap();
        assert!(snapshot_at(&game, &hist, "launch").unwrap().is_some());
        restore_at(&game, &hist, &first).unwrap();
        assert_eq!(std::fs::read(game.join("mods/a.jar")).unwrap(), b"A1");
        assert!(!game.join("mods/b.jar").exists());
        assert_eq!(std::fs::read(game.join("config/sub/a.json")).unwrap(), b"{}");
        let commits = load_at(&hist);
        assert_eq!(commits.len(), 3);
        assert_eq!(commits[0].files, commits[2].files);
        let _ = std::fs::remove_dir_all(&root);
    }

    #[test]
    fn jars_and_configs_are_told_apart() {
        assert!(is_jar("mods/sodium.jar"));
        assert!(is_jar("mods/sodium.jar.disabled"));
        assert!(!is_jar("config/sodium.json"));
        assert!(!is_jar("options.txt"));
    }
}
