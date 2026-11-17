
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use base64::engine::general_purpose::URL_SAFE_NO_PAD;
use base64::Engine;
use ed25519_dalek::{Signer, SigningKey};
use futures_util::{SinkExt, StreamExt};
use reqwest::Method;
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tokio::sync::mpsc::{unbounded_channel, UnboundedReceiver, UnboundedSender};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::client::IntoClientRequest;
use tokio_tungstenite::tungstenite::{Error as WsError, Message};

use crate::engine::core::{http, paths};

const API: &str = "https://api.kromvia.com";

pub fn base() -> String {
    std::env::var("KROMVIA_API").ok().filter(|s| !s.is_empty()).unwrap_or_else(|| API.into())
}

fn key_path() -> PathBuf {
    paths::root().join("device-key")
}

static KEY_LOCK: Mutex<()> = Mutex::new(());

fn device_key() -> Result<SigningKey, String> {
    let _guard = KEY_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let path = key_path();
    if let Ok(bytes) = std::fs::read(&path) {
        let seed: [u8; 32] = bytes.try_into().map_err(|_| format!("{} is damaged", path.display()))?;
        return Ok(SigningKey::from_bytes(&seed));
    }
    let mut seed = [0u8; 32];
    getrandom::fill(&mut seed).map_err(|e| e.to_string())?;
    std::fs::create_dir_all(paths::root()).map_err(|e| e.to_string())?;
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, seed).map_err(|e| e.to_string())?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        std::fs::set_permissions(&tmp, std::fs::Permissions::from_mode(0o600)).map_err(|e| e.to_string())?;
    }
    std::fs::rename(&tmp, &path).map_err(|e| e.to_string())?;
    Ok(SigningKey::from_bytes(&seed))
}

fn payload(method: &str, path: &str, time: &str, body: &[u8]) -> String {
    let hash: String = Sha256::digest(body).iter().map(|b| format!("{b:02x}")).collect();
    format!("{method}\n{path}\n{time}\n{hash}")
}

pub(crate) fn signed(method: &str, path: &str, body: &[u8]) -> Result<[(&'static str, String); 3], String> {
    let key = device_key()?;
    let time = SystemTime::now().duration_since(UNIX_EPOCH).unwrap_or_default().as_millis().to_string();
    let sig = key.sign(payload(method, path, &time, body).as_bytes());
    Ok([
        ("x-kromvia-key", URL_SAFE_NO_PAD.encode(key.verifying_key().as_bytes())),
        ("x-kromvia-time", time),
        ("x-kromvia-sig", URL_SAFE_NO_PAD.encode(sig.to_bytes())),
    ])
}

async fn call(method: Method, path: &str, body: Option<Value>) -> Result<Value, (u16, String)> {
    let bytes = body.map(|b| b.to_string().into_bytes()).unwrap_or_default();
    let mut req = http::client().request(method.clone(), format!("{}{path}", base()));
    for (name, value) in signed(method.as_str(), path, &bytes).map_err(|e| (0, e))? {
        req = req.header(name, value);
    }
    if !bytes.is_empty() {
        req = req.header("content-type", "application/json").body(bytes);
    }
    let resp = req.send().await.map_err(|e| (0, format!("Kromvia servers are unreachable: {e}")))?;
    let status = resp.status().as_u16();
    let json: Value = resp.json().await.map_err(|e| (status, e.to_string()))?;
    if (200..300).contains(&status) {
        Ok(json)
    } else {
        Err((status, json["error"].as_str().unwrap_or("request failed").to_string()))
    }
}

pub(crate) async fn send(method: Method, path: &str, body: Option<Value>) -> Result<Value, String> {
    call(method, path, body).await.map_err(|(_, e)| e)
}

pub async fn me() -> Result<Option<Value>, String> {
    match call(Method::GET, "/v1/me", None).await {
        Ok(v) => Ok(Some(v)),
        Err((403, _)) => Ok(None),
        Err((_, e)) => Err(e),
    }
}

pub async fn sign_up(name: &str) -> Result<Value, String> {
    send(Method::POST, "/v1/accounts", Some(serde_json::json!({ "name": name }))).await
}

pub async fn rename(name: &str) -> Result<Value, String> {
    send(Method::PATCH, "/v1/me", Some(serde_json::json!({ "name": name }))).await
}

pub async fn delete_me() -> Result<Value, String> {
    send(Method::DELETE, "/v1/me", None).await
}

pub async fn friends() -> Result<Value, String> {
    send(Method::GET, "/v1/friends", None).await
}

pub async fn friend_request(name: &str) -> Result<Value, String> {
    send(Method::POST, "/v1/friends/requests", Some(serde_json::json!({ "name": name }))).await
}

fn id(id: &str) -> Result<&str, String> {
    if !id.is_empty() && id.len() <= 64 && id.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'-') {
        Ok(id)
    } else {
        Err("bad id".into())
    }
}

