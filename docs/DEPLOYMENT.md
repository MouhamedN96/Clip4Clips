# ClipForge VPS Deployment Guide

Complete step-by-step guide for deploying ClipForge on a VPS.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Server Setup](#server-setup)
3. [Deployment](#deployment)
4. [Configuration](#configuration)
5. [Post-Deployment](#post-deployment)
6. [Maintenance](#maintenance)

---

## Prerequisites

### System Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| CPU | 4 cores | 8 cores |
| RAM | 8 GB | 16 GB |
| Storage | 100 GB SSD | 200 GB SSD |
| Bandwidth | 1 TB/month | Unlimited |
| OS | Ubuntu 22.04 LTS | Ubuntu 22.04 LTS |

### Required Services

- Docker 20.10+
- Docker Compose 2.0+
- Nginx (for reverse proxy)
- Certbot (for SSL)

### Domain & DNS

- Registered domain name
- DNS A record pointing to your VPS IP
- Allow 24-48 hours for DNS propagation

---

## Server Setup

### Step 1: Initial Server Configuration

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install essential packages
apt install -y curl git vim unzip fail2ban ufw
```

### Step 2: Install Docker

```bash
# Install Docker
curl -fsSL https://get.docker.com | sh

# Enable Docker
systemctl enable docker

# Add current user to docker group (optional)
usermod -aG docker $USER

# Verify Docker installation
docker --version
```

### Step 3: Install Docker Compose

```bash
# Download Docker Compose
curl -L "https://github.com/docker/compose/releases/latest/download/docker-compose-$(uname -s)-$(uname -m)" -o /usr/local/bin/docker-compose

# Make executable
chmod +x /usr/local/bin/docker-compose

# Verify installation
docker-compose --version
```

### Step 4: Configure Firewall

```bash
# Enable UFW
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8766/tcp  # Hermes WebSocket
ufw enable

# Verify rules
ufw status numbered
```

### Step 5: Create Project Directory

```bash
# Create project directory
mkdir -p /opt/clipforge
cd /opt/clipforge

# Create data directories
mkdir -p data/{last30days,last30days/reports,last30days/library}
mkdir -p logs
mkdir -p backups
```

---

## Deployment

### Step 1: Clone or Copy Project

```bash
cd /opt/clipforge

# If using git
git clone https://github.com/your-org/clipforge-vps.git .

# Or copy files from your local machine
scp -r ./clipforge-vps/* root@your-vps-ip:/opt/clipforge/
```

### Step 2: Configure Environment

```bash
# Copy environment template
cp config/.env.example config/.env

# Edit with your credentials
nano config/.env
```

#### Required Environment Variables

```bash
# Whop Configuration
WHOP_API_KEY=whp_your_api_key
WHOP_WEBHOOK_SECRET=whsec_your_secret
WHOP_MERCHANT_ID=wh_your_merchant_id

# AI Services
DEEPSEEK_API_KEY=sk_your_key
CLAUDE_API_KEY=sk-ant_your_key

# Database
POSTGRES_PASSWORD=your_secure_password

# Redis
REDIS_PASSWORD=your_redis_password

# Hermes Device Farm
HERMES_RELAY_URL=wss://your-relay:8766
HERMES_API_KEY=hermes_your_key

# last30days-skill
BRAVE_SEARCH_KEY=your_brave_key
XQUIK_API_KEY=your_xquik_key
```

### Step 3: Deploy Services

```bash
# Make deployment script executable
chmod +x scripts/deploy.sh

# Run deployment
./scripts/deploy.sh
```

### Step 4: Verify Deployment

```bash
# Check service status
docker compose ps

# View logs
docker compose logs -f clipforge-api

# Test health endpoint
curl http://localhost:3000/health
```

Expected output:
```json
{"status":"healthy","timestamp":"2026-07-17T06:18:18.000Z"}
```

---

## Configuration

### Whop Configuration

1. **Get API Key**
   - Go to https://whop.com/dashboard/developers
   - Create new API key
   - Copy to `WHOP_API_KEY`

2. **Configure Webhooks**
   - Go to Whop Dashboard → Your Whop → Marketing → Webhooks
   - Add webhook URL: `https://your-domain.com/api/webhooks/whop`
   - Subscribe to events:
     - `new_member`
     - `cancelled_subscription`
     - `payment_failed`
     - `refunded`
   - Copy webhook secret to `WHOP_WEBHOOK_SECRET`

3. **Set Up Affiliate Program**
   - Enable affiliate program in Whop dashboard
   - Default commission: 30%
   - Set custom rates for different tiers

### last30days-skill Configuration

1. **Install Skill**
   ```bash
   docker exec -it clipforge-api bash
   npx skills add mvanhorn/last30days-skill -g
   exit
   ```

2. **Configure API Keys**
   ```bash
   # Brave Search (for web results)
   BRAVE_SEARCH_KEY=your_key  # Get at https://brave.com/search/api/

   # X/Twitter API
   XQUIK_API_KEY=your_key  # Or use browser cookies

   # ScrapeCreators (for TikTok/Instagram)
   SCRAPECREATORS_KEY=your_key  # Get at https://scrapecreators.com
   ```

3. **Set Data Directory**
   ```bash
   LAST30DAYS_MEMORY_DIR=/opt/clipforge/data/last30days
   ```

### Hermes Device Farm Configuration

1. **Set Up Relay Server**
   ```bash
   # Install Hermes relay on your VPS
   # See HERMES_SETUP.md for detailed instructions
   ```

2. **Configure Connection**
   ```bash
   HERMES_RELAY_URL=wss://your-vps-ip:8766
   HERMES_API_KEY=your_hermes_key
   HERMES_PHONE_COUNT=48
   ```

3. **Phone Allocation**
   ```
   Tier 1: 12 phones - TikTok US
   Tier 2: 12 phones - TikTok UK/EU
   Tier 3: 12 phones - Instagram + Twitter
   Tier 4: 12 phones - YouTube Shorts
   ```

---

## Post-Deployment

### Step 1: Configure SSL

```bash
# Install Certbot
apt install -y certbot python3-certbot-nginx

# Generate SSL certificate
certbot --nginx -d your-domain.com

# Auto-renewal (should be automatic, but verify)
certbot renew --dry-run
```

### Step 2: Update DNS

Ensure your domain points to your VPS:
```
A record: your-domain.com -> your-vps-ip
```

### Step 3: Test Webhooks

```bash
# Test Whop webhook
curl -X POST https://your-domain.com/api/webhooks/whop \
  -H "Content-Type: application/json" \
  -H "X-Whop-Signature: test" \
  -d '{"event":"test","data":{}}'
```

### Step 4: Verify Integrations

```bash
# Test last30days
docker exec -it clipforge-api bash
last30days "test query" --store
exit

# Test Hermes connection
curl -X POST https://your-vps-ip:8766/health
```

---

## Maintenance

### Regular Commands

```bash
# View all services
docker compose ps

# View logs
docker compose logs -f

# Restart all services
docker compose restart

# Restart specific service
docker compose restart clipforge-api

# Stop all services
docker compose down

# Start all services
docker compose up -d
```

### Database Backup

```bash
# Create backup
docker compose exec postgres pg_dump -U clipforge clipforge > backup_$(date +%Y%m%d).sql

# Restore from backup
cat backup_20260717.sql | docker compose exec -T postgres psql -U clipforge clipforge
```

### Log Management

```bash
# View specific log
docker compose logs -f clipforge-api

# View last 100 lines
docker compose logs --tail=100 clipforge-worker

# Clear old logs
docker compose logs --tail=0 > /dev/null
```

### Update Deployment

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose build
docker compose up -d
```

### Monitor Resources

```bash
# Docker stats
docker stats

# Disk usage
df -h

# Memory usage
free -h

# CPU load
top
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs

# Check environment file
cat config/.env

# Verify .env exists
ls -la config/.env
```

### Database Connection Failed

```bash
# Check PostgreSQL is running
docker compose ps postgres

# Test connection
docker compose exec postgres psql -U clipforge -d clipforge -c "SELECT 1"
```

### Webhook Not Working

```bash
# Verify webhook URL is accessible
curl -I https://your-domain.com/api/webhooks/whop

# Check webhook secret matches
grep WHOP_WEBHOOK_SECRET config/.env
```

### Hermes Connection Timeout

```bash
# Check firewall
ufw status

# Test WebSocket port
curl -I https://your-vps-ip:8766

# Check Hermes relay is running
docker compose logs hermes-relay
```

---

## Security Checklist

- [ ] Change default passwords in `.env`
- [ ] Enable UFW firewall
- [ ] Configure SSL certificate
- [ ] Set up fail2ban
- [ ] Disable root SSH login
- [ ] Use SSH key authentication
- [ ] Regular backups
- [ ] Monitor logs for suspicious activity

---

## Support

For issues or questions:
- GitHub Issues: https://github.com/your-org/clipforge-vps/issues
- Documentation: https://docs.clipforge.com

---

Last updated: July 2026
