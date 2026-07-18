#!/bin/bash

# ============================================
# ClipForge VPS Deployment Script
# ============================================

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="/opt/clipforge/backups"

echo_step() {
    echo -e "${GREEN}[STEP]${NC} $1"
}

echo_warning() {
    echo -e "${YELLOW}[WARNING]${NC} $1"
}

echo_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Check if running as root
if [[ $EUID -ne 0 ]]; then
   echo_error "This script must be run as root"
   exit 1
fi

# Welcome message
echo "========================================"
echo "  ClipForge VPS Deployment"
echo "========================================"
echo ""

# Step 1: Check prerequisites
echo_step "Checking prerequisites..."

if ! command -v docker &> /dev/null; then
    echo_warning "Docker not found. Installing..."
    curl -fsSL https://get.docker.com | sh
    systemctl enable docker
fi

if ! command -v docker-compose &> /dev/null; then
    echo_warning "Docker Compose not found. Installing..."
    curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose
    chmod +x /usr/local/bin/docker-compose
fi

# Step 2: Create directories
echo_step "Creating directories..."
mkdir -p $PROJECT_DIR/{data,logs,backups}
mkdir -p $PROJECT_DIR/data/{last30days,last30days/reports,last30days/library}
mkdir -p $BACKUP_DIR

# Step 3: Check environment file
echo_step "Checking environment configuration..."
if [ ! -f "$PROJECT_DIR/config/.env" ]; then
    echo_warning "config/.env not found. Run ./scripts/bootstrap.sh first"
    echo_warning "(it generates secrets + branding, then you paste API keys)."
    exit 1
fi

# Step 4: Build Docker images
# Cached build for fast redeploys; pass --no-cache to force a clean rebuild.
echo_step "Building Docker images..."
cd $PROJECT_DIR
docker compose build ${1:-}

# Step 5: Create Docker network
echo_step "Creating Docker network..."
docker network create clipforge-network 2>/dev/null || true

# Step 6: Start services
echo_step "Starting services..."
docker compose up -d

# Step 7: Wait for services
echo_step "Waiting for services to be ready..."
sleep 10

# Step 8: Check service health
echo_step "Checking service health..."

check_service() {
    local service=$1
    local url=$2
    local max_attempts=30
    local attempt=1

    while [ $attempt -le $max_attempts ]; do
        if curl -sf "$url" > /dev/null 2>&1; then
            echo -e "  ${GREEN}✓${NC} $service is healthy"
            return 0
        fi
        echo -e "  ${YELLOW}⏳${NC} Waiting for $service... ($attempt/$max_attempts)"
        sleep 2
        ((attempt++))
    done

    echo -e "  ${RED}✗${NC} $service failed to start"
    return 1
}

# API is HTTP, so curl-checkable. Don't let a failed check abort the whole
# deploy under `set -e` — report and continue.
check_service "ClipForge API" "http://localhost:3000/health" || echo_warning "API not healthy yet; check 'docker compose logs -f clipforge-api'"

# Postgres/Redis speak their own protocols, not HTTP — probe them properly.
if docker compose exec -T postgres pg_isready -U clipforge -d clipforge > /dev/null 2>&1; then
    echo -e "  ${GREEN}✓${NC} PostgreSQL is healthy"
else
    echo_warning "PostgreSQL not ready yet; check 'docker compose logs -f postgres'"
fi

if docker compose exec -T redis redis-cli -a "${REDIS_PASSWORD}" ping 2>/dev/null | grep -q PONG; then
    echo -e "  ${GREEN}✓${NC} Redis is healthy"
else
    echo_warning "Redis not ready yet; check 'docker compose logs -f redis'"
fi

# Step 9: Run database migrations
echo_step "Running database migrations..."
docker compose exec -T postgres psql -U clipforge -d clipforge -f /docker-entrypoint-initdb.d/init.sql 2>/dev/null || true

# Step 9b: Verify — readiness matrix (read-only) + end-to-end smoke (self-cleaning)
echo_step "Verifying deployment..."
docker compose exec -T clipforge-api node scripts/preflight.mjs config/.env \
    || echo_warning "preflight reported issues (see matrix above)"

echo_step "Running end-to-end smoke (dry-run, cleans up its own rows)..."
if SMOKE_CLEANUP=1 bash "$SCRIPT_DIR/smoke.sh"; then
    echo -e "  ${GREEN}✓${NC} smoke passed — spine healthy"
else
    echo_warning "smoke reported failures — check 'docker compose logs -f clipforge-worker'"
fi

# Step 10: Setup SSL (optional)
echo_step "Setting up SSL..."
if [ -f "/etc/letsencrypt/live/$(hostname)/fullchain.pem" ]; then
    echo "SSL certificates found. Copying to nginx..."
    mkdir -p $PROJECT_DIR/docker/ssl
    cp /etc/letsencrypt/live/$(hostname)/fullchain.pem $PROJECT_DIR/docker/ssl/cert.pem
    cp /etc/letsencrypt/live/$(hostname)/privkey.pem $PROJECT_DIR/docker/ssl/key.pem
else
    echo_warning "SSL certificates not found. Run 'certbot --nginx -d your-domain.com' after DNS is configured."
fi

# Step 11: Configure firewall
echo_step "Configuring firewall..."
if command -v ufw &> /dev/null; then
    ufw allow 22/tcp
    ufw allow 80/tcp
    ufw allow 443/tcp
    ufw allow 8766/tcp  # Hermes WebSocket
    ufw --force enable
    echo "Firewall configured."
fi

# Step 12: Setup logrotate
echo_step "Setting up log rotation..."
cat > /etc/logrotate.d/clipforge << EOF
$PROJECT_DIR/logs/*.log {
    daily
    rotate 14
    compress
    delaycompress
    notifempty
    create 0644 root root
}
EOF

# Step 13: Create systemd service (optional)
echo_step "Creating systemd service..."
cat > /etc/systemd/system/clipforge.service << EOF
[Unit]
Description=ClipForge Container Service
Requires=docker.service
After=docker.service

[Service]
Type=oneshot
RemainAfterExit=yes
WorkingDirectory=$PROJECT_DIR
ExecStart=/usr/local/bin/docker compose up -d
ExecStop=/usr/local/bin/docker compose down
TimeoutStartSec=0

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable clipforge.service

# Step 14: Summary
echo ""
echo "========================================"
echo "  Deployment Complete!"
echo "========================================"
echo ""
echo "Services:"
echo "  - ClipForge API: http://localhost:3000"
echo "  - PostgreSQL: localhost:5432"
echo "  - Redis: localhost:6379"
echo ""
echo "Management commands:"
echo "  docker compose ps      - View services"
echo "  docker compose logs -f  - View logs"
echo "  docker compose restart - Restart services"
echo "  docker compose down     - Stop services"
echo ""
echo "Next steps:"
echo "  1. Edit config/.env with your API keys"
echo "  2. Configure SSL: certbot --nginx -d your-domain.com"
echo "  3. Update webhook URLs in Whop dashboard"
echo "  4. Run: systemctl start clipforge"
echo ""
echo "========================================"
