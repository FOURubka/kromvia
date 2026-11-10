
use std::collections::{HashMap, VecDeque};
use std::path::{Path, PathBuf};
use std::process::Stdio;
use std::sync::{Arc, Mutex};
use std::time::Instant;

use md5::{Digest, Md5};
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager, Runtime};
use tokio::io::{AsyncBufReadExt, AsyncRead, AsyncWriteExt, BufReader};
use tokio::process::Command;
use tokio::sync::mpsc::{unbounded_channel, UnboundedSender};
use tokio::sync::oneshot;

use super::crash::{self, Crash};
use super::report::{self, Reports};
use super::install::{self, launch_jar, legacy_assets_dir, log_config_path};
use super::loaders::{self, LoaderKind};
use super::logs::{LogLine, LogParser};
use super::tuning;
use super::version::{flatten_args, merge, rules_allow, Argument, OneOrMany, VersionJson};
use crate::engine::accounts::{self, Session};
use crate::engine::content::{modrinth, ContentKind};
use crate::engine::core::jobs::{Job, Jobs};
use crate::engine::core::paths;
use crate::engine::instances::{self, Instance};
use crate::engine::java;
use crate::engine::social::Live;

#[derive(Default)]
pub struct Games {
    running: Mutex<HashMap<u64, Running>>,
    switching: Mutex<HashMap<u64, Switch>>,
    media: Mutex<Option<String>>,
}

struct Running {
    instance_id: String,
    kill: Option<oneshot::Sender<()>>,
    stdin: UnboundedSender<String>,
    restart: LaunchOptions,
    offline: Option<String>,
}

struct Switch {
    id: Option<String>,
    name: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RunInfo {
    pub run_id: u64,
    pub instance_id: String,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct LogEvent<'a> {
    run_id: u64,
    line: &'a LogLine,
}

#[derive(Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct ExitEvent {
    run_id: u64,
    instance_id: String,
    code: Option<i32>,
    crash: Option<Crash>,
}

impl Games {
    pub fn list(&self) -> Vec<RunInfo> {
        self.running
            .lock()
            .unwrap()
            .iter()
            .map(|(&run_id, r)| RunInfo { run_id, instance_id: r.instance_id.clone() })
            .collect()
    }

    pub fn stop(&self, run_id: u64) -> bool {
        let kill = self.running.lock().unwrap().get_mut(&run_id).and_then(|r| r.kill.take());
        kill.is_some_and(|k| k.send(()).is_ok())
    }

    pub fn wardrobe_changed(&self) {
        let line = serde_json::json!({ "wardrobe": true }).to_string() + "\n";
        for r in self.running.lock().unwrap().values() {
            let _ = r.stdin.send(line.clone());
        }
    }

    pub fn toast(&self, title: &str, text: &str) {
        let line = serde_json::json!({ "toast": { "title": title, "text": text } }).to_string() + "\n";
        for r in self.running.lock().unwrap().values() {
            let _ = r.stdin.send(line.clone());
        }
    }

    pub fn media(&self, track: Option<serde_json::Value>) {
        let line = serde_json::json!({ "media": track }).to_string() + "\n";
        *self.media.lock().unwrap() = Some(line.clone());
        for r in self.running.lock().unwrap().values() {
            let _ = r.stdin.send(line.clone());
        }
    }

    pub fn social(&self, state: &serde_json::Value) {
        let line = serde_json::json!({ "social": state }).to_string() + "\n";
        for r in self.running.lock().unwrap().values() {
            let _ = r.stdin.send(line.clone());
        }
    }

    pub fn worn(&self, msg: &serde_json::Value) {
        let line = serde_json::json!({ "worn": { "host": msg["host"], "worn": msg["worn"] } }).to_string() + "\n";
        for r in self.running.lock().unwrap().values() {
            let _ = r.stdin.send(line.clone());
        }
    }
}

fn client_flag(inst: &Instance, jar: Option<PathBuf>) -> Option<String> {
    if inst.no_client {
        return None;
    }
    let flag = match inst.loader.as_ref().map(|l| l.kind) {
        Some(LoaderKind::Fabric) => "fabric.addMods",
        Some(LoaderKind::Quilt) => "loader.addMods",
        _ => return None,
    };
    jar.map(|j| format!("-D{flag}={}", j.display()))
}

/// Forge and NeoForge have no way to add a mod from outside the mods folder, so the client goes
/// there under a fixed name, and is taken out again when the instance moves to another loader.
fn sync_forge_client(inst: &Instance, game_dir: &Path) -> Result<(), String> {
    use crate::engine::core::http::sha1_file;
    let dest = game_dir.join("mods").join(crate::engine::content::BUILT_IN_CLIENT);
    let flavor = match inst.loader.as_ref().map(|l| l.kind).filter(|_| !inst.no_client) {
        Some(LoaderKind::Forge) => Some("forge"),
        Some(LoaderKind::NeoForge) => Some("neoforge"),
        _ => None,
    };
    let Some(jar) = flavor.and_then(|f| paths::forge_client_jar(&inst.mc_version, f)) else {
        if dest.is_file() {
            std::fs::remove_file(&dest).map_err(|e| e.to_string())?;
        }
        return Ok(());
    };
    if dest.is_file() && sha1_file(&dest)? == sha1_file(&jar)? {
        return Ok(());
    }
    std::fs::create_dir_all(game_dir.join("mods")).map_err(|e| e.to_string())?;
    let tmp = dest.with_extension("jar.tmp");
    std::fs::copy(&jar, &tmp).map_err(|e| e.to_string())?;
    std::fs::rename(&tmp, &dest).map_err(|e| e.to_string())
}

fn pinned_client(jar: &Path) -> Result<PathBuf, String> {
    let hash = crate::engine::core::http::sha1_file(jar)?;
    let dir = paths::root().join("client");
    let pinned = dir.join(format!("kromvia-client-{}.jar", &hash[..12]));
    if !pinned.is_file() {
        std::fs::create_dir_all(&dir).map_err(|e| e.to_string())?;
        let tmp = pinned.with_extension("jar.tmp");
        std::fs::copy(jar, &tmp).map_err(|e| e.to_string())?;
        std::fs::rename(&tmp, &pinned).map_err(|e| e.to_string())?;
    }
    Ok(pinned)
}

pub fn valid_username(name: &str) -> bool {
    (3..=16).contains(&name.len()) && name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_')
}

pub fn offline_uuid(name: &str) -> String {
    let mut h: [u8; 16] = Md5::digest(format!("OfflinePlayer:{name}").as_bytes()).into();
    h[6] = (h[6] & 0x0f) | 0x30;
    h[8] = (h[8] & 0x3f) | 0x80;
    let hex: String = h.iter().map(|b| format!("{b:02x}")).collect();
    format!("{}-{}-{}-{}-{}", &hex[..8], &hex[8..12], &hex[12..16], &hex[16..20], &hex[20..])
}

