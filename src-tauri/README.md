# Clip4Clicks Tauri Desktop App

Windows-alpha desktop client for Clip4Clicks. The native shell and local state are
working; VPS synchronization, the review UI, and local rendering are the next
checkpoints.

## Architecture

```
Tauri app (creator's laptop)
  ├── Frontend: placeholder HTML (dashboard deferred)
  ├── Rust backend:
  │   ├── SQLite: local clip queue, settings, analytics
  │   ├── ffmpeg + yt-dlp adapter: uses tools installed on PATH for now
  │   └── VPS API client scaffold: sync contract deferred
  └── Native notifications plugin (tray disabled for the alpha)

VPS (stays):
  ├── Clip4Clicks API: billing, orchestration, analytics aggregation
  ├── Hermes phone farm: posting approved clips
  └── Whop webhooks: subscription management
```

## Structure

```
src-tauri/
  Cargo.toml          # Rust deps + Tauri config
  tauri.conf.json     # Windows-alpha app config (release bundle disabled)
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
  icons/              # Development icon; release artwork deferred
  sidecars/           # Deferred; no binaries are currently bundled
```

## Commands (frontend → Rust)

| Command | What |
|---|---|
| `get_review_queue` | Fetch pending/approved/posted clips from local SQLite |
| `approve_clip` | Set local clip status to approved + set platforms |
| `reject_clip` | Set local clip status to rejected |
| `queue_clip` | Add a source URL to the local SQLite clip table |
| `render_clip` | Invoke system yt-dlp + ffmpeg (not yet end-to-end verified) |
| `get_clip_status` | Read locally stored clip status |
| `get_products` | VPS API scaffold; contract correction deferred |
| `get_analytics` | Local analytics from SQLite |
| `check_vps_health` | Check if VPS API is reachable |
| `sync_with_vps` | VPS-to-local sync scaffold; contract correction deferred |
| `get_settings` / `save_settings` | App settings (VPS URL, API key, brand) |

## Build

```bash
# Verify the native foundation
cargo check --manifest-path src-tauri/Cargo.toml
cargo test --manifest-path src-tauri/Cargo.toml
cargo run --manifest-path src-tauri/Cargo.toml
```

Development loads the checked-in `frontend/index.html` directly; it does not
require a separate frontend server.

`bundle.active` is currently `false`, so this alpha does not produce an MSI or
other installer. Release packaging will be enabled after signed release assets
and the required runtime binaries exist. macOS, Linux, and Android packaging are
outside this Windows-alpha checkpoint.

## Local Tools (Alpha)

FFmpeg and yt-dlp are **not bundled**. The current adapter detects executables on
the system `PATH`, and rendering will return an error when either tool is absent.
Bundled, versioned binaries are deferred to the rendering/release checkpoint.

The checked-in sidecar ignore rules reserve their eventual paths; they do not
mean those binaries are present in the application.

## White-Label

```bash
# In tauri.conf.json, change:
# - productName: "Acme Clips"
# - identifier: "com.acmeclips.app"
# - bundle.icon: custom icons
# - app.windows[0].title: "Acme Clips"
```

## Updater

The updater is **disabled** for the Windows alpha. There is no launch-time update
check, updater endpoint, or updater permission in the current build. It will stay
disabled until release signing, a public key, and signed update artifacts are in
place.

## Status

**Windows foundation:** the native application compiles and launches, creates its
app-data directory, opens persistent SQLite state, and registers that database as
Tauri managed state. Focused Rust tests cover persistence, review status, and the
in-memory render queue.

Still deferred:

1. Build the review dashboard and preview experience.
2. Correct and verify the VPS sync/approval API contract.
3. Exercise local vertical rendering with installed FFmpeg and yt-dlp.
4. Add vetted sidecar binaries and release artwork.
5. Configure MSI bundling, updater signing, and distribution.
