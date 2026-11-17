
use std::path::{Path, PathBuf};
use std::time::{SystemTime, UNIX_EPOCH};

use serde::{Deserialize, Serialize};

use crate::engine::core::paths::{self, safe_join};
use crate::engine::game::loaders::Loader;
use crate::engine::game::tuning;
use crate::engine::game::version::check_id;

#[derive(Serialize, Deserialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Instance {
    pub id: String,
    pub name: String,
    pub mc_version: String,
    pub loader: Option<Loader>,
    #[serde(default)]
    pub memory_mb: Option<u64>,
    #[serde(default)]
    pub java_path: Option<String>,
    #[serde(default)]
    pub jvm_args: Option<String>,
    #[serde(default)]
    pub resolution: Option<Resolution>,
    #[serde(default)]
    pub gpu: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    pub created: u64,
    #[serde(default)]
    pub icon: Option<String>,
    #[serde(default)]
    pub no_client: bool,
    /// Uses the launcher-wide `options.txt` (key binds, video settings) instead of its own.
    #[serde(default)]
    pub shared_options: bool,
    /// Local only: never copied into templates, shares or exports.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub hooks: Option<Hooks>,
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct Hooks {
    /// Runs in the game folder before Java starts; a non-zero exit stops the launch.
    #[serde(default)]
    pub pre_launch: String,
    /// Runs in the game folder after the game exits; not waited for.
    #[serde(default)]
    pub post_exit: String,
    /// Program the game is started through, e.g. `gamemoderun` or `prime-run`.
    #[serde(default)]
    pub wrapper: String,
    /// `KEY=value` per line.
    #[serde(default)]
    pub env: String,
}

impl Hooks {
    pub fn env_pairs(&self) -> Vec<(String, String)> {
        self.env
            .lines()
            .map(str::trim)
            .filter(|l| !l.is_empty() && !l.starts_with('#'))
            .filter_map(|l| l.split_once('='))
            .map(|(k, v)| (k.trim().to_string(), v.trim().to_string()))
            .collect()
    }

    fn check(&self) -> Result<(), String> {
        for line in self.env.lines().map(str::trim).filter(|l| !l.is_empty() && !l.starts_with('#')) {
            let Some((key, _)) = line.split_once('=') else { return Err(format!("environment line \"{line}\" needs KEY=value")) };
            let key = key.trim();
            let ok = key.chars().next().is_some_and(|c| c.is_ascii_alphabetic() || c == '_') && key.chars().all(|c| c.is_ascii_alphanumeric() || c == '_');
            if !ok {
                return Err(format!("bad environment variable name \"{key}\""));
            }
        }
        if [&self.pre_launch, &self.post_exit, &self.wrapper, &self.env].iter().any(|s| s.len() > 4000) {
            return Err("launch commands are at most 4000 characters".into());
        }
        Ok(())
    }

    fn is_empty(&self) -> bool {
        [&self.pre_launch, &self.post_exit, &self.wrapper, &self.env].iter().all(|s| s.trim().is_empty())
    }
}

#[derive(Serialize, Deserialize, Clone, Copy, Debug, PartialEq, Eq)]
pub struct Resolution {
    pub width: u32,
    pub height: u32,
}

#[derive(Deserialize, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Settings {
    pub name: String,
    pub mc_version: String,
    pub loader: Option<Loader>,
    pub memory_mb: Option<u64>,
    pub java_path: Option<String>,
    pub jvm_args: Option<String>,
    pub resolution: Option<Resolution>,
    #[serde(default)]
    pub gpu: Option<String>,
    #[serde(default)]
    pub group: Option<String>,
    #[serde(default)]
    pub no_client: Option<bool>,
    /// `None` keeps the current hooks.
    #[serde(default)]
    pub hooks: Option<Hooks>,
    #[serde(default)]
    pub shared_options: Option<bool>,
}

pub fn dir(id: &str) -> Result<PathBuf, String> {
    if id.contains('/') {
        return Err(format!("bad instance id {id}"));
    }
    safe_join(&paths::instances(), id)
}