pub fn offline_session(name: &str) -> Result<Session, String> {
    if !valid_username(name) {
        return Err("nickname must be 3–16 letters, digits or _".into());
    }
    Ok(Session {
        name: name.to_string(),
        uuid: offline_uuid(name).replace('-', ""),
        access_token: "0".into(),
        xuid: "0".into(),
        online: false,
        injector: None,
    })
}

#[derive(Default, Clone)]
pub struct LaunchOptions {
    pub join: Option<String>,
    pub world: Option<String>,
    pub room: bool,
}

pub fn valid_address(addr: &str) -> bool {
    !addr.is_empty()
        && addr.len() <= 253
        && !addr.starts_with('-')
        && addr.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.' || b == b'-' || b == b':')
}

pub async fn launch<R: Runtime>(
    app: AppHandle<R>,
    inst: Instance,
    session: Session,
    opts: LaunchOptions,
    job: Arc<Job>,
) -> Result<(), String> {
    let mut prepared = prepare(&inst, &session, &job).await?;
    if job.is_cancelled() {
        return Err("cancelled".into());
    }
    let restart = LaunchOptions::default();
    let who = Who { id: session.online.then(|| session.uuid.clone()), name: session.name.clone(), restart };
    if let Some(addr) = opts.join {
        if !valid_address(&addr) {
            return Err(format!("bad server address {addr}"));
        }
        if prepared.quick_play {
            prepared.args.extend(["--quickPlayMultiplayer".into(), addr]);
        } else {
            let (host, port) = crate::engine::servers::split_address(&addr);
            prepared.args.extend(["--server".into(), host, "--port".into(), port.to_string()]);
        }
    }
    if let Some(world) = opts.world {
        if !prepared.quick_play {
            return Err("opening a world from the launcher needs Minecraft 1.20 or newer".into());
        }
        if world.starts_with('-') {
            return Err(format!("bad world {world}"));
        }
        crate::engine::worlds::world_dir(&inst.id, &world)?;
        prepared.args.extend(["--quickPlaySingleplayer".into(), world]);
    }
    let profiles = paths::root().join("client-profiles").to_string_lossy().into_owned();
    let mut env: Vec<(&str, &str)> = vec![("KROMVIA_PROFILES", &profiles)];
    if opts.room {
        env.push(("KROMVIA_ROOM", "1"));
    }
    let wardrobe = crate::engine::wardrobe::json_path();
    let cape_png = crate::engine::wardrobe::cape_path();
    let (wardrobe, cape_png) = (wardrobe.to_string_lossy().into_owned(), cape_png.to_string_lossy().into_owned());
    env.push(("KROMVIA_WARDROBE", &wardrobe));
    if std::path::Path::new(&cape_png).is_file() {
        env.push(("KROMVIA_CAPE_PNG", &cape_png));
    }
    if let Some(gpu) = inst.gpu.as_deref() {
        env.extend(gpu_env(gpu));
        set_gpu_preference(&prepared.java, gpu);
    }
    spawn(app, &inst.id, &prepared.java, &prepared.args, &prepared.game_dir, &env, who)
}

fn gpu_env(gpu: &str) -> &'static [(&'static str, &'static str)] {
    if !cfg!(target_os = "linux") {
        return &[];
    }
    match gpu {
        "discrete" => &[
            ("DRI_PRIME", "1"),
            ("__NV_PRIME_RENDER_OFFLOAD", "1"),
            ("__GLX_VENDOR_LIBRARY_NAME", "nvidia"),
            ("__VK_LAYER_NV_optimus", "NVIDIA_only"),
        ],
        _ => &[("DRI_PRIME", "0")],
    }
}

#[cfg(windows)]
fn set_gpu_preference(java: &Path, gpu: &str) {
    use std::os::windows::process::CommandExt;
    let value = if gpu == "discrete" { "GpuPreference=2;" } else { "GpuPreference=1;" };
    let mut bins = vec![java.to_path_buf()];
    bins.push(java.with_file_name("javaw.exe"));
    for bin in bins {
        let _ = std::process::Command::new("reg")
            .args(["add", r"HKCU\Software\Microsoft\DirectX\UserGpuPreferences", "/v"])
            .arg(&bin)
            .args(["/t", "REG_SZ", "/d", value, "/f"])
            .creation_flags(0x0800_0000)
            .status();
    }
}

#[cfg(not(windows))]
fn set_gpu_preference(_java: &Path, _gpu: &str) {}

struct Who {
    id: Option<String>,
    name: String,
    restart: LaunchOptions,
}

pub fn start<R: Runtime>(
    app: &AppHandle<R>,
    jobs: &Jobs,
    instance_id: String,
    username: String,
    account_id: Option<String>,
    opts: LaunchOptions,
) -> Result<u64, String> {
    let inst = instances::get(&instance_id)?;
    if opts.join.as_deref().is_some_and(|a| !valid_address(a)) {
        return Err("bad server address".into());
    }
    if opts.room && inst.loader.is_none() {
        return Err("rooms need an instance with a mod loader".into());
    }
    let offline = match account_id {
        Some(_) => None,
        None => Some(offline_session(&username)?),
    };
    let handle = app.clone();
    jobs.spawn(app, format!("launch-{instance_id}"), move |job| async move {
        let session = match (offline, account_id) {
            (Some(s), _) => s,
            (None, Some(id)) => accounts::session(&id).await?,
            (None, None) => unreachable!(),
        };
        add_resourcify(&inst, &job).await;
        if opts.room {
            modrinth::install(&inst.id, "e4mc", None, ContentKind::Mod, &job).await?;
        } else {
            add_e4mc(&inst, &job).await;
        }
        launch(handle, inst, session, opts, job).await
    })
}

fn has_mod(inst: &Instance, name: &str) -> bool {
    crate::engine::content::list(&inst.id)
        .is_ok_and(|fs| fs.iter().any(|f| f.folder == "mods" && (f.file.to_lowercase().contains(name) || f.title.to_lowercase().contains(name))))
}

async fn add_e4mc(inst: &Instance, job: &Arc<Job>) {
    let client = match inst.loader.as_ref().map(|l| l.kind).filter(|_| !inst.no_client) {
        Some(LoaderKind::Fabric | LoaderKind::Quilt) => paths::client_jar(&inst.mc_version),
        Some(LoaderKind::Forge) => paths::forge_client_jar(&inst.mc_version, "forge"),
        Some(LoaderKind::NeoForge) => paths::forge_client_jar(&inst.mc_version, "neoforge"),
        _ => None,
    };
    let Ok(marker) = instances::dir(&inst.id).map(|d| d.join(".e4mc-unsupported")) else { return };
    if client.is_none() || marker.exists() || has_mod(inst, "e4mc") {
        return;
    }
    if let Err(e) = modrinth::install(&inst.id, "e4mc", None, ContentKind::Mod, job).await {
        if e.contains("no compatible version") || e.contains("incompatible") {
            let _ = std::fs::write(marker, "");
        }
    }
}

