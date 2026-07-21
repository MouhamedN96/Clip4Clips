# Clip4Clicks Tauri Desktop — Remaining Work

> Status: **Scaffold complete on `tauri/desktop` branch.** All Rust backend, Tauri config, and project structure are in place. The following items need to be done on a dev machine with a desktop environment (laptop, not VPS).

## Prerequisites (laptop)

- [ ] Install Rust: `curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh`
- [ ] Install Tauri CLI: `cargo install tauri-cli --version "^2.0"`
- [ ] Install system deps:
  - **Linux:** `sudo apt install libwebkit2gtk-4.1-dev libgtk-3-dev libayatana-appindicator3-dev librsvg2-dev`
  - **macOS:** `brew install gtk3 webkit2gtk` (or use native macOS webview)
  - **Windows:** install via Tauri prerequisites script
- [ ] Clone: `git clone https://github.com/MouhamedN96/Clip4Clips.git && cd Clip4Clips && git checkout tauri/desktop`

## 1. Frontend Dashboard

The Tauri app needs a frontend. Build it in `src-tauri/frontend/`.

- [ ] Create `index.html` — main dashboard layout (reuse ClipForge web UI patterns)
- [ ] Create `styles.css` — dark theme matching the ClipForge brand
- [ ] Create `app.js` — vanilla JS that calls Tauri commands via `window.__TAURI__.invoke()`
- [ ] Pages needed:
  - [ ] **Review Queue** — pending clips with thumbnails, approve/reject buttons
  - [ ] **Clip Preview** — video player for rendered clips
  - [ ] **Render Queue** — local render progress (download → score → cut)
  - [ ] **Analytics** — clips produced, posted, pending counts
  - [ ] **Settings** — VPS URL, API key, brand name, auto-sync toggle
- [ ] System tray integration — show queue depth, quick approve
- [ ] Native notifications — clip ready, render complete, sync done

Reference: the existing ClipForge web dashboard (`src/api/server.js` serves routes at `/api/clips/*`). Mirror the API shape in Tauri commands.

## 2. Bundle Sidecars

ffmpeg + yt-dlp need to be bundled per target platform.

- [ ] Create `src-tauri/sidecars/` directory
- [ ] Download platform-specific binaries:
  - [ ] **Linux:** `cp /usr/bin/ffmpeg src-tauri/sidecars/ffmpeg` + `yt-dlp`
  - [ ] **Windows:** download from ffmpeg.org + yt-dlp GitHub (`.exe`)
  - [ ] **macOS:** `brew install ffmpeg yt-dlp`, copy from `/opt/homebrew/bin/`
  - [ ] **Android:** use termux-ffmpeg or bundle a static build
- [ ] Verify `tauri.conf.json` → `bundle.resources` includes the sidecar paths
- [ ] Test: `cargo tauri build` bundles them correctly
- [ ] Verify `sidecar.rs` → `check_sidecars()` finds them at runtime

## 3. Local Rendering Pipeline

Wire the ffmpeg + yt-dlp sidecar pipeline in `sidecar.rs`.

- [ ] **Download phase:** yt-dlp fetches source video → `output_dir/source.mp4`
- [ ] **Highlight scoring:** call DeepSeek API (or local model) to find best segments
  - Currently placeholder: hardcoded 10s start, 30s duration
  - Need: send transcript → DeepSeek → get timestamp ranges → pass to ffmpeg
- [ ] **Render phase:** ffmpeg cuts highlight clips with:
  - [ ] Vertical 1080x1920 (TikTok/Reels format)
  - [ ] Burned captions (if FAL_KEY available)
  - [ ] Watermark/brand overlay (white-label)
- [ ] **Output:** `output_dir/clip_001.mp4`, `clip_002.mp4`, etc.
- [ ] **Progress reporting:** emit Tauri events for frontend progress bar
- [ ] **Error handling:** sidecar not found, download failed, render failed

## 4. VPS Sync

Wire the VPS API client in `api.rs`.

