use serde_json::Value;
use tauri::{AppHandle, Emitter, Manager, State};

use crate::engine::content::mrpack;
use crate::engine::core::jobs::{Job, Jobs};
use crate::engine::game::launch::Games;

use crate::engine::social::{self, Live};

#[tauri::command]
pub async fn social_me() -> Result<Option<Value>, String> {
    social::me().await
}

#[tauri::command]
pub async fn social_sign_up(name: String) -> Result<Value, String> {
    social::sign_up(&name).await
}

#[tauri::command]
pub async fn social_rename(name: String) -> Result<Value, String> {
    social::rename(&name).await
}

#[tauri::command]
pub async fn social_delete() -> Result<Value, String> {
    social::delete_me().await
}

#[tauri::command]
pub async fn social_friends() -> Result<Value, String> {
    social::friends().await
}

#[tauri::command]
pub async fn social_friend_request(name: String) -> Result<Value, String> {
    social::friend_request(&name).await
}

#[tauri::command]
pub async fn social_friend_accept(id: String) -> Result<Value, String> {
    social::friend_accept(&id).await
}

#[tauri::command]
pub async fn social_request_delete(id: String) -> Result<Value, String> {
    social::request_delete(&id).await
}

#[tauri::command]
pub async fn social_friend_remove(id: String) -> Result<Value, String> {
    social::friend_remove(&id).await
}

#[tauri::command]
pub async fn social_messages(id: String, before: Option<i64>) -> Result<Value, String> {
    social::messages(&id, before).await
}

#[tauri::command]
pub async fn social_top() -> Result<Value, String> {
    social::top().await
}

#[tauri::command]
pub async fn social_search(q: String) -> Result<Value, String> {
    social::search(&q).await
}

#[tauri::command]
pub async fn social_user(name: String) -> Result<Value, String> {
    social::user(&name).await
}

#[tauri::command]
pub async fn social_likes() -> Result<Value, String> {
    social::likes().await
}

#[tauri::command]
pub async fn social_like(id: String, on: bool) -> Result<Value, String> {
    social::like(&id, on).await
}