async fn add_resourcify(inst: &Instance, job: &Arc<Job>) {
    let Ok(marker) = instances::dir(&inst.id).map(|d| d.join(".resourcify")) else { return };
    if inst.loader.is_none() || marker.exists() {
        return;
    }
    let have = crate::engine::content::list(&inst.id)
        .is_ok_and(|fs| fs.iter().any(|f| f.folder == "mods" && (f.file.to_lowercase().contains("resourcify") || f.title.to_lowercase().contains("resourcify"))));
    let settled = have
        || match modrinth::install(&inst.id, "resourcify", None, ContentKind::Mod, job).await {
            Ok(_) => true,
            Err(e) => e.contains("no compatible version") || e.contains("incompatible"),
        };
    if settled {
        let _ = std::fs::write(marker, "");
    }
}

pub struct Prepared {
    pub java: PathBuf,
    pub args: Vec<String>,
    pub game_dir: PathBuf,
    pub quick_play: bool,
}

fn supports_quick_play(version: &VersionJson) -> bool {
    version.arguments.as_ref().is_some_and(|a| {
        a.game.iter().any(|arg| match arg {
            Argument::Ruled { value: OneOrMany::Many(v), .. } => v.iter().any(|s| s == "--quickPlayMultiplayer"),
            Argument::Ruled { value: OneOrMany::One(s), .. } => s == "--quickPlayMultiplayer",
            Argument::Plain(_) => false,
        })
    })
}

pub async fn repair(inst: &Instance, job: &Arc<Job>) -> Result<usize, String> {
    let (version, _, game_dir) = resolve(inst, job).await?;
    let broken = install::verify_files(&inst.mc_version, &version, job).await?;
    install::ensure_files(&inst.mc_version, &version, &game_dir, job).await?;
    Ok(broken)
}

pub async fn prepare(inst: &Instance, session: &Session, job: &Arc<Job>) -> Result<Prepared, String> {
    let (version, java_bin, game_dir) = resolve(inst, job).await?;
    crate::engine::servers::apply_pins(&inst.id)?;
    let agent = match session.injector {
        Some(api) => Some(format!("-javaagent:{}={api}", authlib_injector(job).await?.to_string_lossy())),
        None => None,
    };
    job.progress("natives", 0, None);
    let mut prepared = prepare_from(inst, session, version, java_bin, game_dir)?;
    if let Some(agent) = agent {
        prepared.args.insert(0, agent);
    }
    Ok(prepared)
}

#[derive(serde::Deserialize)]
struct InjectorRelease {
    version: String,
    download_url: String,
    checksums: InjectorChecksums,
}

#[derive(serde::Deserialize)]
struct InjectorChecksums {
    sha256: String,
}

async fn authlib_injector(job: &Arc<Job>) -> Result<PathBuf, String> {
    let dir = paths::libraries().join("authlib-injector");
    let cached = || {
        std::fs::read_dir(&dir).ok()?.flatten().map(|e| e.path()).filter(|p| p.extension().is_some_and(|e| e == "jar")).max()
    };
    let release: InjectorRelease = match crate::engine::core::http::get_json("https://authlib-injector.yushi.moe/artifact/latest.json").await {
        Ok(r) => r,
        Err(e) => return cached().ok_or(format!("authlib-injector: {e}")),
    };
    if !release.download_url.starts_with("https://authlib-injector.yushi.moe/") || !release.version.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'.') {
        return cached().ok_or_else(|| "unexpected authlib-injector release".to_string());
    }
    let dest = dir.join(format!("authlib-injector-{}.jar", release.version));
    if !dest.is_file() {
        job.progress("authlib-injector", 0, None);
        crate::engine::core::http::download(
            &crate::engine::core::http::Download {
                url: &release.download_url,
                dest: &dest,
                hash: Some(crate::engine::core::http::Hash::Sha256(release.checksums.sha256)),
                size: None,
            },
            job.cancel_flag(),
            |_, _| {},
        )
        .await?;
    }
    Ok(dest)
}

async fn resolve(inst: &Instance, job: &Arc<Job>) -> Result<(VersionJson, PathBuf, PathBuf), String> {
    job.progress("resolve", 0, None);
    let mut vanilla = install::vanilla_json(&inst.mc_version, job).await?;
    if cfg!(target_os = "macos") && std::env::consts::ARCH == "aarch64" {
        vanilla.libraries = super::version::swap_lwjgl2(std::mem::take(&mut vanilla.libraries));
    }
    let game_dir = instances::game_dir(&inst.id)?;
    std::fs::create_dir_all(&game_dir).map_err(|e| e.to_string())?;
    install::ensure_files(&inst.mc_version, &vanilla, &game_dir, job).await?;

    let mut required = vanilla.java_version.as_ref().map_or(8, |j| j.major_version);
    if !inst.no_client && inst.loader.as_ref().is_some_and(|l| matches!(l.kind, LoaderKind::Fabric | LoaderKind::Quilt)) && paths::client_jar(&inst.mc_version).is_some() {
        required = required.max(17);
    }
    let major = java::pick_major(required)?;
    let java_bin = match (&inst.java_path, java::managed_bin(major)) {
        (Some(custom), _) => java::check(custom).await.map_err(|e| format!("custom Java: {e}"))?.path,
        (None, Some(bin)) => bin,
        (None, None) => {
            java::install(major, job.clone()).await?;
            java::managed_bin(major).ok_or("Java install finished but no binary found")?
        }
    };

    let version = match &inst.loader {
        None => vanilla,
        Some(loader) => {
            let profile = loaders::profile(loader, &inst.mc_version, &java_bin, job).await?;
            let merged = merge(profile, vanilla);
            install::ensure_files(&inst.mc_version, &merged, &game_dir, job).await?;
            merged
        }
    };
    Ok((version, java_bin, game_dir))
}

