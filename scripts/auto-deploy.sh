#!/bin/bash
# ============================================
# ClipForge Auto-Deploy Webhook
# ============================================
# Runs on the VPS — triggered by GitHub webhook or manual pull.
# Pulls latest, rebuilds, and restarts the stack with zero downtime.
#
# Setup:
#   1. Install as systemd timer OR use as webhook target
#   2. GitHub repo → Settings → Webhooks → add push hook pointing at
#      https://your-domain/webhooks/github (or port 9101)
#
# Or run manually: ./scripts/auto-deploy.sh
#
# Environment:
#   CLIPFORGE_DIR (default /opt/clipforge)
#   COMPOSE_FILE (default docker-compose.prod.yml)
#   ENV_FILE (default config/.env)

set -e

PROJECT_DIR="${CLIPFORGE_DIR:-/opt/clipforge}"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ENV_FILE="${ENV_FILE:-config/.env}"

cd "$PROJECT_DIR"

echo "[deploy] $(date -u +%Y-%m-%dT%H:%M:%SZ) starting auto-deploy"

# 1. Pre-deploy backup (export data in case migration breaks something)
echo "[deploy] pre-deploy backup..."
if [ -f scripts/data-export.sh ]; then
  ./scripts/data-export.sh backups/pre-deploy 2>/dev/null || true
fi

# 2. Pull latest
echo "[deploy] pulling latest..."
git pull origin main 2>&1 | tail -3

# 3. Build + restart
echo "[deploy] rebuilding containers..."
docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE" up -d --build 2>&1 | tail -5

# 4. Wait for health
echo "[deploy] waiting for health..."
for i in $(seq 1 30); do
  if curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1; then
    echo "[deploy] API healthy after ${i}s"
    break
  fi
  sleep 2
done

# 5. Verify
if curl -sf http://127.0.0.1:3000/health >/dev/null 2>&1; then
  echo "[deploy] ✅ deploy successful"
  echo "[deploy] $(curl -s http://127.0.0.1:3000/health 2>/dev/null)"
else
  echo "[deploy] ❌ health check failed — check logs: docker compose logs clipforge-api"
  exit 1
fi

# 6. Smoke test
echo "[deploy] running smoke test..."
docker exec -e SMOKE_CLEANUP=1 clipforge-api node scripts/smoke-check.js 2>&1 | tail -5

echo "[deploy] done at $(date -u +%Y-%m-%dT%H:%M:%SZ)"