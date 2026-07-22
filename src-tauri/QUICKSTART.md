# Clip4Clicks Desktop — Quickstart

Internal operator console (Tauri v2). Run it, connect to the VPS, work the review loop.
This is a team tool for reviewing and approving clips; it is not a public product.

## Prerequisites

- **Rust + cargo** (via [rustup](https://rustup.rs)).
- For local **Produce**/rendering: `ffmpeg` and `yt-dlp` on your `PATH`.
- Windows: the MSVC build tools + WebView2 (Tauri prerequisites).

## Run

```bash
git checkout yaatal/windows-desktop-alpha
cargo run --manifest-path src-tauri/Cargo.toml
```

Or, after a build, double-click `src-tauri/target/debug/clip4clicks.exe`.

## First run (up and go)

1. **Settings** → set **VPS API URL** (your tailnet, e.g. `http://100.x.x.x:3000`) and
   the **API key**, then hit **Check VPS** — the status dot goes green.
2. **Sync with VPS** (bottom-left) → pulls the review queue from the API.
3. **Review** → pick platforms per clip, **Approve** / **Reject**. Approvals push to the
   VPS and enqueue posting via the phone farm. Nothing posts without your yes.

## What's wired vs. deferred

**Wired:** native shell, local SQLite (with tests), the operator dashboard
(Review / Produce / Analytics / Settings), and the VPS sync/approve/reject contract.

**Deferred:** bundled ffmpeg/yt-dlp sidecars, AI-scored local rendering (currently a
fixed 10s cut), release app icons, MSI bundling + auto-updater. None block internal use.

## Verify

```bash
cargo check --manifest-path src-tauri/Cargo.toml
cargo test  --manifest-path src-tauri/Cargo.toml
```
