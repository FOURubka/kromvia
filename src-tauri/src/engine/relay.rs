use std::io::Read;
use std::path::PathBuf;
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::OnceLock;
use std::time::Duration;

use futures_util::StreamExt;
use reqwest::{Client, Method};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Emitter, Runtime};
use tokio::io::AsyncWriteExt;

use crate::engine::core::paths;
use crate::engine::{instances, social, worlds};

const HEARTBEAT: Duration = Duration::from_secs(120);
const MARKER: &str = "kromvia-relay.json";

#[derive(Serialize, Deserialize, Clone, Debug, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Held {
    pub id: String,
    pub instance: String,
    pub folder: String,
}

fn client() -> &'static Client {
    static CLIENT: OnceLock<Client> = OnceLock::new();
    CLIENT.get_or_init(|| {
        Client::builder()
            .user_agent(concat!("Kromvia/", env!("CARGO_PKG_VERSION")))
            .connect_timeout(Duration::from_secs(15))
            .timeout(Duration::from_secs(30 * 60))
            .build()
            .expect("failed to build HTTP client")
    })
}

fn check(id: &str) -> Result<&str, String> {
    if id.len() == 12 && id.bytes().all(|b| b.is_ascii_lowercase() || b.is_ascii_digit()) {
        Ok(id)
    } else {
        Err("bad shared world id".into())
    }
}

pub fn folder(id: &str) -> String {
    format!("relay-{id}")
}

fn held_path() -> PathBuf {
    paths::root().join("relay-held.json")
}

fn cache(id: &str) -> PathBuf {
    paths::root().join("relay-cache").join(format!("{id}.zip"))
}

pub fn held() -> Option<Held> {
    serde_json::from_slice(&std::fs::read(held_path()).ok()?).ok()
}

fn set_held(h: Option<&Held>) -> Result<(), String> {
    match h {
        Some(h) => {
            std::fs::create_dir_all(paths::root()).map_err(|e| e.to_string())?;
            std::fs::write(held_path(), serde_json::to_vec(h).unwrap()).map_err(|e| e.to_string())
        }
        None => match std::fs::remove_file(held_path()) {
            Err(e) if e.kind() != std::io::ErrorKind::NotFound => Err(e.to_string()),
            _ => Ok(()),
        },
    }
}

fn local_version(dir: &std::path::Path, id: &str) -> u64 {
    let Ok(bytes) = std::fs::read(dir.join(MARKER)) else { return 0 };
    let v: Value = serde_json::from_slice(&bytes).unwrap_or_default();
    if v["id"] == id { v["version"].as_u64().unwrap_or(0) } else { 0 }
}

async fn raw(method: Method, path: &str, body: Vec<u8>) -> Result<reqwest::Response, String> {
    let mut req = client().request(method.clone(), format!("{}{path}", social::base()));
    for (name, value) in social::signed(method.as_str(), path, &body)? {
        req = req.header(name, value);
    }
    if !body.is_empty() {
        req = req.header("content-type", "application/octet-stream").body(body);
    }
    let resp = req.send().await.map_err(|e| format!("Kromvia servers are unreachable: {e}"))?;
    if resp.status().is_success() {
        return Ok(resp);
    }
    let v: Value = resp.json().await.unwrap_or_default();
    Err(v["error"].as_str().unwrap_or("request failed").to_string())
}

fn progress<R: Runtime>(app: &AppHandle<R>, id: &str, stage: &str, done: u64, total: u64) {
    let _ = app.emit("relay-progress", json!({ "id": id, "stage": stage, "done": done, "total": total }));
}

pub async fn list() -> Result<Value, String> {
    social::send(Method::GET, "/v1/relays", None).await
}

pub async fn delete(id: &str) -> Result<Value, String> {
    let id = check(id)?;
    if held().is_some_and(|h| h.id == id) {
        set_held(None)?;
    }
    social::send(Method::DELETE, &format!("/v1/relays/{id}"), None).await
}