pub async fn friend_accept(from: &str) -> Result<Value, String> {
    send(Method::POST, &format!("/v1/friends/requests/{}/accept", id(from)?), None).await
}

pub async fn request_delete(other: &str) -> Result<Value, String> {
    send(Method::DELETE, &format!("/v1/friends/requests/{}", id(other)?), None).await
}

pub async fn friend_remove(other: &str) -> Result<Value, String> {
    send(Method::DELETE, &format!("/v1/friends/{}", id(other)?), None).await
}

pub async fn set_cosmetics(cosmetics: Value) -> Result<Value, String> {
    send(Method::PUT, "/v1/me/cosmetics", Some(json!({ "cosmetics": cosmetics }))).await
}

pub async fn top() -> Result<Value, String> {
    send(Method::GET, "/v1/top", None).await
}

pub async fn search(q: &str) -> Result<Value, String> {
    let q = q.trim();
    if q.is_empty() || q.len() > 16 || !q.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') {
        return Ok(json!([]));
    }
    send(Method::GET, &format!("/v1/users?q={q}"), None).await
}

pub async fn user(name: &str) -> Result<Value, String> {
    let name = name.trim();
    if name.is_empty() || name.len() > 16 || !name.bytes().all(|b| b.is_ascii_alphanumeric() || b == b'_') {
        return Err("bad player name".into());
    }
    send(Method::GET, &format!("/v1/users/{name}"), None).await
}

pub async fn likes() -> Result<Value, String> {
    send(Method::GET, "/v1/likes", None).await
}

pub async fn like(other: &str, on: bool) -> Result<Value, String> {
    send(if on { Method::PUT } else { Method::DELETE }, &format!("/v1/likes/{}", id(other)?), None).await
}

fn provider(p: &str) -> Result<&str, String> {
    if p == "discord" || p == "telegram" {
        Ok(p)
    } else {
        Err("unknown provider".into())
    }
}

pub async fn link(p: &str) -> Result<Value, String> {
    send(Method::POST, &format!("/v1/me/links/{}", provider(p)?), None).await
}

pub async fn unlink(p: &str) -> Result<Value, String> {
    send(Method::DELETE, &format!("/v1/me/links/{}", provider(p)?), None).await
}

pub async fn messages(other: &str, before: Option<i64>) -> Result<Value, String> {
    let query = before.map(|b| format!("?before={b}")).unwrap_or_default();
    send(Method::GET, &format!("/v1/messages/{}{query}", id(other)?), None).await
}

pub async fn party() -> Result<Value, String> {
    send(Method::GET, "/v1/party", None).await
}

pub async fn party_invite(friend: &str) -> Result<Value, String> {
    send(Method::POST, "/v1/party/invites", Some(json!({ "id": id(friend)? }))).await
}

pub async fn party_join(party: &str) -> Result<Value, String> {
    send(Method::POST, "/v1/party/join", Some(json!({ "party": id(party)? }))).await
}

pub async fn party_decline(party: &str) -> Result<Value, String> {
    send(Method::DELETE, &format!("/v1/party/invites/{}", id(party)?), None).await
}

pub async fn party_leave() -> Result<Value, String> {
    send(Method::POST, "/v1/party/leave", None).await
}

pub async fn party_room(room: Option<&str>) -> Result<Value, String> {
    send(Method::PUT, "/v1/party/room", Some(json!({ "room": room }))).await
}

pub async fn room_mods_put(mods: Value) -> Result<Value, String> {
    send(Method::PUT, "/v1/me/room-mods", Some(json!({ "mods": mods }))).await
}

pub async fn room_mods_clear() -> Result<Value, String> {
    send(Method::DELETE, "/v1/me/room-mods", None).await
}

pub async fn room_mods(friend: &str) -> Result<Value, String> {
    send(Method::GET, &format!("/v1/friends/{}/room-mods", id(friend)?), None).await
}