fn prepare_from(inst: &Instance, session: &Session, version: VersionJson, java_bin: PathBuf, game_dir: PathBuf) -> Result<Prepared, String> {
    let natives = natives_dir(&instances::dir(&inst.id)?.join("natives"), &version)?;

    let memory = inst.memory_mb.unwrap_or_else(|| super::lag::auto_memory(&inst.id));
    let mut jvm_extra = tuning::jvm_flags(memory);
    if let Some(log) = version.logging.as_ref().and_then(|l| l.client.as_ref()) {
        let path = log_config_path(&log.file.id)?;
        jvm_extra.push(log.argument.replace("${path}", &path.to_string_lossy()));
    }
    jvm_extra.extend(client_flag(inst, paths::client_jar(&inst.mc_version).map(|j| pinned_client(&j)).transpose()?));
    sync_forge_client(inst, &game_dir)?;
    for file in crate::engine::content::conflicts::drop_superseded(&game_dir.join("mods")) {
        crate::engine::core::crashlog::write("launch", &format!("removed {file}: conflicts with an installed mod"));
    }
    jvm_extra.extend(inst.jvm_args.iter().flat_map(|a| a.split_whitespace().map(String::from)));
    for flag in tuning::drop_unknown_flags(&java_bin, &mut jvm_extra) {
        crate::engine::core::crashlog::write("launch", &format!("dropped JVM option {flag}: not supported by {}", java_bin.display()));
    }
    let vars = launch_vars(inst, &version, session, &game_dir, &natives)?;
    let mut args = build_args(&version, &vars, jvm_extra);
    if let Some(r) = inst.resolution {
        args.extend(["--width".into(), r.width.to_string(), "--height".into(), r.height.to_string()]);
    }
    Ok(Prepared { java: java_bin, args, game_dir, quick_play: supports_quick_play(&version) })
}

fn natives_dir(root: &Path, version: &VersionJson) -> Result<PathBuf, String> {
    use std::hash::{Hash, Hasher};
    let mut h = std::collections::hash_map::DefaultHasher::new();
    for lib in version.libraries.iter().filter(|l| rules_allow(&l.rules)) {
        if let Some(art) = lib.native_artifact() {
            (art.path, art.sha1).hash(&mut h);
        }
    }
    let key = format!("{:016x}", h.finish());
    let dir = root.join(&key);
    if !dir.is_dir() {
        let tmp = root.join(format!(".tmp-{key}"));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).map_err(|e| e.to_string())?;
        extract_natives(version, &tmp)?;
        std::fs::rename(&tmp, &dir).map_err(|e| e.to_string())?;
    }
    for e in std::fs::read_dir(root).map_err(|e| e.to_string())?.flatten() {
        if e.file_name() != key.as_str() {
            let p = e.path();
            let _ = if p.is_dir() { std::fs::remove_dir_all(&p) } else { std::fs::remove_file(&p) };
        }
    }
    Ok(dir)
}

fn extract_natives(version: &VersionJson, dest: &Path) -> Result<(), String> {
    for lib in version.libraries.iter().filter(|l| rules_allow(&l.rules)) {
        let Some(art) = lib.native_artifact() else { continue };
        let jar = paths::safe_join(&paths::libraries(), art.path.as_deref().ok_or("native has no path")?)?;
        let file = std::fs::File::open(&jar).map_err(|e| format!("{}: {e}", jar.display()))?;
        let mut zip = zip::ZipArchive::new(file).map_err(|e| e.to_string())?;
        for i in 0..zip.len() {
            let mut entry = zip.by_index(i).map_err(|e| e.to_string())?;
            let Some(name) = entry.enclosed_name() else { continue };
            if entry.is_dir() || name.starts_with("META-INF") {
                continue;
            }
            let out = dest.join(name);
            if let Some(parent) = out.parent() {
                std::fs::create_dir_all(parent).map_err(|e| e.to_string())?;
            }
            let mut f = std::fs::File::create(&out).map_err(|e| e.to_string())?;
            std::io::copy(&mut entry, &mut f).map_err(|e| e.to_string())?;
        }
    }
    Ok(())
}

fn classpath(version: &VersionJson, mc: &str) -> Result<String, String> {
    let mut entries: Vec<PathBuf> = Vec::new();
    for lib in version.libraries.iter().filter(|l| rules_allow(&l.rules)) {
        if let Some(path) = lib.artifact().and_then(|a| a.path) {
            entries.push(paths::safe_join(&paths::libraries(), &path)?);
        }
    }
    entries.push(launch_jar(mc, &version.id)?);
    let sep = if cfg!(windows) { ";" } else { ":" };
    Ok(entries.iter().map(|p| p.to_string_lossy()).collect::<Vec<_>>().join(sep))
}

fn launch_vars(
    inst: &Instance,
    version: &VersionJson,
    session: &Session,
    game_dir: &Path,
    natives: &Path,
) -> Result<HashMap<&'static str, String>, String> {
    let index_id = version.asset_index.as_ref().map(|a| a.id.clone()).unwrap_or_default();
    let assets_root = paths::assets().to_string_lossy().into_owned();
    let game_assets = match index_id.as_str() {
        "pre-1.6" => game_dir.join("resources").to_string_lossy().into_owned(),
        "legacy" => legacy_assets_dir(&index_id)?.to_string_lossy().into_owned(),
        _ => assets_root.clone(),
    };
    let s = |p: &Path| p.to_string_lossy().into_owned();
    Ok(HashMap::from([
        ("auth_player_name", session.name.clone()),
        ("auth_uuid", session.uuid.clone()),
        ("auth_access_token", session.access_token.clone()),
        ("auth_session", if session.online { format!("token:{}:{}", session.access_token, session.uuid) } else { "0".into() }),
        ("auth_xuid", session.xuid.clone()),
        ("clientid", "0".into()),
        ("user_type", if session.injector.is_some() { "mojang" } else if session.online { "msa" } else { "legacy" }.into()),
        ("user_properties", "{}".into()),
        ("version_name", version.id.clone()),
        ("version_type", version.kind.clone().unwrap_or_else(|| "release".into())),
        ("game_directory", s(game_dir)),
        ("assets_root", assets_root),
        ("game_assets", game_assets),
        ("assets_index_name", index_id),
        ("natives_directory", s(natives)),
        ("library_directory", s(&paths::libraries())),
        ("classpath", classpath(version, &inst.mc_version)?),
        ("classpath_separator", if cfg!(windows) { ";".into() } else { ":".into() }),
        ("launcher_name", "kromvia".into()),
        ("launcher_version", env!("CARGO_PKG_VERSION").into()),
    ]))
}

fn substitute(arg: &str, vars: &HashMap<&'static str, String>) -> String {
    let mut out = arg.to_string();
    for (k, v) in vars {
        out = out.replace(&format!("${{{k}}}"), v);
    }
    out
}

pub fn build_args(version: &VersionJson, vars: &HashMap<&'static str, String>, jvm_extra: Vec<String>) -> Vec<String> {
    let mut jvm = Vec::new();
    if version.minecraft_arguments.is_some() {
        jvm.extend(["-Djava.library.path=${natives_directory}", "-cp", "${classpath}"].map(String::from));
    }
    let game = match &version.arguments {
        Some(a) if !a.game.is_empty() => {
            jvm.extend(flatten_args(&a.jvm));
            flatten_args(&a.game)
        }
        other => {
            if let Some(a) = other {
                jvm.extend(flatten_args(&a.jvm));
            }
            version.minecraft_arguments.as_deref().unwrap_or_default().split_whitespace().map(String::from).collect()
        }
    };
    jvm_extra
        .into_iter()
        .chain(jvm.iter().map(|a| substitute(a, vars)))
        .chain([version.main_class.clone()])
        .chain(game.iter().map(|a| substitute(a, vars)))
        .collect()
}