pub async fn add_member(id: &str, friend: &str) -> Result<Value, String> {
    social::send(Method::POST, &format!("/v1/relays/{}/members", check(id)?), Some(json!({ "id": friend }))).await
}

pub async fn remove_member(id: &str, account: &str) -> Result<Value, String> {
    if account.is_empty() || !account.bytes().all(|b| b.is_ascii_hexdigit() || b == b'-') {
        return Err("bad account id".into());
    }
    social::send(Method::DELETE, &format!("/v1/relays/{}/members/{account}", check(id)?), None).await
}

static BEAT: AtomicU64 = AtomicU64::new(0);

fn heartbeat<R: Runtime>(app: AppHandle<R>, id: String) {
    let gen = BEAT.fetch_add(1, Ordering::SeqCst) + 1;
    tauri::async_runtime::spawn(async move {
        loop {
            tokio::time::sleep(HEARTBEAT).await;
            if BEAT.load(Ordering::SeqCst) != gen || held().is_none_or(|h| h.id != id) {
                return;
            }
            if let Err(e) = social::send(Method::POST, &format!("/v1/relays/{id}/lock"), None).await {
                if e.contains("playing it") {
                    let _ = app.emit("relay-sync", json!({ "id": id, "ok": false, "error": e }));
                    return;
                }
            }
        }
    });
}

/// Locks the shared world, brings the newest copy into the instance and returns its folder in `saves/`.
pub async fn take<R: Runtime>(app: &AppHandle<R>, id: &str, instance: &str) -> Result<String, String> {
    let id = check(id)?.to_string();
    if let Some(h) = held().filter(|h| h.id != id) {
        return Err(format!("put the other shared world back first ({})", h.folder));
    }
    let saves = instances::game_dir(instance)?.join("saves");
    let state = social::send(Method::POST, &format!("/v1/relays/{id}/lock"), None).await?;
    let version = state["version"].as_u64().unwrap_or(0);
    let name = folder(&id);
    let dir = saves.join(&name);
    let result = async {
        if version == 0 {
            return Err("nobody has uploaded this world yet".to_string());
        }
        if local_version(&dir, &id) != version {
            download(app, &id, state["size"].as_u64().unwrap_or(0), state["sha256"].as_str().unwrap_or("")).await?;
            let zip = cache(&id);
            let (saves, name) = (saves.clone(), name.clone());
            tauri::async_runtime::spawn_blocking(move || unpack(&zip, &saves, &name)).await.map_err(|e| e.to_string())??;
            std::fs::write(dir.join(MARKER), json!({ "id": id, "version": version }).to_string()).map_err(|e| e.to_string())?;
        }
        Ok(())
    }
    .await;
    if let Err(e) = result {
        let _ = social::send(Method::DELETE, &format!("/v1/relays/{id}/lock"), None).await;
        return Err(e);
    }
    set_held(Some(&Held { id: id.clone(), instance: instance.to_string(), folder: name.clone() }))?;
    heartbeat(app.clone(), id);
    Ok(name)
}

async fn download<R: Runtime>(app: &AppHandle<R>, id: &str, total: u64, sha: &str) -> Result<(), String> {
    let path = cache(id);
    std::fs::create_dir_all(path.parent().unwrap()).map_err(|e| e.to_string())?;
    let resp = raw(Method::GET, &format!("/v1/relays/{id}/world"), Vec::new()).await?;
    let part = path.with_extension("zip.part");
    let mut file = tokio::fs::File::create(&part).await.map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut done = 0u64;
    let mut stream = resp.bytes_stream();
    while let Some(chunk) = stream.next().await {
        let chunk = chunk.map_err(|e| format!("download broke off: {e}"))?;
        hash.update(&chunk);
        file.write_all(&chunk).await.map_err(|e| e.to_string())?;
        done += chunk.len() as u64;
        progress(app, id, "download", done, total);
    }
    file.flush().await.map_err(|e| e.to_string())?;
    drop(file);
    let got: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
    if !sha.is_empty() && got != sha {
        let _ = std::fs::remove_file(&part);
        return Err("the downloaded world is damaged, try again".into());
    }
    std::fs::rename(&part, &path).map_err(|e| e.to_string())
}