pub fn game_dir(id: &str) -> Result<PathBuf, String> {
    Ok(dir(id)?.join("minecraft"))
}

pub fn list() -> Vec<Instance> {
    let mut out: Vec<Instance> = std::fs::read_dir(paths::instances())
        .into_iter()
        .flatten()
        .flatten()
        .filter_map(|e| serde_json::from_slice(&std::fs::read(e.path().join("instance.json")).ok()?).ok())
        .collect();
    out.sort_by_key(|i| std::cmp::Reverse(i.created));
    out
}

pub fn get(id: &str) -> Result<Instance, String> {
    let bytes = std::fs::read(dir(id)?.join("instance.json")).map_err(|_| format!("no instance {id}"))?;
    serde_json::from_slice(&bytes).map_err(|e| e.to_string())
}

fn check_name(name: &str) -> Result<&str, String> {
    let name = name.trim();
    if name.is_empty() || name.chars().count() > 64 {
        return Err("name must be 1–64 characters".into());
    }
    Ok(name)
}

fn check_version(mc_version: &str, loader: Option<&Loader>) -> Result<(), String> {
    check_id(mc_version)?;
    if let Some(loader) = loader {
        check_id(&loader.version)?;
    }
    Ok(())
}

fn free_id(name: &str) -> Result<String, String> {
    let base = slug(name);
    let mut id = base.clone();
    let mut n = 2;
    while dir(&id)?.exists() {
        id = format!("{base}-{n}");
        n += 1;
    }
    Ok(id)
}

pub fn now() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_secs()).unwrap_or(0)
}

fn save(inst: &Instance) -> Result<(), String> {
    let json = serde_json::to_vec_pretty(inst).map_err(|e| e.to_string())?;
    std::fs::write(dir(&inst.id)?.join("instance.json"), json).map_err(|e| e.to_string())
}

pub fn create(name: &str, mc_version: &str, loader: Option<Loader>) -> Result<Instance, String> {
    let name = check_name(name)?;
    check_version(mc_version, loader.as_ref())?;
    let id = free_id(name)?;
    let inst = Instance {
        id: id.clone(),
        name: name.to_string(),
        mc_version: mc_version.to_string(),
        loader,
        memory_mb: None,
        java_path: None,
        jvm_args: None,
        resolution: None,
        gpu: None,
        group: None,
        created: now(),
        icon: None,
        no_client: false,
        shared_options: false,
        hooks: None,
    };
    std::fs::create_dir_all(game_dir(&id)?).map_err(|e| e.to_string())?;
    std::fs::write(game_dir(&id)?.join("options.txt"), "guiScale:2\n").map_err(|e| e.to_string())?;
    save(&inst)?;
    Ok(inst)
}

pub fn update(id: &str, s: Settings) -> Result<Instance, String> {
    let mut inst = get(id)?;
    check_version(&s.mc_version, s.loader.as_ref())?;
    if s.memory_mb.is_some_and(|m| !(512..=65536).contains(&m)) {
        return Err("memory must be 512–65536 MB".into());
    }
    if s.resolution.is_some_and(|r| !(320..=16384).contains(&r.width) || !(240..=16384).contains(&r.height)) {
        return Err("bad window size".into());
    }
    if s.gpu.as_deref().is_some_and(|g| g != "discrete" && g != "integrated") {
        return Err("gpu must be discrete or integrated".into());
    }
    if s.group.as_deref().is_some_and(|g| g.trim().chars().count() > 32) {
        return Err("group names are at most 32 characters".into());
    }
    if let Some(args) = &s.jvm_args {
        tuning::check_jvm_args(args)?;
    }
    if let Some(h) = &s.hooks {
        h.check()?;
    }
    let trimmed = |v: Option<String>| v.map(|v| v.trim().to_string()).filter(|v| !v.is_empty());
    inst.name = check_name(&s.name)?.to_string();
    inst.mc_version = s.mc_version;
    inst.loader = s.loader;
    inst.memory_mb = s.memory_mb;
    inst.java_path = trimmed(s.java_path);
    inst.jvm_args = trimmed(s.jvm_args);
    inst.resolution = s.resolution;
    inst.gpu = s.gpu;
    inst.group = trimmed(s.group);
    if let Some(off) = s.no_client {
        inst.no_client = off;
    }
    if let Some(on) = s.shared_options {
        inst.shared_options = on;
    }
    if let Some(h) = s.hooks {
        let h = Hooks { pre_launch: h.pre_launch.trim().into(), post_exit: h.post_exit.trim().into(), wrapper: h.wrapper.trim().into(), env: h.env.trim().into() };
        inst.hooks = (!h.is_empty()).then_some(h);
    }
    save(&inst)?;
    Ok(inst)
}

