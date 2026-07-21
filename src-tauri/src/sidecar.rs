// ffmpeg + yt-dlp sidecar management
// Runs local rendering — the core offline-first capability

use std::path::{Path, PathBuf};
use std::process::Command;

pub struct SidecarStatus {
    pub ffmpeg: bool,
    pub yt_dlp: bool,
}

pub fn check_sidecars(resource_dir: &Path) -> Result<SidecarStatus, String> {
    let ffmpeg = resource_dir.join("sidecars").join(if cfg!(target_os = "windows") { "ffmpeg.exe" } else { "ffmpeg" });
    let yt_dlp = resource_dir.join("sidecars").join(if cfg!(target_os = "windows") { "yt-dlp.exe" } else { "yt-dlp" });

    Ok(SidecarStatus {
        ffmpeg: ffmpeg.exists() || which::which("ffmpeg").is_ok(),
        yt_dlp: yt_dlp.exists() || which::which("yt-dlp").is_ok(),
    })
}

/// Render a clip locally: download source → extract highlights → cut with ffmpeg
pub async fn render(clip_id: &str, source_url: &str) -> Result<String, String> {
    let output_dir = dirs::video_dir()
        .unwrap_or_else(|| PathBuf::from("/tmp"))
        .join("clip4clicks")
        .join(clip_id);

    std::fs::create_dir_all(&output_dir).map_err(|e| e.to_string())?;

    // Step 1: Download source video with yt-dlp
    let source_path = output_dir.join("source.mp4");
    let download = Command::new("yt-dlp")
        .args(&["-o", source_path.to_str().unwrap(), "-f", "mp4", source_url])
        .output()
        .map_err(|e| format!("yt-dlp failed: {e}"))?;

    if !download.status.success() {
        return Err(format!("yt-dlp: {}", String::from_utf8_lossy(&download.stderr)));
    }

    // Step 2: Extract a 30s highlight clip with ffmpeg (simplified — real version uses AI scoring)
    let clip_path = output_dir.join("clip.mp4");
    let render = Command::new("ffmpeg")
        .args(&[
            "-i", source_path.to_str().unwrap(),
            "-ss", "00:00:10",  // Start at 10s (placeholder — real version uses AI timestamps)
            "-t", "00:00:30",   // 30s clip
            "-c:v", "libx264",
            "-c:a", "aac",
            "-vf", "scale=1080:1920:force_original_aspect_ratio=decrease,pad=1080:1920:(ow-iw)/2:(oh-ih)/2",
            "-y",
            clip_path.to_str().unwrap(),
        ])
        .output()
        .map_err(|e| format!("ffmpeg failed: {e}"))?;

    if !render.status.success() {
        return Err(format!("ffmpeg: {}", String::from_utf8_lossy(&render.stderr)));
    }

    Ok(clip_path.to_string_lossy().to_string())
}