#[tauri::command]
pub async fn social_link(provider: String) -> Result<(), String> {
    let res = social::link(&provider).await?;
    let url = res["url"].as_str().filter(|u| u.starts_with("https://")).ok_or("bad link url")?;
    tauri_plugin_opener::open_url(url, None::<&str>).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn social_unlink(provider: String) -> Result<Value, String> {
    social::unlink(&provider).await
}

#[tauri::command]
pub fn social_connect(app: AppHandle, live: State<'_, Live>) {
    live.start(move |msg| {
        if msg["type"] == "worn" {
            return app.state::<Games>().worn(&msg);
        }
        if msg["type"] == "ping" {
            return app.state::<Games>().ping(&msg, app.state::<Live>().host());
        }
        if msg["type"] == "ping.error" {
            return app.state::<Games>().toast("Ping not sent", msg["error"].as_str().unwrap_or_default(), None);
        }
        let _ = app.emit("social", msg);
    });
}

#[tauri::command]
pub fn social_chat(live: State<'_, Live>, to: String, text: String) -> Result<(), String> {
    live.send(serde_json::json!({ "type": "chat", "to": to, "text": text }))
}

#[tauri::command]
pub fn social_room(live: State<'_, Live>, room: Option<String>, mc: Option<String>, instance: Option<String>) -> Result<(), String> {
    let hosting = room.is_some();
    tauri::async_runtime::spawn(async move {
        match instance.filter(|_| hosting) {
            Some(id) => {
                if let Ok(list) = crate::engine::content::modrinth::installed_mods(&id).await {
                    let mods: Vec<Value> = list.iter().map(|v| serde_json::json!({ "p": v.project_id, "v": v.id })).collect();
                    let _ = social::room_mods_put(Value::Array(mods)).await;
                }
            }
            None => {
                let _ = social::room_mods_clear().await;
            }
        }
    });
    live.send(serde_json::json!({ "type": "room", "room": room, "mc": mc }))
}

#[tauri::command]
pub fn social_status(live: State<'_, Live>, status: String) -> Result<(), String> {
    live.set_status(&status)
}

#[tauri::command]
pub fn social_game(live: State<'_, Live>, mc: Option<String>, since: Option<i64>) {
    live.set_game(mc.as_deref().zip(since));
}

#[tauri::command]
pub async fn social_clan(method: String, path: String, body: Option<Value>) -> Result<Value, String> {
    social::clan_call(&method, &path, body).await
}

#[tauri::command]
pub fn social_clan_chat(live: State<'_, Live>, text: String) -> Result<(), String> {
    live.send(serde_json::json!({ "type": "clan.chat", "text": text }))
}

#[tauri::command]
pub fn social_clan_presence(live: State<'_, Live>) -> Result<(), String> {
    live.send(serde_json::json!({ "type": "clan.presence" }))
}

#[tauri::command]
pub fn social_hide_server(live: State<'_, Live>, hide: bool) {
    live.set_hidden(hide);
}

#[tauri::command]
pub fn social_presence(live: State<'_, Live>) -> Result<(), String> {
    live.send(serde_json::json!({ "type": "presence" }))
}

#[tauri::command]
pub async fn social_party() -> Result<Value, String> {
    social::party().await
}

#[tauri::command]
pub async fn social_party_invite(id: String) -> Result<Value, String> {
    social::party_invite(&id).await
}

#[tauri::command]
pub async fn social_party_join(party: String) -> Result<Value, String> {
    social::party_join(&party).await
}

#[tauri::command]
pub async fn social_party_decline(party: String) -> Result<Value, String> {
    social::party_decline(&party).await
}

#[tauri::command]
pub async fn social_party_leave() -> Result<Value, String> {
    social::party_leave().await
}

#[tauri::command]
pub async fn social_party_room(room: Option<String>) -> Result<Value, String> {
    social::party_room(room.as_deref()).await
}

#[tauri::command]
pub async fn sync_list() -> Result<Value, String> {
    social::sync_list().await
}

#[tauri::command]
pub async fn sync_get(key: String) -> Result<Option<Value>, String> {
    social::sync_get(&key).await
}

#[tauri::command]
pub async fn sync_put(key: String, data: Value) -> Result<Value, String> {
    social::sync_put(&key, data).await
}

#[tauri::command]
pub async fn sync_delete(key: String) -> Result<Value, String> {
    social::sync_delete(&key).await
}

#[tauri::command]
pub fn sync_build(app: AppHandle, jobs: State<'_, Jobs>, instance_id: String) -> Result<u64, String> {
    jobs.spawn(&app, format!("sync-{instance_id}"), move |job| async move {
        let (manifest, _) = mrpack::manifest(&instance_id, &job).await?;
        social::sync_put(&format!("build.{instance_id}"), manifest).await.map(|_| ())
    })
}

#[tauri::command]
pub async fn share_build(instance_id: String, public: Option<bool>) -> Result<Value, String> {
    let (manifest, missing) = mrpack::manifest(&instance_id, &std::sync::Arc::new(Job::detached("share"))).await?;
    let code = if public.unwrap_or(false) { social::share_public("build", manifest).await? } else { social::share("build", manifest).await? };
    Ok(serde_json::json!({ "code": code, "missing": missing }))
}

#[tauri::command]
pub async fn share_private(code: String) -> Result<(), String> {
    social::share_private(&code).await
}

#[tauri::command]
pub async fn share_log(text: String) -> Result<String, String> {
    Ok(social::page(&social::share("log", Value::String(text)).await?))
}

#[tauri::command]
pub async fn share_screenshot(instance_id: String, name: String) -> Result<String, String> {
    let path = crate::engine::worlds::screenshot_path(&instance_id, &name)?;
    Ok(social::page(&social::share_screenshot(&path).await?))
}

#[tauri::command]
pub async fn share_screenshot_file(app: AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let picked = tauri::async_runtime::spawn_blocking(move || app.dialog().file().add_filter("Images", &["png", "jpg", "jpeg"]).blocking_pick_file())
        .await
        .map_err(|e| e.to_string())?;
    let Some(path) = picked.and_then(|p| p.into_path().ok()) else {
        return Ok(None);
    };
    Ok(Some(format!("{}/share/{}", social::base(), social::share_screenshot(&path).await?)))
}

#[tauri::command]
pub async fn share_get(code: String) -> Result<Value, String> {
    social::shared(&code).await
}

#[tauri::command]
pub fn build_install(app: AppHandle, jobs: State<'_, Jobs>, manifest: Value) -> Result<u64, String> {
    jobs.spawn(&app, "build-install".into(), move |job| async move { mrpack::install_manifest(manifest, &job).await.map(|_| ()) })
}

#[tauri::command]
pub async fn social_cosmetics(worn: Value) -> Result<Value, String> {
    social::set_cosmetics(worn).await
}

#[tauri::command]
pub fn wardrobe_get() -> Option<Value> {
    crate::engine::wardrobe::load()
}

#[tauri::command]
pub async fn wardrobe_push(
    app: AppHandle,
    wardrobe: Value,
    cape_png: Option<String>,
    models: Vec<String>,
    items: Vec<String>,
) -> Result<(), String> {
    crate::engine::wardrobe::save(&wardrobe, cape_png.as_deref())?;
    app.state::<Games>().wardrobe_changed();
    let w = crate::engine::wardrobe::load().unwrap_or_default();
    let mut worn = serde_json::json!({ "models": models, "items": items, "cape": w["back"] == "cape", "style": w["style"], "colors": w["colors"] });
    if w["style"] == "custom" {
        worn["art"] = w["art"].clone();
    }
    tauri::async_runtime::spawn(async move {
        let _ = social::set_cosmetics(worn).await;
    });
    Ok(())
}

#[tauri::command]
pub async fn social_setup(setup: Value) -> Result<Value, String> {
    social::set_setup(setup).await
}

#[tauri::command]
pub async fn social_user_setup(name: String) -> Result<Value, String> {
    social::user_setup(&name).await
}

#[tauri::command]
pub async fn social_stats(stats: Value) -> Result<Value, String> {
    social::set_stats(stats).await
}

#[tauri::command]
pub async fn social_profile(profile: Value) -> Result<Value, String> {
    social::set_profile(profile).await
}

#[tauri::command]
pub async fn share_image(code: String) -> Result<String, String> {
    use base64::Engine;
    if code.is_empty() || !code.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_') {
        return Err("bad code".into());
    }
    let resp = crate::engine::core::http::client().get(format!("https://api.kromvia.com/share/{code}")).send().await.map_err(|e| e.to_string())?;
    if !resp.status().is_success() {
        return Err(format!("HTTP {}", resp.status()));
    }
    let mime = resp.headers().get("content-type").and_then(|v| v.to_str().ok()).unwrap_or("image/png").to_string();
    if !mime.starts_with("image/") {
        return Err("not an image".into());
    }
    let bytes = resp.bytes().await.map_err(|e| e.to_string())?;
    Ok(format!("data:{mime};base64,{}", base64::engine::general_purpose::STANDARD.encode(&bytes)))
}
