// Tauri commands — the bridge between frontend and Rust backend
// Each command is callable from JS: invoke('command_name', { args })

use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Serialize, Deserialize)]
pub struct Clip {
    pub id: String,
    pub title: String,
    pub source_url: String,
    pub status: String,
    pub thumbnail: Option<String>,
    pub duration: Option<f64>,
    pub platforms: Vec<String>,
    pub created_at: String,
}

#[derive(Serialize, Deserialize)]
pub struct ReviewQueue {
    pub pending: Vec<Clip>,
    pub approved: Vec<Clip>,
    pub posted: Vec<Clip>,
}

#[derive(Serialize, Deserialize)]
pub struct VpsHealth {
    pub api_reachable: bool,
    pub farm_status: String,
    pub queue_depth: usize,
}

#[derive(Serialize, Deserialize)]
pub struct Settings {
    pub vps_url: String,
    pub api_key: String,
    pub brand_name: String,
    pub render_local: bool,
    pub auto_sync: bool,
}

// ── Review queue ──────────────────────────────────────────────

#[tauri::command]
pub async fn get_review_queue(db: State<'_, db::Database>) -> Result<ReviewQueue, String> {
    db.get_review_queue().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn approve_clip(db: State<'_, db::Database>, clip_id: String, platforms: Vec<String>) -> Result<(), String> {
    db.approve_clip(&clip_id, &platforms).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reject_clip(db: State<'_, db::Database>, clip_id: String, reason: String) -> Result<(), String> {
    db.reject_clip(&clip_id, &reason).map_err(|e| e.to_string())
}

// ── Production ────────────────────────────────────────────────

#[tauri::command]
pub async fn queue_clip(db: State<'_, db::Database>, source_url: String, title: String) -> Result<String, String> {
    db.queue_clip(&source_url, &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn get_clip_status(db: State<'_, db::Database>, clip_id: String) -> Result<Clip, String> {
    db.get_clip_status(&clip_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn render_clip(clip_id: String, source_url: String) -> Result<String, String> {
    // Runs ffmpeg/yt-dlp sidecar locally
    sidecar::render(&clip_id, &source_url).await.map_err(|e| e.to_string())
}

// ── Products (from VPS API) ───────────────────────────────────

#[tauri::command]
pub async fn get_products(vps_url: String) -> Result<serde_json::Value, String> {
    api::get_products(&vps_url).await.map_err(|e| e.to_string())
}

// ── Analytics ─────────────────────────────────────────────────

#[tauri::command]
pub async fn get_analytics(db: State<'_, db::Database>) -> Result<serde_json::Value, String> {
    db.get_analytics().map_err(|e| e.to_string())
}

// ── VPS sync ──────────────────────────────────────────────────

#[tauri::command]
pub async fn check_vps_health(vps_url: String) -> Result<VpsHealth, String> {
    api::check_health(&vps_url).await.map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn sync_with_vps(db: State<'_, db::Database>, vps_url: String, api_key: String) -> Result<usize, String> {
    // Pull pending clips from VPS, store locally
    let clips = api::fetch_pending_clips(&vps_url, &api_key).await.map_err(|e| e.to_string())?;
    let count = db.sync_clips(clips).map_err(|e| e.to_string())?;
    Ok(count)
}

// ── Settings ──────────────────────────────────────────────────

#[tauri::command]
pub async fn get_settings(store: tauri_plugin_store::StoreExt) -> Result<Settings, String> {
    let store = store.get("settings.json").map_err(|e| e.to_string())?;
    let vps_url = store.get("vps_url").and_then(|v| v.as_str()).unwrap_or("http://localhost:3000").to_string();
    let api_key = store.get("api_key").and_then(|v| v.as_str()).unwrap_or("").to_string();
    let brand_name = store.get("brand_name").and_then(|v| v.as_str()).unwrap_or("Clip4Clicks").to_string();
    let render_local = store.get("render_local").and_then(|v| v.as_bool()).unwrap_or(true);
    let auto_sync = store.get("auto_sync").and_then(|v| v.as_bool()).unwrap_or(true);
    Ok(Settings { vps_url, api_key, brand_name, render_local, auto_sync })
}

#[tauri::command]
pub async fn save_settings(store: tauri_plugin_store::StoreExt, settings: Settings) -> Result<(), String> {
    let mut store = store.get("settings.json").map_err(|e| e.to_string())?;
    store.set("vps_url", serde_json::json!(settings.vps_url));
    store.set("api_key", serde_json::json!(settings.api_key));
    store.set("brand_name", serde_json::json!(settings.brand_name));
    store.set("render_local", serde_json::json!(settings.render_local));
    store.set("auto_sync", serde_json::json!(settings.auto_sync));
    store.save().map_err(|e| e.to_string())
}