fn spawn<R: Runtime>(
    app: AppHandle<R>,
    instance_id: &str,
    java: &Path,
    args: &[String],
    game_dir: &Path,
    env: &[(&str, &str)],
    who: Who,
) -> Result<(), String> {
    let mut cmd = Command::new(java);
    cmd.args(args).envs(env.iter().copied()).current_dir(game_dir).stdin(Stdio::piped()).stdout(Stdio::piped()).stderr(Stdio::piped());
    #[cfg(windows)]
    cmd.creation_flags(0x0800_0000); // CREATE_NO_WINDOW
    let mut child = cmd.spawn().map_err(|e| format!("failed to start Java: {e}"))?;
    let player = who.name.clone();
    let player_uuid = who.id.clone().unwrap_or_else(|| offline_uuid(&who.name));

    static NEXT_RUN: std::sync::atomic::AtomicU64 = std::sync::atomic::AtomicU64::new(1);
    let run_id = NEXT_RUN.fetch_add(1, std::sync::atomic::Ordering::Relaxed);
    let (kill_tx, kill_rx) = oneshot::channel();
    let (stdin_tx, mut stdin_rx) = unbounded_channel::<String>();
    let mut stdin = child.stdin.take().unwrap();
    tauri::async_runtime::spawn(async move {
        while let Some(line) = stdin_rx.recv().await {
            if stdin.write_all(line.as_bytes()).await.is_err() || stdin.flush().await.is_err() {
                break;
            }
        }
    });
    app.state::<Games>()
        .running
        .lock()
        .unwrap()
        .insert(
            run_id,
            Running {
                instance_id: instance_id.to_string(),
                kill: Some(kill_tx),
                stdin: stdin_tx.clone(),
                offline: who.id.is_none().then(|| who.name.clone()),
                restart: who.restart,
            },
        );
    let mut list: Vec<serde_json::Value> =
        accounts::list().iter().map(|a| serde_json::json!({ "id": a.id, "name": a.name })).collect();
    if who.id.is_none() {
        list.push(serde_json::json!({ "id": null, "name": who.name }));
    }
    let _ = stdin_tx.send(serde_json::json!({ "accounts": { "active": who.id, "list": list } }).to_string() + "\n");
    let total: u64 = instances::list().iter().map(|i| instances::stats(&i.id).play_seconds).sum();
    let build = instances::stats(instance_id).play_seconds;
    let _ = stdin_tx.send(serde_json::json!({ "playtime": { "build": build, "total": total } }).to_string() + "\n");
    if let Some(line) = app.state::<Games>().media.lock().unwrap().clone() {
        let _ = stdin_tx.send(line);
    }
    let _ = app.emit("game-started", RunInfo { run_id, instance_id: instance_id.to_string() });

    let tail = Arc::new(Mutex::new(VecDeque::new()));
    let out = tauri::async_runtime::spawn(pump(app.clone(), run_id, who.name.clone(), child.stdout.take().unwrap(), tail.clone()));
    let err = tauri::async_runtime::spawn(pump(app.clone(), run_id, who.name.clone(), child.stderr.take().unwrap(), tail.clone()));
    let instance_id = instance_id.to_string();
    instances::record_start(&instance_id);
    let metrics = child.id().map(|pid| crate::engine::metrics::watch(instance_id.clone(), pid));
    tauri::async_runtime::spawn(watch_mods(app.clone(), run_id, instance_id.clone()));
    let started = Instant::now();
    tauri::async_runtime::spawn(async move {
        let (status, stopped) = tokio::select! {
            status = child.wait() => (status.ok(), false),
            _ = kill_rx => {
                let _ = child.kill().await;
                (child.wait().await.ok(), true)
            }
        };
        if let Some(m) = metrics {
            let _ = m.send(());
        }
        let _ = out.await;
        let _ = err.await;
        instances::record_play(&instance_id, started.elapsed().as_secs());
        let ended = app.state::<Games>().running.lock().unwrap().remove(&run_id);
        app.state::<Live>().set_playing(None);
        let code = status.and_then(|s| s.code());
        let crash = (!stopped && code != Some(0)).then(|| {
            let log = tail.lock().unwrap().iter().cloned().collect::<Vec<String>>().join("\n");
            let report_path = crash::report_path(&log);
            let report = report_path.as_ref().and_then(|p| std::fs::read_to_string(p).ok()).unwrap_or_default();
            let mut crash = crash::analyze(&log, report_path, &report);
            let payload = report::build(&instance_id, &crash, &log, &report, &player, Some(&player_uuid));
            crash.auto = report::enabled();
            if crash.auto {
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = report::send(&payload).await {
                        crate::engine::core::crashlog::write("crash-report", &e);
                    }
                });
            } else {
                app.state::<Reports>().keep(&instance_id, payload);
            }
            crash
        });
        let _ = app.emit("game-exit", ExitEvent { run_id, instance_id, code, crash });
        let switch = app.state::<Games>().switching.lock().unwrap().remove(&run_id);
        if let (Some(switch), Some(ended)) = (switch, ended) {
            let jobs = app.state::<Jobs>();
            if let Err(e) = start(&app, &jobs, ended.instance_id, switch.name, switch.id, ended.restart) {
                let _ = app.emit("game-switch-failed", e);
            }
        }
    });
    Ok(())
}

fn mod_jars(dir: &Path) -> std::collections::BTreeSet<String> {
    std::fs::read_dir(dir)
        .map(|entries| {
            entries
                .flatten()
                .map(|e| e.file_name().to_string_lossy().into_owned())
                .filter(|n| n.ends_with(".jar") && n != crate::engine::content::BUILT_IN_CLIENT)
                .collect()
        })
        .unwrap_or_default()
}

async fn watch_mods<R: Runtime>(app: AppHandle<R>, run_id: u64, instance_id: String) {
    let Ok(dir) = instances::game_dir(&instance_id).map(|d| d.join("mods")) else { return };
    let start = mod_jars(&dir);
    let mut last = start.clone();
    loop {
        tokio::time::sleep(std::time::Duration::from_secs(3)).await;
        if !app.state::<Games>().running.lock().unwrap().contains_key(&run_id) {
            return;
        }
        let now = mod_jars(&dir);
        if now == last {
            continue;
        }
        let removed: Vec<&String> = start.difference(&now).collect();
        let added: Vec<&String> = now.difference(&start).collect();
        let _ = app.emit("game-mods-changed", serde_json::json!({ "runId": run_id, "instanceId": instance_id, "removed": removed, "added": added }));
        last = now;
    }
}

const TAIL_LINES: usize = 3000;

const PRESENCE_LOGGER: &str = "kromvia-presence";

