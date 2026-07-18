# ClipForge VPS Deployment Package

**Autonomous Content Acquisition & Monetization Engine**

Complete production-ready deployment for VPS with Whop integration, last30days-skill, and Hermes device farm support.

---

## Quick Start

```bash
# 1. Clone or download this package
git clone https://github.com/your-org/clipforge-vps.git
cd clipforge-vps

# 2. Configure environment
cp config/.env.example config/.env
nano config/.env  # Fill in your API keys

# 3. Deploy
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        CLIPFORGE VPS                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────────┐    │
│  │   Whop API   │  │ last30days   │  │   Scheduler     │    │
│  │  Integration │  │   Skill      │  │   (Cron Jobs)   │    │
│  └──────┬───────┘  └──────┬───────┘  └────────┬─────────┘    │
│         │                  │                    │               │
│         └──────────────────┼────────────────────┘               │
│                            │                                     │
│                    ┌───────▼────────┐                            │
│                    │  Core Engine   │                            │
│                    │  (AI Pipeline)│                            │
│                    └───────┬────────┘                            │
│                            │                                     │
│         ┌──────────────────┼──────────────────┐                 │
│         │                  │                  │                 │
│  ┌──────▼──────┐  ┌──────▼──────┐  ┌──────▼──────┐          │
│  │  Production │  │  Outreach   │  │  Analytics   │          │
│  │  Engine     │  │  Engine     │  │  Dashboard   │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
│                                                                  │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │              Hermes Device Farm (External)              │   │
│  │              48 Phones via WebSocket Relay              │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Features

### Core Components

| Component | Description |
|-----------|-------------|
| **Whop Integration** | Payment processing, subscription management, webhooks, affiliate tracking |
| **last30days-skill** | Creator intelligence, trend monitoring, competitor analysis |
| **Production Engine** | AI-powered clip creation, captioning, rendering |
| **Outreach Engine** | Hermes DM automation, personalized messaging |
| **Analytics Dashboard** | Real-time metrics, revenue tracking, client reports |

### Supported Platforms

- TikTok Creator Rewards
- YouTube Shorts
- Instagram Reels
- Twitch/Kick Streams
- Podcast clips

### Payment Infrastructure

| Platform | Fee | Status |
|----------|-----|--------|
| Whop | 3% | Primary |
| LemonSqueezy | 5% | Alternative |
| Stripe | 2.9% + $0.30 | Direct |

---

## Prerequisites

### System Requirements

- **OS**: Ubuntu 22.04 LTS (recommended)
- **CPU**: 4+ cores
- **RAM**: 8GB minimum (16GB recommended)
- **Storage**: 100GB+ SSD
- **Network**: Static IP, open ports 80/443/8766

### Required Services

- Docker & Docker Compose
- Redis (included in docker-compose)
- PostgreSQL 15 (included in docker-compose)

---

## Installation

### Step 1: Server Setup

```bash
# SSH into your VPS
ssh root@your-vps-ip

# Update system
apt update && apt upgrade -y

# Install prerequisites
apt install -y curl git nginx certbot python3-certbot-nginx

# Install Docker
curl -fsSL https://get.docker.com | sh
systemctl enable docker
```

### Step 2: Clone & Configure

```bash
# Clone repository
git clone https://github.com/your-org/clipforge-vps.git /opt/clipforge
cd /opt/clipforge

# Copy environment template
cp config/.env.example config/.env

# Edit configuration
nano config/.env
```

### Step 3: Required Environment Variables

```bash
# Whop Configuration
WHOP_API_KEY=whp_xxxxxxxxxxxxxx
WHOP_WEBHOOK_SECRET=whsec_xxxxxxxxxxxxxx
WHOP_MERCHANT_ID=wh_xxxxxxxxxxxxxx

# AI Services
DEEPSEEK_API_KEY=sk-xxxxxxxxxxxxxx
DEEPSEEK_BASE_URL=https://api.deepseek.com
CLAUDE_API_KEY=sk-ant-xxxxxxxxxxxxxx

# Hermes Device Farm
HERMES_RELAY_URL=wss://your-relay-server:8766
HERMES_API_KEY=hermes_xxxxxxxxxxxxxx

# Database
POSTGRES_PASSWORD=your_secure_password

# Redis
REDIS_PASSWORD=your_redis_password

# last30days-skill
LAST30DAYS_MEMORY_DIR=/opt/clipforge/data/last30days
BRAVE_SEARCH_KEY=xxxxxxxxxxxxxx
XQUIK_API_KEY=xxxxxxxxxxxxxx

# Notification
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/xxx
```

### Step 4: Deploy

```bash
# Run deployment script
chmod +x scripts/deploy.sh
./scripts/deploy.sh
```

---

## Services

### Container Overview

| Service | Port | Description |
|---------|------|-------------|
| clipforge-api | 3000 | Main API server |
| clipforge-worker | - | Background job processor |
| clipforge-scheduler | - | Cron job scheduler |
| redis | 6379 | Cache & queues |
| postgres | 5432 | Primary database |
| nginx | 80/443 | Reverse proxy |
| last30days | - | Intelligence engine |

### Service Management

```bash
# View all services
docker compose ps

# View logs
docker compose logs -f clipforge-api

# Restart service
docker compose restart clipforge-api

# Stop all
docker compose down

# Start all
docker compose up -d
```

---

## API Endpoints

### Whop Integration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/webhooks/whop` | POST | Receive Whop webhooks |
| `/api/subscriptions` | GET | List active subscriptions |
| `/api/subscriptions/:id` | GET | Get subscription details |
| `/api/affiliates/stats` | GET | Affiliate statistics |