pub fn duplicate(id: &str) -> Result<Instance, String> {
    let src = get(id)?;
    let name: String = format!("{} (copy)", src.name).chars().take(64).collect();
    let new_id = free_id(&name)?;
    copy_dir(&dir(id)?, &dir(&new_id)?)?;
    let inst = Instance { id: new_id, name, created: now(), ..src };
    save(&inst)?;
    Ok(inst)
}

pub fn copy_dir(from: &Path, to: &Path) -> Result<(), String> {
    std::fs::create_dir_all(to).map_err(|e| e.to_string())?;
    for entry in std::fs::read_dir(from).map_err(|e| e.to_string())?.flatten() {
        let (src, dest) = (entry.path(), to.join(entry.file_name()));
        let kind = entry.file_type().map_err(|e| e.to_string())?;
        if kind.is_dir() {
            if entry.file_name() != "natives" {
                copy_dir(&src, &dest)?;
            }
        } else if kind.is_file() {
            std::fs::copy(&src, &dest).map_err(|e| format!("{}: {e}", src.display()))?;
        }
    }
    Ok(())
}

const BLOCKS: [&str; 6] = ["grass", "crafting", "wool", "stone", "earth", "portal"];
const MAX_ICON: usize = 64 * 1024;

fn check_icon(icon: &str) -> Result<(), String> {
    let ok = match icon.strip_prefix("block:") {
        Some(kind) => BLOCKS.contains(&kind),
        None => icon.len() <= MAX_ICON && icon.strip_prefix("data:image/png;base64,").is_some_and(|b| b.bytes().all(|c| c.is_ascii_alphanumeric() || b"+/=".contains(&c))),
    };
    if ok { Ok(()) } else { Err("bad icon".into()) }
}

pub fn set_memory(id: &str, memory_mb: Option<u64>) -> Result<Instance, String> {
    let mut inst = get(id)?;
    inst.memory_mb = memory_mb;
    save(&inst)?;
    Ok(inst)
}

pub fn set_icon(id: &str, icon: Option<String>) -> Result<Instance, String> {
    if let Some(icon) = &icon {
        check_icon(icon)?;
    }
    let mut inst = get(id)?;
    inst.icon = icon;
    save(&inst)?;
    Ok(inst)
}

const MAX_COVER: usize = 2 * 1024 * 1024;
const COVER_PREFIX: &str = "data:image/jpeg;base64,";

fn cover_path(id: &str) -> Result<PathBuf, String> {
    Ok(dir(id)?.join("cover.jpg"))
}

pub fn cover(id: &str) -> Result<Option<String>, String> {
    use base64::Engine;
    get(id)?;
    Ok(std::fs::read(cover_path(id)?).ok().map(|b| format!("{COVER_PREFIX}{}", base64::engine::general_purpose::STANDARD.encode(b))))
}

pub fn set_cover(id: &str, data_url: Option<&str>) -> Result<(), String> {
    use base64::Engine;
    get(id)?;
    let path = cover_path(id)?;
    let Some(data_url) = data_url else {
        return match std::fs::remove_file(&path) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        };
    };
    let b64 = data_url.strip_prefix(COVER_PREFIX).ok_or("cover must be a JPEG")?;
    if b64.len() > MAX_COVER * 4 / 3 + 4 {
        return Err("cover is too big".into());
    }
    let jpeg = base64::engine::general_purpose::STANDARD.decode(b64).map_err(|e| e.to_string())?;
    if !jpeg.starts_with(&[0xFF, 0xD8, 0xFF]) {
        return Err("cover must be a JPEG".into());
    }
    std::fs::write(path, jpeg).map_err(|e| e.to_string())
}