fn switch_account<R: Runtime>(app: &AppHandle<R>, run_id: u64, who: &serde_json::Value) {
    let name = who["name"].as_str().unwrap_or_default().to_string();
    let id = who["id"].as_str().map(String::from);
    let games = app.state::<Games>();
    let allowed = match &id {
        Some(id) => accounts::list().iter().any(|a| &a.id == id && a.name == name),
        None => games.running.lock().unwrap().get(&run_id).is_some_and(|r| r.offline.as_deref() == Some(name.as_str())),
    };
    if allowed {
        let _ = accounts::set_active(id.as_deref());
        let _ = app.emit("account-switched", serde_json::json!({ "id": id, "name": name }));
        games.switching.lock().unwrap().insert(run_id, Switch { id, name });
        games.stop(run_id);
    }
}

const ONBOARDING_MODS: [&str; 5] = ["appleskin", "lambdynamiclights", "3dskinlayers", "wavey-capes", "bettergrassify"];

fn install_onboarding<R: Runtime>(app: &AppHandle<R>, run_id: u64, wanted: &[serde_json::Value]) {
    let slugs: Vec<&'static str> = ONBOARDING_MODS.into_iter().filter(|m| wanted.iter().any(|w| w.as_str() == Some(m))).collect();
    let Some((instance_id, stdin)) = app.state::<Games>().running.lock().unwrap().get(&run_id).map(|r| (r.instance_id.clone(), r.stdin.clone())) else {
        return;
    };
    if slugs.is_empty() {
        return;
    }
    let jobs = app.state::<Jobs>();
    let _ = jobs.spawn(app, format!("onboarding-{instance_id}"), move |job| async move {
        let mut failed = Vec::new();
        for slug in &slugs {
            if let Err(e) = modrinth::install(&instance_id, slug, None, ContentKind::Mod, &job).await {
                failed.push(format!("{slug}: {e}"));
            }
        }
        let text = if failed.is_empty() { "Restart the game to load them.".to_string() } else { format!("Some failed: {}", failed.join("; ")) };
        let _ = stdin.send(serde_json::json!({ "toast": { "title": "Mods installed", "text": text } }).to_string() + "\n");
        Ok(())
    });
}

fn share_screenshot<R: Runtime>(app: &AppHandle<R>, run_id: u64, name: String) {
    let Some((instance_id, stdin)) = app.state::<Games>().running.lock().unwrap().get(&run_id).map(|r| (r.instance_id.clone(), r.stdin.clone())) else {
        return;
    };
    tauri::async_runtime::spawn(async move {
        let link = match crate::engine::worlds::screenshot_path(&instance_id, &name) {
            Ok(path) => crate::engine::social::share_screenshot(&path).await.map(|code| format!("{}/share/{code}", crate::engine::social::base())),
            Err(e) => Err(e),
        };
        let answer = match link {
            Ok(url) => serde_json::json!({ "shared": { "url": url } }),
            Err(e) => serde_json::json!({ "shared": { "error": e } }),
        };
        let _ = stdin.send(answer.to_string() + "\n");
    });
}

fn send_latest_screenshot<R: Runtime>(app: &AppHandle<R>, run_id: u64, to: String) {
    let Some((instance_id, stdin)) = app.state::<Games>().running.lock().unwrap().get(&run_id).map(|r| (r.instance_id.clone(), r.stdin.clone())) else {
        return;
    };
    let app = app.clone();
    tauri::async_runtime::spawn(async move {
        let link = match crate::engine::worlds::list_screenshots(&instance_id).ok().and_then(|l| l.into_iter().next()) {
            Some(shot) => crate::engine::social::share_screenshot(std::path::Path::new(&shot.path)).await.map(|code| format!("{}/share/{code}", crate::engine::social::base())),
            None => Err("no screenshots yet, press F2 first".into()),
        };
        match link {
            Ok(url) => {
                let _ = app.emit("game-social", serde_json::json!({ "do": "send", "to": to, "text": url }));
            }
            Err(e) => {
                let _ = stdin.send(serde_json::json!({ "toast": { "title": "Could not send", "text": e } }).to_string() + "\n");
            }
        }
    });
}

fn discord_screenshot<R: Runtime>(app: &AppHandle<R>, run_id: u64, name: String) {
    let Some((instance_id, stdin)) = app.state::<Games>().running.lock().unwrap().get(&run_id).map(|r| (r.instance_id.clone(), r.stdin.clone())) else {
        return;
    };
    tauri::async_runtime::spawn_blocking(move || {
        let done = crate::engine::worlds::screenshot_path(&instance_id, &name).and_then(|p| crate::engine::discord::screenshot_to_discord(&p));
        let toast = match done {
            Ok(()) => serde_json::json!({ "toast": { "title": "Screenshot copied", "text": "Paste it in Discord with Ctrl+V." } }),
            Err(e) => serde_json::json!({ "toast": { "title": "Could not copy", "text": e } }),
        };
        let _ = stdin.send(toast.to_string() + "\n");
    });
}

fn playing<R: Runtime>(app: &AppHandle<R>, run_id: u64, text: &str) {
    let v: serde_json::Value = serde_json::from_str(text).unwrap_or_default();
    if v["switch"].is_object() {
        switch_account(app, run_id, &v["switch"]);
        return;
    }
    if v["social"]["do"] == "shot" {
        send_latest_screenshot(app, run_id, v["social"]["to"].as_str().unwrap_or_default().to_string());
        return;
    }
    if v["social"].is_object() {
        let _ = app.emit("game-social", &v["social"]);
        return;
    }
    if v["wardrobe"].as_bool() == Some(true) {
        if let Some(w) = crate::engine::wardrobe::load() {
            let _ = app.emit("wardrobe-changed", w);
        }
        return;
    }
    if let Some(name) = v["discord_screenshot"].as_str() {
        discord_screenshot(app, run_id, name.to_string());
        return;
    }
    if let Some(name) = v["share_screenshot"].as_str() {
        share_screenshot(app, run_id, name.to_string());
        return;
    }
    if let Some(action) = v["media"].as_str() {
        let action = action.to_string();
        let value = v["value"].clone();
        tauri::async_runtime::spawn(async move { crate::engine::media::control(&action, &value).await });
        return;
    }
    if let Some(wanted) = v["install"].as_array() {
        install_onboarding(app, run_id, wanted);
        return;
    }
    if v["lookup"].is_array() {
        let _ = app.state::<Live>().send(serde_json::json!({ "type": "lookup", "names": v["lookup"] }));
        return;
    }
    let at = v["host"].as_str().zip(v["nick"].as_str());
    app.state::<Live>().set_playing(at);
    let _ = app.emit("game-server", serde_json::json!({ "runId": run_id, "host": at.map(|a| a.0) }));
}