### last30days Integration

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/intelligence/search` | POST | Run last30days query |
| `/api/intelligence/trends` | GET | Current trends |
| `/api/intelligence/discover` | GET | Discover new topics |
| `/api/creators/discover` | POST | Find target creators |

### Production

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/clips/generate` | POST | Generate new clip |
| `/api/clips/queue` | GET | View clip queue |
| `/api/clips/:id/status` | GET | Clip status |

### Outreach

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/outreach/send` | POST | Send DM via Hermes |
| `/api/outreach/templates` | GET | Message templates |
| `/api/outreach/analytics` | GET | Outreach metrics |

---

## last30days-skill Integration

### Installation (within container)

```bash
# Access container shell
docker exec -it clipforge-api bash

# Install last30days-skill
npx skills add mvanhorn/last30days-skill -g

# Or manual install
git clone https://github.com/mvanhorn/last30days-skill.git /opt/last30days
ln -s /opt/last30days/skills/last30days ~/.claude/skills/last30days
```

### Usage Examples

```bash
# Find creators looking for editors
last30days "looking for TikTok editor" --store --emit=json

# Analyze competitor
last30days "Opus Clip vs Munch" --competitors

# Track trends
last30days "what's trending in gaming streams" --discover

# YouTube channel analysis
last30days "channel:SomeGamingChannel" --github-user=not_needed
```

### Automated Intelligence Queries

```bash
# Add to cron (runs every 6 hours)
0 */6 * * * cd /opt/clipforge && last30days "need video editor" --store

# Daily trend report
0 8 * * * cd /opt/clipforge && last30days "TikTok viral sounds" --store --emit=json
```

---

## Whop Webhook Configuration

### Setup

1. Go to Whop Dashboard → Your Whop → Marketing → Webhooks
2. Add webhook URL: `https://your-domain.com/api/webhooks/whop`
3. Subscribe to events:
   - `new_member`
   - `cancelled_subscription`
   - `payment_failed`
   - `refunded`

### Event Handling

```javascript
// Example webhook payload
{
  "event": "new_member",
  "data": {
    "id": "mem_xxxxxxxxxxxxxx",
    "email": "creator@example.com",
    "plan": "starter",
    "created_at": "2026-07-17T12:00:00Z"
  }
}
```

---

## Hermes Device Farm Integration

### Connection Setup

```bash
# Configure Hermes relay
export HERMES_RELAY_URL=wss://your-vps:8766
export HERMES_API_KEY=hermes_xxxxxxxxxxxxxx

# Test connection
curl -X POST https://your-vps:8766/health
```

### Phone Farm Allocation

| Tier | Phones | Accounts | Purpose |
|------|--------|----------|---------|
| Tier 1 | 12 | TikTok US | Gaming clips |
| Tier 2 | 12 | TikTok UK/EU | Regional content |
| Tier 3 | 12 | Instagram + Twitter | Visual content |
| Tier 4 | 12 | YouTube Shorts | Long-tail |

---

## Monitoring & Logs

### View Real-time Logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f clipforge-api
docker compose logs -f clipforge-worker

# last30days queries
docker compose logs -f last30days
```

### Health Checks

```bash
# API health
curl https://your-domain.com/health

# Database connection
docker exec clipforge-api node -e "require('./src/utils/db').healthCheck()"

# Redis connection
docker exec clipforge-api node -e "require('./src/utils/redis').healthCheck()"
```

---

## Security

### Firewall Setup

```bash
# UFW configuration
ufw allow 22/tcp    # SSH
ufw allow 80/tcp    # HTTP
ufw allow 443/tcp   # HTTPS
ufw allow 8766/tcp  # Hermes WebSocket
ufw enable
```

### SSL Certificate

```bash
# Let's Encrypt
certbot --nginx -d your-domain.com
```

### Secrets Management

```bash
# Use Docker secrets for sensitive data
echo "your-secret" | docker secret create clipforge_db_password -
```

---

## Troubleshooting

### Common Issues

| Issue | Solution |
|-------|----------|
| Container won't start | Check `.env` file exists and is valid |
| Whop webhooks failing | Verify webhook URL is accessible |
| Hermes connection timeout | Check firewall and relay URL |
| last30days not working | Ensure API keys are set |
| Database connection error | Check POSTGRES_HOST in `.env` |

### Debug Mode

```bash
# Enable debug logging
echo "LOG_LEVEL=debug" >> config/.env
docker compose restart clipforge-api
```

### Reset Database

```bash
# WARNING: Destroys all data
docker compose down -v
docker volume rm clipforge-vps_postgres_data
docker compose up -d
```

---

## Documentation

| Document | Description |
|----------|-------------|
| [DEPLOYMENT.md](docs/DEPLOYMENT.md) | Detailed deployment guide |
| [API.md](docs/API.md) | API reference documentation |
| [WHOP_INTEGRATION.md](docs/WHOP_INTEGRATION.md) | Whop setup & webhooks |
| [LAST30DAYS.md](docs/LAST30DAYS.md) | last30days-skill guide |
| [HERMES_SETUP.md](docs/HERMES_SETUP.md) | Device farm configuration |
| [TROUBLESHOOTING.md](docs/TROUBLESHOOTING.md) | Common issues & solutions |

---

## License

MIT License - See [LICENSE](LICENSE) for details.

---

Built with Paperclip AI, DeepSeek V4, Claude, Hermes Android, and FFmpeg.
