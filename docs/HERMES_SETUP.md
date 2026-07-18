# Hermes Device Farm Setup Guide

Complete guide for setting up Hermes Android device farm integration.

---

## Overview

**Hermes** enables programmatic control of Android devices for:
- Native app DM automation (TikTok, Instagram)
- Content posting
- FYP monitoring
- Multi-account management

**GitHub**: https://github.com/your-org/hermes-android (or your Hermes fork)

---

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                      ClipForge VPS                          │
│  ┌─────────────────┐    ┌─────────────────────────────┐   │
│  │  Hermes Relay   │◄──►│  ClipForge API/Worker      │   │
│  │  (WebSocket)   │    │                             │   │
│  └────────┬────────┘    └─────────────────────────────┘   │
└───────────┼─────────────────────────────────────────────────┘
            │ WebSocket (wss://)
    ┌───────┴───────┐
    │  48 Phones   │
    │  (4 Tiers)   │
    └───────────────┘
```

---

## Hardware Requirements

### Phone Farm Spec

| Component | Spec | Cost (48 phones) |
|-----------|------|-------------------|
| Phones | Samsung A20 (used, bulk) | ~$40 × 48 = $1,920 |
| Rack | 4-tier steel shelving | $300-500 |
| USB Hubs | 4× 16-port powered USB 3.0 | $80 × 4 = $320 |
| Charging | 4× 10-port USB stations | $50 × 4 = $200 |
| PC (relay) | Intel NUC i5 + 16GB | $400 |
| Network | Gigabit switch + WiFi 6 | $150 |
| Proxies | Residential pool (Bright Data) | ~$50/mo |
| **TOTAL** | | **~$3,000 + $50/mo** |

### Phone Allocation

| Tier | Count | Platform | Accounts |
|------|-------|----------|----------|
| 1 | 12 | TikTok US | Gaming clips |
| 2 | 12 | TikTok UK/EU | Regional content |
| 3 | 12 | Instagram + Twitter | Visual content |
| 4 | 12 | YouTube Shorts | Long-tail |

---

## Setup

### Step 1: Install Hermes Relay Server

```bash
# On your VPS
cd /opt
git clone https://github.com/your-org/hermes-relay.git
cd hermes-relay

# Build relay
docker build -t hermes-relay .
docker run -d \
  --name hermes-relay \
  -p 8766:8766 \
  -e API_KEY=your_hermes_key \
  -e MAX_CONNECTIONS=50 \
  hermes-relay
```

### Step 2: Configure Hermes Relay

```bash
# Create config
cat > /etc/hermes/relay.conf << EOF
{
  "server": {
    "port": 8766,
    "ssl": true,
    "cert": "/etc/hermes/ssl/cert.pem",
    "key": "/etc/hermes/ssl/key.pem"
  },
  "security": {
    "api_key_required": true,
    "max_connections_per_key": 50
  },
  "logging": {
    "level": "info",
    "file": "/var/log/hermes/relay.log"
  }
}
EOF
```

### Step 3: Flash Phones with Hermes Bridge

1. **Enable USB debugging** on each phone:
   - Settings → About Phone → Build Number (tap 7 times)
   - Settings → Developer Options → USB Debugging

2. **Install Hermes Bridge APK**:
   ```bash
   # Download APK
   adb install hermes-bridge.apk

   # Or use bulk flashing tool
   ./flash-hermes.sh --all
   ```

3. **Connect to relay**:
   - Open Hermes Bridge app
   - Enter relay URL: `wss://your-vps.com:8766`
   - Enter pairing code: `XXXXXX` (6 characters)

### Step 4: Configure Phone Tiers

```bash
# Assign phones to tiers
cat > /etc/hermes/tiers.json << EOF
{
  "tier1": {
    "name": "TikTok US",
    "platform": "tiktok",
    "region": "US",
    "phones": ["phone-001", "phone-002", ... "phone-012"]
  },
  "tier2": {
    "name": "TikTok EU",
    "platform": "tiktok",
    "region": "EU",
    "phones": ["phone-013", "phone-014", ... "phone-024"]
  },
  "tier3": {
    "name": "Instagram + Twitter",
    "platform": "instagram,twitter",
    "region": "GLOBAL",
    "phones": ["phone-025", "phone-026", ... "phone-036"]
  },
  "tier4": {
    "name": "YouTube Shorts",
    "platform": "youtube",
    "region": "GLOBAL",
    "phones": ["phone-037", "phone-038", ... "phone-048"]
  }
}
EOF
```

### Step 5: Configure Proxies

```bash
# Install proxy rotation
cat > /etc/hermes/proxies.json << EOF
{
  "provider": "brightdata",
  "zone": "your-zone",
  "credentials": {
    "username": "your-username",
    "password": "your-password"
  },
  "rotation": {
    "mode": "session",
    "duration": 300
  }
}
EOF
```

---

## ClipForge Integration

### Environment Variables

```bash
HERMES_RELAY_URL=wss://your-vps-ip:8766
HERMES_API_KEY=hermes_xxxxxxxxxxxxxx
HERMES_PHONE_COUNT=48
HERMES_CONNECTION_TIMEOUT=30000
```

### Initialize Integration

```javascript
const HermesIntegration = require('./src/integration/hermes');

const hermes = new HermesIntegration({
    relayUrl: process.env.HERMES_RELAY_URL,
    apiKey: process.env.HERMES_API_KEY,
    phoneCount: parseInt(process.env.HERMES_PHONE_COUNT),
    timeout: parseInt(process.env.HERMES_CONNECTION_TIMEOUT)
});

// Connect to relay
await hermes.connect();
console.log(`Connected: ${hermes.phones.size} phones available`);
```

---

## Usage Examples

### Send TikTok DM

```javascript
// Get available phone from tier 1
const phone = hermes.getAvailablePhone(1);

// Open TikTok
await hermes.openApp(phone.id, 'com.zhiliaoapp.musically');

// Find user
await hermes.typeText(phone.id, '@target_username');
await hermes.tap(phone.id, 500, 300); // Tap search

// Send DM
await hermes.sendTikTokDM(phone.id, 'target_username', 'Your message here');
```

### Post to Instagram

```javascript
const phone = hermes.getAvailablePhone(3);

await hermes.openApp(phone.id, 'com.instagram.android');
await hermes.postInstagram(phone.id, '/path/to/video.mp4', 'Check out this clip! #viral');
```

### Monitor FYP

```javascript
// Open TikTok and scroll
const phone = hermes.getAvailablePhone(1);

await hermes.openApp(phone.id, 'com.zhiliaoapp.musically');
await hermes.takeScreenshot(phone.id);

// Analyze screen content
const content = await hermes.getScreenContent(phone.id);
console.log('Current FYP:', content);

// Swipe to next video
await hermes.swipe(phone.id, 540, 960, 540, 480);
```

---

## Safety Features

### Rate Limiting

```javascript
// Max 5 DMs per account per day
const MAX_DMS_PER_DAY = 5;

// Delay between actions
const MIN_DELAY_SECONDS = 300; // 5 minutes
```

### Human-Like Behavior

```javascript
// Randomize action timing
function randomDelay(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Randomize tap positions
function randomTap() {
    const x = 500 + Math.floor(Math.random() * 100) - 50;
    const y = 960 + Math.floor(Math.random() * 100) - 50;
    return { x, y };
}
```

### Account Rotation

```javascript
// Rotate phones when rate limited
async function sendWithRotation(targets) {
    for (const target of targets) {
        const phone = hermes.getAvailablePhone(1);

        try {
            await hermes.sendTikTokDM(phone.id, target.username, target.message);
            await randomDelay(300, 600); // 5-10 minutes
        } catch (error) {
            if (error.message.includes('rate_limit')) {
                // Get next phone
                continue;
            }
            throw error;
        }
    }
}
```

---

## Monitoring

### Health Check

```bash
# Check relay health
curl -X POST https://your-vps:8766/health

# Response
{
  "status": "healthy",
  "phones_online": 48,
  "phones_available": 45
}
```

### Phone Status

```javascript
const status = hermes.getAllPhoneStatus();

console.log(status);
// [
//   {
//     id: 'phone-001',
//     status: 'available',
//     tier: 1,
//     platform: 'tiktok',
//     last_seen: '2026-07-17T12:00:00Z'
//   },
//   ...
// ]
```

### Metrics

```javascript
// Track usage
const metrics = await hermes.getMetrics();
console.log(metrics);
// {
//   total_dms_sent: 1523,
//   total_posts: 892,
//   avg_response_time_ms: 2340
// }
```

---

## Troubleshooting

### Phone Not Connecting

1. Check phone is online and Hermes Bridge is running
2. Verify relay URL is correct
3. Check firewall allows port 8766
4. Ensure phone has internet connection

```bash
# Debug connection
adb logcat | grep Hermes
```

### Rate Limited by Platform

1. Rotate to different phone/account
2. Wait for cooldown period
3. Check proxy is working

### Relay Server Down

```bash
# Check relay status
docker ps | grep hermes-relay

# Restart relay
docker restart hermes-relay

# View logs
docker logs -f hermes-relay
```

---

## Maintenance

### Daily

```bash
# Check all phones online
curl -s http://localhost:8766/phones | jq '. | length'

# Verify proxy rotation
curl -s http://localhost:8766/proxies/status
```

### Weekly

```bash
# Update Hermes Bridge on all phones
./update-hermes.sh --all

# Clean old screenshots
find /var/hermes/screenshots -mtime +7 -delete
```

### Monthly

```bash
# Full phone health check
./health-check.sh --all

# Backup configurations
tar -czf hermes-backup-$(date +%Y%m%d).tar.gz /etc/hermes
```

---

## Resources

- Hermes Relay GitHub: https://github.com/your-org/hermes-relay
- Hermes Bridge APK: https://github.com/your-org/hermes-bridge
- Documentation: https://docs.clipforge.com/hermes