pub fn delete(id: &str) -> Result<(), String> {
    get(id)?;
    std::fs::remove_dir_all(dir(id)?).map_err(|e| e.to_string())
}

#[derive(Serialize, Deserialize, Clone, Debug, Default, PartialEq)]
#[serde(rename_all = "camelCase", default)]
pub struct Stats {
    pub play_seconds: u64,
    pub launches: u64,
    pub last_played: u64,
}

fn stats_path(id: &str) -> Result<PathBuf, String> {
    Ok(dir(id)?.join("stats.json"))
}

pub fn stats(id: &str) -> Stats {
    stats_path(id).ok().and_then(|p| std::fs::read(p).ok()).and_then(|b| serde_json::from_slice(&b).ok()).unwrap_or_default()
}

fn update_stats(id: &str, f: impl FnOnce(&mut Stats)) {
    let mut s = stats(id);
    f(&mut s);
    if let (Ok(path), Ok(json)) = (stats_path(id), serde_json::to_vec_pretty(&s)) {
        let _ = std::fs::write(path, json);
    }
}

pub fn record_start(id: &str) {
    update_stats(id, |s| {
        s.launches += 1;
        s.last_played = now();
    });
}

pub fn record_play(id: &str, seconds: u64) {
    update_stats(id, |s| s.play_seconds += seconds);
}

#[derive(Serialize, Debug, Default)]
#[serde(rename_all = "camelCase")]
pub struct Usage {
    pub total: u64,
    pub saves: u64,
    pub mods: u64,
    pub screenshots: u64,
    pub junk: u64,
}

fn junk(id: &str) -> Result<Vec<PathBuf>, String> {
    let game = game_dir(id)?;
    let mut out = vec![dir(id)?.join("natives"), game.join("crash-reports")];
    out.extend(
        std::fs::read_dir(game.join("logs"))
            .into_iter()
            .flatten()
            .flatten()
            .map(|e| e.path())
            .filter(|p| p.file_name().is_some_and(|n| n != "latest.log")),
    );
    Ok(out)
}

fn size(path: &Path) -> u64 {
    if path.is_dir() { crate::engine::worlds::dir_size(path) } else { std::fs::metadata(path).map(|m| m.len()).unwrap_or(0) }
}

pub fn usage(id: &str) -> Result<Usage, String> {
    let game = game_dir(id)?;
    Ok(Usage {
        total: size(&dir(id)?),
        saves: size(&game.join("saves")),
        mods: size(&game.join("mods")),
        screenshots: size(&game.join("screenshots")),
        junk: junk(id)?.iter().map(|p| size(p)).sum(),
    })
}

pub fn clean(id: &str) -> Result<u64, String> {
    let mut freed = 0;
    for path in junk(id)? {
        let n = size(&path);
        let gone = if path.is_dir() { std::fs::remove_dir_all(&path) } else { std::fs::remove_file(&path) };
        if gone.is_ok() {
            freed += n;
        }
    }
    Ok(freed)
}