fn unpack(zip: &std::path::Path, saves: &std::path::Path, name: &str) -> Result<(), String> {
    let mut archive = zip::ZipArchive::new(std::fs::File::open(zip).map_err(|e| e.to_string())?).map_err(|e| e.to_string())?;
    let root = worlds::zip_world_root(&mut archive).ok_or("the shared world has no level.dat")?;
    let staging = saves.join(format!(".{name}.new"));
    let _ = std::fs::remove_dir_all(&staging);
    std::fs::create_dir_all(&staging).map_err(|e| e.to_string())?;
    archive.extract(&staging).map_err(|e| e.to_string())?;
    let target = saves.join(name);
    let old = saves.join(format!(".{name}.old"));
    let _ = std::fs::remove_dir_all(&old);
    if target.exists() {
        std::fs::rename(&target, &old).map_err(|e| e.to_string())?;
    }
    std::fs::rename(staging.join(root.trim_end_matches('/')), &target).map_err(|e| e.to_string())?;
    let _ = std::fs::remove_dir_all(&staging);
    let _ = std::fs::remove_dir_all(&old);
    Ok(())
}

/// Zips the held world, uploads it as the new version and frees the lock.
pub async fn put_back<R: Runtime>(app: &AppHandle<R>) -> Result<Value, String> {
    let h = held().ok_or("you are not holding a shared world")?;
    let id = check(&h.id)?.to_string();
    let zip = cache(&id);
    std::fs::create_dir_all(zip.parent().unwrap()).map_err(|e| e.to_string())?;
    let (inst, fold, dest) = (h.instance.clone(), h.folder.clone(), zip.clone());
    tauri::async_runtime::spawn_blocking(move || worlds::export(&inst, &fold, &dest)).await.map_err(|e| e.to_string())??;
    let size = std::fs::metadata(&zip).map_err(|e| e.to_string())?.len();
    let start = social::send(Method::POST, &format!("/v1/relays/{id}/upload"), Some(json!({ "size": size }))).await;
    let start = match start {
        Ok(v) => v,
        Err(e) if e.contains("take the world") => {
            set_held(None)?;
            return Err(format!("someone else took the world while you were away; your copy stays in {}", h.folder));
        }
        Err(e) => return Err(e),
    };
    let part_size = start["partSize"].as_u64().ok_or("bad answer from the server")?;
    let parts = start["parts"].as_u64().ok_or("bad answer from the server")?;
    let mut file = std::fs::File::open(&zip).map_err(|e| e.to_string())?;
    let mut hash = Sha256::new();
    let mut etags = Vec::new();
    for n in 1..=parts {
        let mut buf = vec![0u8; part_size.min(size - (n - 1) * part_size) as usize];
        file.read_exact(&mut buf).map_err(|e| e.to_string())?;
        hash.update(&buf);
        let mut tries = 0;
        let resp = loop {
            match raw(Method::PUT, &format!("/v1/relays/{id}/upload/{n}"), buf.clone()).await {
                Ok(r) => break r,
                Err(e) if tries < 2 && e.contains("unreachable") => tries += 1,
                Err(e) => return Err(e),
            }
        };
        let v: Value = resp.json().await.map_err(|e| e.to_string())?;
        etags.push(v["etag"].as_str().ok_or("bad answer from the server")?.to_string());
        progress(app, &id, "upload", (n * part_size).min(size), size);
    }
    let sha: String = hash.finalize().iter().map(|b| format!("{b:02x}")).collect();
    let done = social::send(Method::POST, &format!("/v1/relays/{id}/upload/complete"), Some(json!({ "etags": etags, "sha256": sha }))).await?;
    if h.folder == folder(&id) {
        if let Ok(dir) = worlds::world_dir(&h.instance, &h.folder) {
            let _ = std::fs::write(dir.join(MARKER), json!({ "id": id, "version": done["version"] }).to_string());
        }
    }
    set_held(None)?;
    BEAT.fetch_add(1, Ordering::SeqCst);
    Ok(done)
}

