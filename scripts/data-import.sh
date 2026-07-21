#!/bin/bash
# ============================================
# ClipForge Data Import
# ============================================
# Restores Postgres + Redis from an export.
# Usage: ./scripts/data-import.sh <backup-dir>
#
# Prerequisites:
#   - Stack already running (./scripts/deploy.sh or docker-compose.prod.yml up -d)
#   - Backup dir from data-export.sh containing clipforge_pg.sql.gz

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${1:-$PROJECT_DIR/backups/latest}"

if [ ! -f "$BACKUP_DIR/clipforge_pg.sql.gz" ]; then
  echo "[import] ERROR: $BACKUP_DIR/clipforge_pg.sql.gz not found"
  echo "[import] Usage: ./scripts/data-import.sh <backup-dir>"
  exit 1
fi

echo "[import] ClipForge data import ← $BACKUP_DIR"

# Check stack is running
if ! docker ps --format '{{.Names}}' | grep -q clipforge-postgres; then
  echo "[import] ERROR: clipforge-postgres not running. Start the stack first:"
  echo "  docker compose --env-file config/.env -f docker-compose.prod.yml up -d"
  exit 1
fi

# --- Postgres ---
echo "[import] restoring Postgres..."
gunzip -c "$BACKUP_DIR/clipforge_pg.sql.gz" | \
  docker exec -i clipforge-postgres psql -U clipforge -d clipforge 2>&1 | tail -5

echo "[import] Postgres restored"

# --- Redis ---
REDIS_FILE="$BACKUP_DIR/clipforge_redis.rdb"
if [ -f "$REDIS_FILE" ]; then
  echo "[import] restoring Redis..."
  # Stop Redis, replace RDB, restart
  docker stop clipforge-redis 2>/dev/null
  docker cp "$REDIS_FILE" clipforge-redis:/data/dump.rdb
  docker start clipforge-redis 2>/dev/null
  echo "[import] Redis restored"
else
  echo "[import] Redis restore skipped (no snapshot)"
fi

# --- Verify ---
echo ""
echo "[import] Verification — row counts:"
docker exec clipforge-postgres psql -U clipforge -d clipforge -t -c "
  SELECT relname || ': ' || n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC
  LIMIT 20;
" 2>/dev/null

echo ""
echo "Done. Data imported from: $BACKUP_DIR"