pub(crate) fn slug(name: &str) -> String {
    let s: String = name
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() { c.to_ascii_lowercase() } else { '-' })
        .collect();
    let s = s.split('-').filter(|p| !p.is_empty()).collect::<Vec<_>>().join("-");
    if s.is_empty() { "instance".into() } else { s }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn checks_icons() {
        assert!(check_icon("block:grass").is_ok());
        assert!(check_icon("block:dirt").is_err());
        assert!(check_icon("data:image/png;base64,iVBORw0KGgo=").is_ok());
        assert!(check_icon("data:image/svg+xml;base64,PHN2Zz4=").is_err());
        assert!(check_icon("data:image/png;base64,\"><script>").is_err());
        assert!(check_icon(&format!("data:image/png;base64,{}", "A".repeat(MAX_ICON))).is_err());
    }

    #[test]
    fn slugs_names() {
        assert_eq!(slug("My PvP Pack 1.21!"), "my-pvp-pack-1-21");
        assert_eq!(slug("Збірка"), "instance");
        assert_eq!(slug("../etc"), "etc");
    }

    #[test]
    fn keeps_stats_and_cleans() {
        paths::init(std::env::temp_dir().join(format!("kromvia-inst-{}", std::process::id())));
        let a = create("Stats", "1.21.4", None).unwrap();
        assert_eq!(stats(&a.id), Stats::default());
        record_start(&a.id);
        record_play(&a.id, 90);
        record_play(&a.id, 10);
        let s = stats(&a.id);
        assert_eq!((s.launches, s.play_seconds), (1, 100));
        assert!(s.last_played > 0);

        let logs = game_dir(&a.id).unwrap().join("logs");
        std::fs::create_dir_all(&logs).unwrap();
        std::fs::write(logs.join("latest.log"), "keep").unwrap();
        std::fs::write(logs.join("2026-01-01-1.log.gz"), [0u8; 50]).unwrap();
        std::fs::create_dir_all(dir(&a.id).unwrap().join("natives")).unwrap();
        std::fs::write(dir(&a.id).unwrap().join("natives/x.so"), [0u8; 30]).unwrap();
        assert_eq!(usage(&a.id).unwrap().junk, 80);
        assert_eq!(clean(&a.id).unwrap(), 80);
        assert!(logs.join("latest.log").is_file());
        assert_eq!(usage(&a.id).unwrap().junk, 0);
        delete(&a.id).unwrap();
    }

    #[test]
    fn updates_and_duplicates() {
        paths::init(std::env::temp_dir().join(format!("kromvia-inst-{}", std::process::id())));
        let a = create("Pack", "1.21.4", None).unwrap();
        assert_eq!(std::fs::read_to_string(game_dir(&a.id).unwrap().join("options.txt")).unwrap(), "guiScale:2\n");
        std::fs::write(game_dir(&a.id).unwrap().join("options.txt"), "fov:90").unwrap();
        std::fs::create_dir_all(dir(&a.id).unwrap().join("natives")).unwrap();

        let s = |name: &str, mem| Settings {
            name: name.into(),
            mc_version: "1.20.1".into(),
            loader: None,
            memory_mb: mem,
            java_path: Some("  ".into()),
            jvm_args: Some(" -Dx=1 ".into()),
            resolution: Some(Resolution { width: 1280, height: 720 }),
            gpu: None,
            group: Some("  PvP ".into()),
            no_client: None,
            hooks: None,
            shared_options: None,
        };
        assert!(update(&a.id, s("Pack", Some(100))).is_err());
        let u = update(&a.id, s("Renamed", Some(4096))).unwrap();
        assert_eq!((u.name.as_str(), u.mc_version.as_str(), u.java_path, u.jvm_args.as_deref()), ("Renamed", "1.20.1", None, Some("-Dx=1")));
        assert_eq!(get(&a.id).unwrap().memory_mb, Some(4096));
        assert_eq!(u.group.as_deref(), Some("PvP"));

        let b = duplicate(&a.id).unwrap();
        assert_eq!(b.name, "Renamed (copy)");
        assert_ne!(b.id, a.id);
        assert_eq!(std::fs::read_to_string(game_dir(&b.id).unwrap().join("options.txt")).unwrap(), "fov:90");
        assert!(!dir(&b.id).unwrap().join("natives").exists());
        assert_eq!(get(&b.id).unwrap().resolution, u.resolution);
        delete(&a.id).unwrap();
        delete(&b.id).unwrap();
    }

    #[test]
    fn hooks_env_lines() {
        let h = Hooks { env: "MANGOHUD=1\n# note\n\n  A_B = x=y ".into(), ..Default::default() };
        assert!(h.check().is_ok());
        assert_eq!(h.env_pairs(), [("MANGOHUD".to_string(), "1".to_string()), ("A_B".to_string(), "x=y".to_string())]);
        assert!(Hooks { env: "NOEQUALS".into(), ..Default::default() }.check().is_err());
        assert!(Hooks { env: "1BAD=x".into(), ..Default::default() }.check().is_err());
        assert!(Hooks { env: "BAD-NAME=x".into(), ..Default::default() }.check().is_err());
    }
}
