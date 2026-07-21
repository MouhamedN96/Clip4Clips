#!/bin/bash
# ============================================
# ClipForge Data Export
# ============================================
# Exports Postgres data + Redis queues to a portable backup.
# Usage: ./scripts/data-export.sh [output-dir]
#
# Output:
#   <output-dir>/clipforge_pg.sql.gz   — full Postgres dump (schema + data)
#   <output-dir>/clipforge_redis.rdb   — Redis snapshot (if redis-cli available)
#   <output-dir>/manifest.txt          — timestamp, versions, row counts
#
# Restore on new VPS: ./scripts/data-import.sh <output-dir>

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
OUT_DIR="${1:-$PROJECT_DIR/backups/$(date +%Y%m%d_%H%M%S)}"

mkdir -p "$OUT_DIR"

echo "[export] ClipForge data export → $OUT_DIR"

# --- Postgres ---
echo "[export] dumping Postgres..."
docker exec clipforge-postgres pg_dump \
  -U clipforge \
  -d clipforge \
  --clean --if-exists --no-owner --no-privileges \
  | gzip > "$OUT_DIR/clipforge_pg.sql.gz"

PG_SIZE=$(du -h "$OUT_DIR/clipforge_pg.sql.gz" | cut -f1)
echo "[export] Postgres: $PG_SIZE"

# --- Redis (queues: clip_queue, post_queue, outreach_queue, etc.) ---
echo "[export] saving Redis..."
REDIS_PASS=$(grep "^REDIS_PASSWORD=" "$PROJECT_DIR/config/.env" | cut -d= -f2)
if [ -n "$REDIS_PASS" ]; then
  # Save RDB snapshot inside container, then copy out
  docker exec clipforge-redis redis-cli -a "$REDIS_PASS" BGSAVE 2>/dev/null
  sleep 2
  docker cp clipforge-redis:/data/dump.rdb "$OUT_DIR/clipforge_redis.rdb" 2>/dev/null \
    && echo "[export] Redis snapshot saved" \
    || echo "[export] Redis snapshot skipped (no data or container missing)"
else
  echo "[export] Redis skipped (no password found)"
fi

# --- Manifest ---
cat > "$OUT_DIR/manifest.txt" << EOF
ClipForge Data Export
=====================
Timestamp: $(date -u +%Y-%m-%dT%H:%M:%SZ)
VPS Host: $(hostname)
Postgres DB: clipforge
Schema: init.sql + migrations

Row counts:
$(docker exec clipforge-postgres psql -U clipforge -d clipforge -t -c "
  SELECT relname || ': ' || n_live_tup
  FROM pg_stat_user_tables
  ORDER BY n_live_tup DESC
  LIMIT 20;
" 2>/dev/null || echo "  (unavailable)")

Restore: ./scripts/data-import.sh $OUT_DIR
EOF

echo "[export] manifest written"
echo ""
echo "Done. Backup at: $OUT_DIR"
echo "Restore on new VPS: ./scripts/data-import.sh $OUT_DIR"