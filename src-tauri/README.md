# Clip4Clicks Tauri Desktop App

Offline-first desktop client for Clip4Clicks. Local rendering + VPS sync.

## Architecture

```
Tauri app (creator's laptop)
  ├── Frontend: dashboard HTML/CSS/JS (bundled, no browser needed)
  ├── Rust backend:
  │   ├── SQLite: local clip queue, settings, analytics
  │   ├── ffmpeg + yt-dlp sidecars: local rendering (offline)
  │   └── VPS API client: sync clips, approvals, health checks
  └── System tray + native notifications

VPS (stays):
  ├── ClipForge API: billing, orchestration, analytics aggregation
  ├── Hermes phone farm: posting approved clips
  └── Whop webhooks: subscription management
```

## Structure

```
src-tauri/
  Cargo.toml          # Rust deps + Tauri config
  tauri.conf.json     # App config (window, bundle, updater)
  build.rs            # Tauri build script
  src/
    main.rs           # Entry point
    lib.rs            # App setup + plugin registration
    commands.rs       # Tauri commands (frontend ↔ Rust bridge)
    db.rs             # SQLite clip queue + analytics
    sidecar.rs        # ffmpeg + yt-dlp management + local rendering
    api.rs            # VPS API client (sync, health, products)
    queue.rs          # Render queue management
  capabilities/
    default.json      # Permissions (shell, http, fs, notifications)
  icons/              # App icons (placeholder)
  sidecars/           # Bundled ffmpeg + yt-dlp binaries (per-platform)
```

## Commands (frontend → Rust)

| Command | What |
|---|---|
| `get_review_queue` | Fetch pending/approved/posted clips from local SQLite |
| `approve_clip` | Approve a clip + set platforms |
| `reject_clip` | Reject a clip with reason |
| `queue_clip` | Add a source URL to the local render queue |
| `render_clip` | Run yt-dlp + ffmpeg locally (offline rendering) |
| `get_clip_status` | Check render status of a clip |
| `get_products` | Fetch products from VPS API |
| `get_analytics` | Local analytics from SQLite |
| `check_vps_health` | Check if VPS API is reachable |
| `sync_with_vps` | Pull pending clips from VPS to local |
| `get_settings` / `save_settings` | App settings (VPS URL, API key, brand) |

## Build

```bash
# Install Tauri CLI
cargo install tauri-cli --version "^2.0"

# Development (hot reload)
cargo tauri dev

# Production build (cross-compile per platform)
cargo tauri build --target x86_64-pc-windows-msvc  # Windows
cargo tauri build --target x86_64-apple-darwin      # macOS
cargo tauri build --target aarch64-linux-android    # Android

# Output: installers in src-tauri/target/release/bundle/
```

## Sidecar Setup

Bundle ffmpeg + yt-dlp per platform:

```bash
mkdir -p src-tauri/sidecars
# Linux
cp /usr/bin/ffmpeg src-tauri/sidecars/ffmpeg
cp /usr/bin/yt-dlp src-tauri/sidecars/yt-dlp
# Windows (download from ffmpeg.org + yt-dlp GitHub)
# macOS (brew install ffmpeg yt-dlp, copy from /opt/homebrew/bin/)
```

## White-Label

```bash
# In tauri.conf.json, change:
# - productName: "Acme Clips"
# - identifier: "com.acmeclips.app"
# - bundle.icon: custom icons
# - app.windows[0].title: "Acme Clips"
```

## Updater

Auto-update via GitHub releases. On launch, Tauri checks:
```
https://github.com/MouhamedN96/Clip4Clips/releases/latest/download/latest.json
```

Publish a new release → users get updated on next launch.

## Status

**Scaffold** — structure is ready, code compiles (pending Tauri CLI install). Next steps:
1. Build the frontend dashboard (reuse the ClipForge web UI)
2. Bundle ffmpeg + yt-dlp sidecars per target platform
3. Test local rendering pipeline
4. Wire VPS sync (pull clips, push approvals)
5. Generate app icons
6. First build: `cargo tauri build`