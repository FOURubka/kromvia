use serde_json::Value;
use tauri::AppHandle;

use crate::engine::relay::{self, Held};

#[tauri::command]
pub async fn relay_list() -> Result<Value, String> {
    relay::list().await
}

#[tauri::command]
pub fn relay_held() -> Option<Held> {
    relay::held()
}

#[tauri::command]
pub async fn relay_create(app: AppHandle, instance_id: String, world: String, name: String) -> Result<Value, String> {
    relay::create(&app, &instance_id, &world, &name).await
}

#[tauri::command]
pub async fn relay_delete(id: String) -> Result<Value, String> {
    relay::delete(&id).await
}

#[tauri::command]
pub async fn relay_add(id: String, friend: String) -> Result<Value, String> {
    relay::add_member(&id, &friend).await
}

#[tauri::command]
pub async fn relay_kick(id: String, account: String) -> Result<Value, String> {
    relay::remove_member(&id, &account).await
}

#[tauri::command]
pub async fn relay_take(app: AppHandle, id: String, instance_id: String) -> Result<String, String> {
    relay::take(&app, &id, &instance_id).await
}

#[tauri::command]
pub async fn relay_put_back(app: AppHandle) -> Result<Value, String> {
    relay::put_back(&app).await
}

#[tauri::command]
pub async fn relay_release(id: String) -> Result<(), String> {
    relay::release(&id).await
}
