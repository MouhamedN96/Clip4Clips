// VPS API client — talks to the ClipForge API on the VPS
// Used for: fetching pending clips, syncing approval decisions, checking health

use serde::{Deserialize, Serialize};

#[derive(Serialize, Deserialize)]
pub struct VpsHealth {
    pub api_reachable: bool,
    pub farm_status: String,
    pub queue_depth: usize,
}

pub async fn check_health(vps_url: &str) -> Result<VpsHealth, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/health", vps_url.trim_end_matches('/'));
    match client.get(&url).send().await {
        Ok(resp) if resp.status().is_success() => {
            Ok(VpsHealth {
                api_reachable: true,
                farm_status: "online".to_string(),
                queue_depth: 0,
            })
        }
        Ok(resp) => Err(format!("VPS health check failed: {}", resp.status())),
        Err(e) => Ok(VpsHealth {
            api_reachable: false,
            farm_status: "offline".to_string(),
            queue_depth: 0,
        }),
    }
}

pub async fn get_products(vps_url: &str) -> Result<serde_json::Value, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/clips/queue", vps_url.trim_end_matches('/'));
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let data: serde_json::Value = resp.json().await.map_err(|e| e.to_string())?;
    Ok(data)
}

pub async fn fetch_pending_clips(vps_url: &str, _api_key: &str) -> Result<Vec<crate::commands::Clip>, String> {
    let client = reqwest::Client::builder()
        .timeout(std::time::Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;

    let url = format!("{}/api/clips/queue", vps_url.trim_end_matches('/'));
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;

    if !resp.status().is_success() {
        return Err(format!("VPS API error: {}", resp.status()));
    }

    let clips: Vec<crate::commands::Clip> = resp.json().await.map_err(|e| e.to_string())?;
    Ok(clips)
}