/// Gives the lock back without uploading. Local changes since taking it are not shared.
pub async fn release(id: &str) -> Result<(), String> {
    let id = check(id)?;
    social::send(Method::DELETE, &format!("/v1/relays/{id}/lock"), None).await?;
    if held().is_some_and(|h| h.id == id) {
        set_held(None)?;
    }
    BEAT.fetch_add(1, Ordering::SeqCst);
    Ok(())
}

/// Creates a shared world from one of the instance's own worlds and uploads it as the first version.
pub async fn create<R: Runtime>(app: &AppHandle<R>, instance: &str, world: &str, name: &str) -> Result<Value, String> {
    worlds::world_dir(instance, world)?;
    if let Some(h) = held() {
        return Err(format!("put the other shared world back first ({})", h.folder));
    }
    let made = social::send(Method::POST, "/v1/relays", Some(json!({ "name": name }))).await?;
    let id = made["id"].as_str().ok_or("bad answer from the server")?.to_string();
    let result = async {
        social::send(Method::POST, &format!("/v1/relays/{id}/lock"), None).await?;
        set_held(Some(&Held { id: id.clone(), instance: instance.to_string(), folder: world.to_string() }))?;
        put_back(app).await
    }
    .await;
    if result.is_err() {
        let _ = set_held(None);
        let _ = social::send(Method::DELETE, &format!("/v1/relays/{id}"), None).await;
    }
    result
}

/// Called when a game exits: if it was playing the held shared world, upload it.
pub fn on_exit<R: Runtime>(app: AppHandle<R>, instance: &str) {
    if held().is_none_or(|h| h.instance != instance) {
        return;
    }
    tauri::async_runtime::spawn(async move {
        let id = held().map(|h| h.id).unwrap_or_default();
        let res = put_back(&app).await;
        let _ = app.emit("relay-sync", json!({ "id": id, "ok": res.is_ok(), "error": res.err() }));
    });
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn ids_and_markers() {
        assert!(check("abc123def456").is_ok());
        assert!(check("ABC123def456").is_err());
        assert!(check("abc/../def45").is_err());
        let dir = std::env::temp_dir().join(format!("kromvia-relay-test-{}", std::process::id()));
        std::fs::create_dir_all(&dir).unwrap();
        assert_eq!(local_version(&dir, "abc123def456"), 0);
        std::fs::write(dir.join(MARKER), r#"{"id":"abc123def456","version":4}"#).unwrap();
        assert_eq!(local_version(&dir, "abc123def456"), 4);
        assert_eq!(local_version(&dir, "zzz123def456"), 0);
        std::fs::remove_dir_all(&dir).unwrap();
    }

    #[test]
    fn unpack_replaces_the_old_copy() {
        let base = std::env::temp_dir().join(format!("kromvia-relay-unpack-{}", std::process::id()));
        let saves = base.join("saves");
        std::fs::create_dir_all(saves.join("relay-x").join("region")).unwrap();
        std::fs::write(saves.join("relay-x").join("stale.txt"), "old").unwrap();
        let zip_path = base.join("w.zip");
        {
            let mut z = zip::ZipWriter::new(std::fs::File::create(&zip_path).unwrap());
            let o = zip::write::SimpleFileOptions::default();
            z.start_file("My World/level.dat", o).unwrap();
            std::io::Write::write_all(&mut z, b"dat").unwrap();
            z.start_file("My World/region/r.0.0.mca", o).unwrap();
            std::io::Write::write_all(&mut z, b"mca").unwrap();
            z.finish().unwrap();
        }
        unpack(&zip_path, &saves, "relay-x").unwrap();
        assert_eq!(std::fs::read(saves.join("relay-x/level.dat")).unwrap(), b"dat");
        assert!(saves.join("relay-x/region/r.0.0.mca").is_file());
        assert!(!saves.join("relay-x/stale.txt").exists());
        assert_eq!(std::fs::read_dir(&saves).unwrap().count(), 1);
        std::fs::remove_dir_all(&base).unwrap();
    }
}
