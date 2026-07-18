#!/bin/bash
# ============================================
# ClipForge smoke test
# ============================================
# Proves the whole spine in dry-run (no external API keys needed):
#   clip / reel / generate production → pending_review gate → approve → dry-run post,
#   plus the outreach stage → approve → dry-run send gate.
#
# Assumes the stack is already up (./scripts/deploy.sh) OR that Postgres, Redis
# and the api+worker are reachable via the standard env vars. Runs the checker
# inside the api container so it shares the app's network + data volume.
#
# Usage on the VPS:   ./scripts/smoke.sh
set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_DIR"

echo "[smoke] running checker inside clipforge-api container..."
# The api container has node, the source, ffmpeg, scripts/, and the right env +
# network to reach postgres/redis. Refresh the checker in case it changed locally.
docker compose cp scripts/smoke-check.js clipforge-api:/app/scripts/smoke-check.js 2>/dev/null \
    || docker cp scripts/smoke-check.js clipforge-api:/app/scripts/smoke-check.js || true

# SMOKE_CLEANUP=1 (set by deploy.sh) makes the checker delete its own test rows.
docker compose exec -T -e SMOKE_CLEANUP="${SMOKE_CLEANUP:-}" clipforge-api node scripts/smoke-check.js