fn room_domain(text: &str) -> Option<&str> {
    text.strip_prefix("Domain assigned: ")?.split_whitespace().next().filter(|d| valid_address(d))
}

fn scene_of(text: &str) -> Option<&'static str> {
    if text.starts_with("Starting integrated minecraft server") {
        Some("singleplayer")
    } else if text.starts_with("Domain assigned: ") {
        Some("room")
    } else if text == "Stopping server" {
        Some("menu")
    } else {
        None
    }
}

async fn pump<R: Runtime>(app: AppHandle<R>, run_id: u64, nick: String, stream: impl AsyncRead + Unpin, tail: Arc<Mutex<VecDeque<String>>>) {
    let mut lines = BufReader::new(stream).lines();
    let mut parser = LogParser::default();
    while let Ok(Some(line)) = lines.next_line().await {
        if let Some(line) = parser.push(&line) {
            {
                let mut tail = tail.lock().unwrap();
                if tail.len() == TAIL_LINES {
                    tail.pop_front();
                }
                tail.push_back(line.text.clone());
            }
            if line.logger == PRESENCE_LOGGER {
                playing(&app, run_id, &line.text);
            } else if let Some(scene) = scene_of(&line.text) {
                match scene {
                    "room" => app.state::<Live>().set_playing(room_domain(&line.text).map(|d| (d, nick.as_str()))),
                    "menu" => app.state::<Live>().set_playing(None),
                    _ => {}
                }
                let _ = app.emit("game-scene", serde_json::json!({ "runId": run_id, "scene": scene }));
            }
            let _ = app.emit("game-log", LogEvent { run_id, line: &line });
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn offline_uuid_matches_vanilla() {
        assert_eq!(offline_uuid("Notch"), "b50ad385-829d-3141-a216-7e7d7539ba7f");
    }

    #[test]
    fn injects_client_only_where_it_fits() {
        let jar = Some(PathBuf::from("/r/kromvia-client.jar"));
        let mut inst = instances::Instance {
            id: "x".into(),
            name: "x".into(),
            mc_version: "26.3".into(),
            loader: Some(loaders::Loader { kind: LoaderKind::Fabric, version: "0.19.5".into() }),
            memory_mb: None,
            java_path: None,
            jvm_args: None,
            resolution: None,
            created: 0,
            gpu: None,
            group: None,
            icon: None,
            no_client: false,
        };
        assert_eq!(client_flag(&inst, jar.clone()).as_deref(), Some("-Dfabric.addMods=/r/kromvia-client.jar"));
        inst.no_client = true;
        assert_eq!(client_flag(&inst, jar.clone()), None);
        inst.no_client = false;
        assert_eq!(client_flag(&inst, None), None);
        inst.loader = Some(loaders::Loader { kind: LoaderKind::Quilt, version: "0.29.0".into() });
        assert_eq!(client_flag(&inst, jar).as_deref(), Some("-Dloader.addMods=/r/kromvia-client.jar"));
    }

    #[test]
    fn validates_addresses() {
        assert!(valid_address("abc-def.relay.e4mc.link"));
        assert_eq!(room_domain("Domain assigned: abc-def.relay.e4mc.link"), Some("abc-def.relay.e4mc.link"));
        assert_eq!(room_domain("Stopping server"), None);
        assert!(valid_address("mc.hypixel.net:25565"));
        assert!(!valid_address("--demo"));
        assert!(!valid_address("a b"));
        assert!(!valid_address(""));
    }

    #[test]
    fn validates_usernames() {
        assert!(valid_username("Steve_123"));
        assert!(!valid_username("ab"));
        assert!(!valid_username("bad name"));
        assert!(!valid_username("--quickPlay"));
    }

    fn vars() -> HashMap<&'static str, String> {
        HashMap::from([("classpath", "a.jar".to_string()), ("auth_player_name", "Steve".to_string()), ("natives_directory", "/n".to_string())])
    }

    #[test]
    fn builds_modern_args() {
        let v: VersionJson = serde_json::from_str(
            r#"{"id":"1.21","mainClass":"Main","arguments":{"jvm":["-cp","${classpath}"],"game":["--username","${auth_player_name}"]}}"#,
        )
        .unwrap();
        assert_eq!(build_args(&v, &vars(), vec!["-Xmx2G".into()]), ["-Xmx2G", "-cp", "a.jar", "Main", "--username", "Steve"]);
    }

    #[test]
    fn builds_legacy_args_with_fabric_jvm() {
        let v: VersionJson = serde_json::from_str(
            r#"{"id":"fabric-1.12","mainClass":"Knot","minecraftArguments":"--username ${auth_player_name}",
                "arguments":{"jvm":["-DFabricMcEmu=x"],"game":[]}}"#,
        )
        .unwrap();
        assert_eq!(
            build_args(&v, &vars(), vec![]),
            ["-Djava.library.path=/n", "-cp", "a.jar", "-DFabricMcEmu=x", "Knot", "--username", "Steve"]
        );
    }
}

#[cfg(test)]
mod install_tests {
    use super::*;
    use crate::engine::core::jobs::Jobs;
    use crate::engine::game::loaders::{self, Loader, LoaderKind};

    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn prepares_real_versions() {
        let root = std::env::var("KROMVIA_TEST_ROOT").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir().join("kromvia-it"));
        paths::init(root);
        let app = tauri::test::mock_builder()
            .manage(Jobs::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        let mut cases: Vec<(&str, Option<Loader>)> = vec![("1.8.9", None), ("b1.7.3", None), ("26.4-snapshot-5", None)];
        for (kind, mc) in [
            (LoaderKind::Fabric, "1.21.4"),
            (LoaderKind::Quilt, "1.21.4"),
            (LoaderKind::LegacyFabric, "1.8.9"),
            (LoaderKind::Ornithe, "1.8.9"),
            (LoaderKind::NeoForge, "1.20.1"),
            (LoaderKind::Forge, "1.20.1"),
            (LoaderKind::Forge, "1.12.2"),
            (LoaderKind::Forge, "1.7.10"),
            (LoaderKind::NeoForge, "1.21.1"),
        ] {
            let all = loaders::versions(kind, mc).await.unwrap();
            let v = all.iter().find(|l| l.stable).or(all.first()).unwrap().version.clone();
            cases.push((mc, Some(Loader { kind, version: v })));
        }
        if let Ok(only) = std::env::var("KROMVIA_TEST_ONLY") {
            cases.retain(|(mc, l)| only == format!("{mc}{}", l.as_ref().map(|l| format!("-{:?}", l.kind)).unwrap_or_default()));
        }

        for (mc, loader) in cases {
            let label = format!("{mc}{}", loader.as_ref().map(|l| format!(" {:?} {}", l.kind, l.version)).unwrap_or_default());
            let inst = instances::list()
                .into_iter()
                .find(|i| i.mc_version == mc && i.loader == loader)
                .unwrap_or_else(|| instances::create(&format!("it {label}"), mc, loader.clone()).unwrap());
            let (tx, rx) = oneshot::channel();
            let tx = Mutex::new(Some(tx));
            app.state::<Jobs>()
                .spawn(app.handle(), format!("it-{label}"), move |job| async move {
                    let p = prepare(&inst, &offline_session("Steve").unwrap(), &job).await;
                    let _ = tx.lock().unwrap().take().unwrap().send(p);
                    Ok(())
                })
                .unwrap();
            let p = rx.await.unwrap().unwrap_or_else(|e| panic!("{label}: {e}"));

            let cp = &p.args[p.args.iter().position(|a| a == "-cp").unwrap() + 1];
            let sep = if cfg!(windows) { ';' } else { ':' };
            for entry in cp.split(sep) {
                assert!(Path::new(entry).is_file(), "{label}: missing {entry}");
            }
            assert!(!p.args.iter().any(|a| a.contains("${")), "{label}: unsubstituted {:?}", p.args);

            let jvm: Vec<&String> = p.args.iter().take_while(|a| *a != "-cp").collect();
            let out = std::process::Command::new(&p.java).args(&jvm).arg("-version").output().unwrap();
            assert!(out.status.success(), "{label}: {}", String::from_utf8_lossy(&out.stderr));
            println!("OK {label}: {} classpath entries, java {}", cp.split(sep).count(), p.java.display());
        }
    }
}