- [ ] **Health check:** `GET {vps_url}/health` → update status indicator
- [ ] **Pull clips:** `GET {vps_url}/api/clips/queue` → store in local SQLite
- [ ] **Push approvals:** `POST {vps_url}/api/clips/:id/approve` → sync local decision to VPS
- [ ] **Push rejections:** `POST {vps_url}/api/clips/:id/reject`
- [ ] **Auto-sync:** if `settings.auto_sync` is true, poll every 60s
- [ ] **Auth:** add API key header if `settings.api_key` is set
- [ ] **Conflict resolution:** if clip exists locally AND on VPS, keep local status (local wins)
- [ ] **Offline mode:** if VPS unreachable, queue decisions for next sync

## 5. App Icons

- [ ] Generate real app icons (not the 98-byte placeholder)
- [ ] Use Tauri's icon generator: `cargo tauri icon path/to/source-icon.png`
- [ ] Source icon: Clip4Clicks logo (orange triangle ▲ from the branding)
- [ ] Output: all sizes in `src-tauri/icons/` (32x32, 128x128, 128x128@2x, icon.icns, icon.ico)

## 6. White-Label Support

- [ ] Read brand from `tauri.conf.json` → `productName` at build time
- [ ] Settings page: let user customize brand name, colors
- [ ] System tray tooltip shows brand name
- [ ] Splash screen with brand logo
- [ ] Build script: `BRAND=acme cargo tauri build` → generates branded binary

## 7. Auto-Updater

- [ ] Generate signing key: `cargo tauri signer generate -w ~/.tauri/clip4clicks.key`
- [ ] Add pubkey to `tauri.conf.json` → `plugins.updater.pubkey`
- [ ] Create release workflow:
  - [ ] `cargo tauri build` → produces installers
  - [ ] Generate `latest.json` manifest
  - [ ] Upload to GitHub releases
  - [ ] Tauri checks on launch → downloads update → installs silently
- [ ] Test: bump version, build, upload, verify auto-update works

## 8. Build & Distribute

- [ ] **First build:** `cargo tauri build` on Linux laptop → `.deb`
- [ ] **Cross-compile Windows:** `cargo tauri build --target x86_64-pc-windows-msvc`
  - Needs: Windows toolchain or CI runner
- [ ] **Cross-compile macOS:** `cargo tauri build --target x86_64-apple-darwin`
  - Needs: macOS machine or CI runner
- [ ] **Android APK:** `cargo tauri build --target aarch64-linux-android`
  - Needs: Android SDK + NDK
- [ ] **CI/CD:** GitHub Actions matrix build (Linux + Windows + macOS + Android)
- [ ] **Distribution:** Whop `new_member` webhook → send download link

## 9. Testing

- [ ] Test offline rendering: disconnect internet, queue a clip, verify yt-dlp + ffmpeg run
- [ ] Test VPS sync: connect, verify clips pull from VPS API
- [ ] Test approve/reject: verify decisions sync back to VPS
- [ ] Test auto-update: publish a new version, verify update flow
- [ ] Test white-label: change brand, rebuild, verify branding appears
- [ ] Test on a clean machine (no ffmpeg installed) — verify sidecar fallback works

## 10. Documentation

- [ ] User guide: how to install, configure VPS URL, queue clips, approve
- [ ] White-label guide: how to rebrand for a reseller
- [ ] Build guide: how to build from source per platform
- [ ] Troubleshooting: sidecar not found, VPS unreachable, render failed

---

## Priority Order

1. **Frontend dashboard** (1) — without this the app is just a backend shell
2. **Bundle sidecars** (2) — needed for local rendering to work
3. **VPS sync** (4) — needed for the online/offline split to function
4. **Local rendering** (3) — the core value prop (offline clip production)
5. **App icons** (5) — polish, not blocker
6. **Auto-updater** (7) — needed before distributing to clients
7. **Build & distribute** (8) — final step before launch
8. **Testing** (9) — ongoing
9. **White-label** (6) — when you have a reseller
10. **Docs** (10) — last

## Estimated Effort

| Item | Time |
|---|---|
| Frontend dashboard | 2-3 days |
| Bundle sidecars | 0.5 day |
| Local rendering | 1-2 days |
| VPS sync | 1 day |
| App icons | 0.5 day |
| White-label | 0.5 day |
| Auto-updater | 0.5 day |
| Build & distribute | 1 day (CI setup) |
| Testing | 1-2 days |
| Docs | 0.5 day |
| **Total** | **~8-11 days** |