fn sync_key(key: &str) -> Result<&str, String> {
    if !key.is_empty() && key.len() <= 64 && key.bytes().all(|b| b.is_ascii_alphanumeric() || b"._-".contains(&b)) {
        Ok(key)
    } else {
        Err("bad key".into())
    }
}

pub async fn sync_list() -> Result<Value, String> {
    send(Method::GET, "/v1/sync", None).await
}

pub async fn sync_get(key: &str) -> Result<Option<Value>, String> {
    match call(Method::GET, &format!("/v1/sync/{}", sync_key(key)?), None).await {
        Ok(v) => Ok(Some(v["data"].clone())),
        Err((404, _)) => Ok(None),
        Err((_, e)) => Err(e),
    }
}

pub async fn sync_put(key: &str, data: Value) -> Result<Value, String> {
    send(Method::PUT, &format!("/v1/sync/{}", sync_key(key)?), Some(json!({ "data": data }))).await
}

pub async fn sync_delete(key: &str) -> Result<Value, String> {
    send(Method::DELETE, &format!("/v1/sync/{}", sync_key(key)?), None).await
}

pub async fn share(kind: &str, data: Value) -> Result<String, String> {
    let res = send(Method::POST, "/v1/shares", Some(json!({ "kind": kind, "data": data }))).await?;
    res["code"].as_str().map(str::to_string).ok_or_else(|| "no code in the answer".into())
}

pub async fn share_screenshot(path: &std::path::Path) -> Result<String, String> {
    const MAX: u64 = 8 * 1024 * 1024;
    if std::fs::metadata(path).map_err(|e| e.to_string())?.len() > MAX {
        return Err("screenshot is over 8 MB".into());
    }
    let bytes = std::fs::read(path).map_err(|e| e.to_string())?;
    let route = "/v1/shares/screenshot";
    let mut req = http::client().post(format!("{}{route}", base()));
    for (name, value) in signed("POST", route, &bytes)? {
        req = req.header(name, value);
    }
    let resp = req.header("content-type", "application/octet-stream").body(bytes).send().await.map_err(|e| format!("Kromvia servers are unreachable: {e}"))?;
    let ok = resp.status().is_success();
    let json: Value = resp.json().await.map_err(|e| e.to_string())?;
    match json["code"].as_str() {
        Some(code) if ok => Ok(code.to_string()),
        _ => Err(json["error"].as_str().unwrap_or("request failed").to_string()),
    }
}

pub async fn shared(code: &str) -> Result<Value, String> {
    if code.is_empty() || code.len() > 16 || !code.bytes().all(|b| b.is_ascii_alphanumeric()) {
        return Err("bad share code".into());
    }
    send(Method::GET, &format!("/share/{code}"), None).await
}

pub fn norm_host(raw: &str) -> String {
    let h = raw.trim().to_ascii_lowercase();
    let h = h.strip_suffix(":25565").unwrap_or(&h);
    h.strip_suffix('.').unwrap_or(h).to_string()
}

#[derive(Default)]
pub struct Live(Mutex<Option<UnboundedSender<String>>>, Arc<Mutex<Option<String>>>);

impl Live {
    pub fn start(&self, emit: impl Fn(Value) + Send + Sync + 'static) {
        let mut slot = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if slot.as_ref().is_some_and(|tx| !tx.is_closed()) {
            return;
        }
        let (tx, rx) = unbounded_channel();
        *slot = Some(tx);
        tauri::async_runtime::spawn(run(rx, self.1.clone(), emit));
    }

    pub fn set_playing(&self, at: Option<(&str, &str)>) {
        let msg = json!({ "type": "server", "host": at.map(|a| a.0), "nick": at.map(|a| a.1) }).to_string();
        *self.1.lock().unwrap_or_else(|e| e.into_inner()) = at.map(|_| msg.clone());
        let slot = self.0.lock().unwrap_or_else(|e| e.into_inner());
        if let Some(tx) = slot.as_ref() {
            let _ = tx.send(msg);
        }
    }

    pub fn host(&self) -> Option<String> {
        let msg = self.1.lock().unwrap_or_else(|e| e.into_inner()).clone()?;
        serde_json::from_str::<Value>(&msg).ok()?["host"].as_str().map(norm_host)
    }

    pub fn send(&self, msg: Value) -> Result<(), String> {
        let slot = self.0.lock().unwrap_or_else(|e| e.into_inner());
        slot.as_ref().and_then(|tx| tx.send(msg.to_string()).ok()).ok_or_else(|| "not connected to Kromvia".into())
    }
}