#[cfg(test)]
mod repair_tests {
    use super::*;
    use crate::engine::core::jobs::Jobs;

    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn repairs_broken_files() {
        let root = std::env::var("KROMVIA_TEST_ROOT").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir().join("kromvia-it"));
        paths::init(root);
        let app = tauri::test::mock_builder()
            .manage(Jobs::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();
        for (mc, quick) in [("1.21.4", true), ("1.16.5", false)] {
            let inst = instances::list()
                .into_iter()
                .find(|i| i.mc_version == mc && i.loader.is_none())
                .unwrap_or_else(|| instances::create(&format!("it {mc}"), mc, None).unwrap());
            let (tx, rx) = oneshot::channel();
            let tx = Mutex::new(Some(tx));
            let inst2 = inst.clone();
            app.state::<Jobs>()
                .spawn(app.handle(), format!("it-repair-{mc}"), move |job| async move {
                    let r = async {
                        let (version, _, _) = resolve(&inst2, &job).await?;
                        assert_eq!(supports_quick_play(&version), quick, "{mc}");
                        install::ensure_files(&inst2.mc_version, &version, &instances::game_dir(&inst2.id)?, &job).await?;
                        let lib = version.libraries.iter().filter(|l| rules_allow(&l.rules)).filter_map(|l| l.artifact()?.path).next().unwrap();
                        let lib = paths::libraries().join(lib);
                        let asset = version.asset_index.as_ref().unwrap();
                        let index: serde_json::Value = serde_json::from_slice(&std::fs::read(paths::assets().join(format!("indexes/{}.json", asset.id))).unwrap()).unwrap();
                        let hash = index["objects"].as_object().unwrap().values().next().unwrap()["hash"].as_str().unwrap().to_string();
                        let obj = paths::assets().join("objects").join(&hash[..2]).join(&hash);
                        for f in [&lib, &obj] {
                            let mut bytes = std::fs::read(f).unwrap();
                            bytes[0] ^= 0xff;
                            std::fs::write(f, bytes).unwrap();
                        }
                        let broken = repair(&inst2, &job).await?;
                        assert!(broken >= 2, "{mc}: found {broken}");
                        assert_eq!(crate::engine::core::http::sha1_file(&obj)?, hash);
                        assert_eq!(repair(&inst2, &job).await?, 0, "{mc}: still broken after repair");
                        println!("OK {mc}: {broken} broken files repaired");
                        Ok::<(), String>(())
                    }
                    .await;
                    let _ = tx.lock().unwrap().take().unwrap().send(r);
                    Ok(())
                })
                .unwrap();
            rx.await.unwrap().unwrap();
        }
    }
}

#[cfg(test)]
mod window_tests {
    use super::*;
    use crate::engine::core::jobs::Jobs;
    use crate::engine::game::loaders::{self, Loader};

    #[tokio::test(flavor = "multi_thread")]
    #[ignore]
    async fn opens_client_window() {
        let root = std::env::var("KROMVIA_TEST_ROOT").map(PathBuf::from).unwrap_or_else(|_| std::env::temp_dir().join("kromvia-it"));
        paths::init(root.clone());
        paths::init_resources(PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources"));
        let mc = std::env::var("KROMVIA_TEST_MC").unwrap_or_else(|_| "1.21.11".into());
        let kind = match std::env::var("KROMVIA_TEST_LOADER").as_deref() {
            Ok("forge") => LoaderKind::Forge,
            Ok("neoforge") => LoaderKind::NeoForge,
            Ok("quilt") => LoaderKind::Quilt,
            _ => LoaderKind::Fabric,
        };
        let jar = match kind {
            LoaderKind::Forge => paths::forge_client_jar(&mc, "forge"),
            LoaderKind::NeoForge => paths::forge_client_jar(&mc, "neoforge"),
            _ => paths::client_jar(&mc),
        };
        assert!(jar.is_some(), "build the client jar first");
        let app = tauri::test::mock_builder()
            .manage(Jobs::default())
            .build(tauri::test::mock_context(tauri::test::noop_assets()))
            .unwrap();

        let all = loaders::versions(kind, &mc).await.unwrap();
        let loader = all.iter().find(|l| l.stable).or(all.first()).unwrap().clone();
        let loader = Some(Loader { kind, version: loader.version });
        let inst = instances::list()
            .into_iter()
            .find(|i| i.mc_version == mc && i.loader == loader && i.name == "client window")
            .unwrap_or_else(|| instances::create("client window", &mc, loader).unwrap());
        let (tx, rx) = oneshot::channel();
        let tx = Mutex::new(Some(tx));
        app.state::<Jobs>()
            .spawn(app.handle(), "it-window".into(), move |job| async move {
                let p = prepare(&inst, &offline_session("Steve").unwrap(), &job).await;
                let _ = tx.lock().unwrap().take().unwrap().send(p);
                Ok(())
            })
            .unwrap();
        let p = rx.await.unwrap().unwrap();
        let log = std::fs::File::create(root.join("client-run.log")).unwrap();
        let mut child = std::process::Command::new(&p.java)
            .args(&p.args)
            .current_dir(&p.game_dir)
            .env("KROMVIA_AUDIT_MIXINS", "1")
            .stdout(log.try_clone().unwrap())
            .stderr(log)
            .spawn()
            .unwrap();
        println!("started pid {} in {}", child.id(), p.game_dir.display());
        println!("exited: {}", child.wait().unwrap());
    }
}