enum Ended {
    Lost,
    NoAccount,
}

type Playing = Arc<Mutex<Option<String>>>;

async fn run(mut outbox: UnboundedReceiver<String>, playing: Playing, emit: impl Fn(Value)) {
    let mut backoff = 1;
    loop {
        match session(&mut outbox, &playing, &emit, &mut backoff).await {
            Ended::NoAccount => return emit(json!({ "type": "stopped" })),
            Ended::Lost => emit(json!({ "type": "disconnected" })),
        }
        tokio::time::sleep(Duration::from_secs(backoff)).await;
        backoff = (backoff * 2).min(60);
    }
}

const RESEND_PLAYING: u32 = 10;

async fn session(outbox: &mut UnboundedReceiver<String>, playing: &Playing, emit: &impl Fn(Value), backoff: &mut u64) -> Ended {
    let Ok(mut req) = format!("{}/v1/ws", base().replacen("http", "ws", 1)).into_client_request() else { return Ended::NoAccount };
    let Ok(headers) = signed("GET", "/v1/ws", b"") else { return Ended::Lost };
    for (name, value) in headers {
        if let Ok(v) = value.parse() {
            req.headers_mut().insert(name, v);
        }
    }
    let mut ws = match connect_async(req).await {
        Ok((ws, _)) => ws,
        Err(WsError::Http(resp)) if resp.status() == 403 => return Ended::NoAccount,
        Err(_) => return Ended::Lost,
    };
    *backoff = 1;
    emit(json!({ "type": "connected" }));
    let mut ping = tokio::time::interval(Duration::from_secs(30));
    let mut pings = 0u32;
    loop {
        tokio::select! {
            incoming = ws.next() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    if let Ok(v) = serde_json::from_str::<Value>(text.as_str()) {
                        emit(v);
                    }
                }
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => return Ended::Lost,
                Some(Ok(_)) => {}
            },
            out = outbox.recv() => match out {
                Some(text) => {
                    if ws.send(Message::Text(text.into())).await.is_err() {
                        return Ended::Lost;
                    }
                }
                None => return Ended::NoAccount,
            },
            _ = ping.tick() => {
                if ws.send(Message::Text("ping".into())).await.is_err() {
                    return Ended::Lost;
                }
                if pings.is_multiple_of(RESEND_PLAYING) {
                    let msg = playing.lock().unwrap_or_else(|e| e.into_inner()).clone();
                    if let Some(msg) = msg {
                        if ws.send(Message::Text(msg.into())).await.is_err() {
                            return Ended::Lost;
                        }
                    }
                }
                pings += 1;
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn payload_matches_server_format() {
        assert_eq!(
            payload("GET", "/v1/me", "1", b""),
            "GET\n/v1/me\n1\ne3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855"
        );
    }

    #[test]
    fn ids_cannot_change_the_path() {
        assert!(id("3f2a-9c").is_ok());
        for bad in ["", "../me", "a/b", "a?x=1", "a b"] {
            assert!(id(bad).is_err(), "{bad}");
        }
    }
}

#[cfg(test)]
mod live {
    use super::*;

    #[tokio::test]
    #[ignore]
    async fn live_round_trip() {
        let dir = std::env::temp_dir().join(format!("kromvia-social-{}", std::process::id()));
        paths::init(dir.clone());
        assert!(me().await.unwrap().is_none());
        let name = format!("live_{}", std::process::id() % 100_000);
        assert_eq!(sign_up(&name).await.unwrap()["name"], name.as_str());
        assert_eq!(me().await.unwrap().unwrap()["name"], name.as_str());
        assert_eq!(friend_request("nobody_here").await.unwrap_err(), "no such player");
        assert!(friends().await.unwrap()["friends"].as_array().unwrap().is_empty());

        let (tx, rx) = std::sync::mpsc::channel();
        let live = Live::default();
        live.start(move |v| {
            let _ = tx.send(v);
        });
        let next = || rx.recv_timeout(Duration::from_secs(10)).unwrap()["type"].as_str().unwrap().to_string();
        assert_eq!(next(), "connected");
        assert_eq!(next(), "presence");
        live.send(json!({ "type": "chat", "to": "nobody", "text": "hi" })).unwrap();
        assert_eq!(next(), "error");
        let _ = std::fs::remove_dir_all(dir);
    }
}
