# ClipForge API Documentation

Complete API reference for ClipForge VPS deployment.

---

## Base URL

```
Production: https://your-domain.com
Local: http://localhost:3000
```

---

## Authentication

Currently uses API secret in header (future: JWT tokens).

```bash
curl -H "X-API-Secret: your-api-secret" https://your-domain.com/api/...
```

---

## Health Check

### GET /health

Check API health status.

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2026-07-17T06:18:18.000Z"
}
```

---

## Webhooks

### POST /api/webhooks/whop

Receive Whop webhook events.

**Headers:**
```
X-Whop-Signature: <webhook-signature>
Content-Type: application/json
```

**Request Body:**
```json
{
  "event": "new_member",
  "data": {
    "id": "mem_abc123",
    "email": "creator@example.com",
    "plan": "starter",
    "subscription_id": "sub_xyz789",
    "created_at": "2026-07-17T12:00:00Z"
  }
}
```

**Supported Events:**
- `new_member`
- `cancelled_subscription`
- `updated_subscription`
- `payment_failed`
- `refunded`

**Response:**
```json
{
  "received": true,
  "action": "activate_client"
}
```

---

## Subscriptions

### GET /api/subscriptions

List all active subscriptions.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| status | string | Filter by status (active, cancelled, paused) |
| limit | number | Max results (default: 50) |

**Response:**
```json
{
  "subscriptions": [
    {
      "id": "sub_xyz789",
      "customer_id": "mem_abc123",
      "email": "creator@example.com",
      "plan": "starter",
      "status": "active",
      "created_at": "2026-07-17T12:00:00Z"
    }
  ]
}
```

### GET /api/subscriptions/:id

Get subscription details.

**Response:**
```json
{
  "id": "sub_xyz789",
  "customer_id": "mem_abc123",
  "email": "creator@example.com",
  "plan": "starter",
  "status": "active",
  "current_period_start": "2026-07-17T12:00:00Z",
  "current_period_end": "2026-08-17T12:00:00Z",
  "cancel_at_period_end": false
}
```

---

## Affiliates

### GET /api/affiliates/stats

Get affiliate statistics.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| affiliateId | string | Affiliate ID |

**Response:**
```json
{
  "totalEarnings": 1500.00,
  "pendingEarnings": 125.00,
  "paidEarnings": 1375.00,
  "totalReferrals": 15,
  "conversionRate": 0.05,
  "earningsPerClick": 2.50
}
```

### POST /api/affiliates/link

Create affiliate link.

**Request Body:**
```json
{
  "whopId": "wh_your_whop",
  "affiliateId": "affiliate_abc123"
}
```

**Response:**
```json
{
  "link": "https://whop.com/checkout/wh_your_whop?affiliate=affiliate_abc123"
}
```

### POST /api/affiliates/commission

Set custom commission rate.

**Request Body:**
```json
{
  "whopId": "wh_your_whop",
  "email": "vip@example.com",
  "commission": 40
}
```

**Response:**
```json
{
  "success": true
}
```

---

## Intelligence (last30days)

### POST /api/intelligence/search

Run last30days search query.

**Request Body:**
```json
{
  "query": "looking for TikTok editor",
  "options": {
    "store": true,
    "emit": "json",
    "saveSuffix": "leads"
  }
}
```

**Response:**
```json
{
  "query": "looking for TikTok editor",
  "sources": ["reddit", "twitter"],
  "items": [
    {
      "source": "reddit",
      "title": "Looking for TikTok editor for gaming channel",
      "url": "https://reddit.com/...",
      "upvotes": 42,
      "author": "Gamer123"
    }
  ],
  "totalItems": 15
}
```

### GET /api/intelligence/trends

Get trending topics.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| topic | string | Topic to track (optional) |

**Response:**
```json
{
  "topic": "gaming trends",
  "trends": [
    {
      "title": "Battle royale games",
      "growth": 150,
      "sentiment": "positive"
    }
  ],
  "cachedAt": "2026-07-17T06:00:00Z"
}
```

### GET /api/intelligence/discover

Discover trending topics.

**Query Parameters:**
| Parameter | Type | Description |
|-----------|------|-------------|
| topic | string | Discovery topic (optional) |

**Response:**
```json
{
  "discovered": [
    {
      "topic": "AI productivity tools",
      "mentions": 1250,
      "sources": ["reddit", "twitter", "hackernews"]
    }
  ]
}
```

### POST /api/creators/discover

Find potential client leads.

**Response:**
```json
{
  "leads": [
    {
      "platform": "reddit",
      "source": "r/Twitch",
      "title": "Looking for editor for 10K channel",
      "url": "https://reddit.com/...",
      "upvotes": 42,
      "author": "Streamer123",
      "type": "potential_client"
    }
  ],
  "count": 25
}
```

---

## Clips

### POST /api/clips/generate

Queue clip generation job.

**Request Body:**
```json
{
  "clientId": "client_uuid",
  "sourceUrl": "https://twitch.tv/videos/123456",
  "platforms": ["tiktok", "youtube"]
}
```

**Response:**
```json
{
  "status": "queued",
  "message": "Clip generation job queued"
}
```

### GET /api/clips/queue

View clip queue.

**Response:**
```json
{
  "queueLength": 15,
  "pending": [
    {
      "clientId": "client_uuid",
      "sourceUrl": "https://twitch.tv/...",
      "queuedAt": "2026-07-17T06:00:00Z"
    }
  ]
}
```

### GET /api/clips/:id/status

Get clip status.

**Response:**
```json
{
  "id": "clip_uuid",
  "clientId": "client_uuid",
  "sourceUrl": "https://twitch.tv/...",
  "title": "Epic Gaming Moment",
  "durationSeconds": 45,
  "status": "approved",
  "views": 0,
  "createdAt": "2026-07-17T06:00:00Z",
  "metadata": {
    "completedAt": "2026-07-17T06:02:30Z"
  }
}
```

---

## Outreach

### POST /api/outreach/send

Queue outreach message.

**Request Body:**
```json
{
  "targetHandle": "@gamer_username",
  "targetPlatform": "tiktok",
  "message": "I made this clip from your stream. Want daily content?",
  "clientId": "client_uuid"
}
```

**Response:**
```json
{
  "status": "queued",
  "message": "Outreach message queued"
}
```

### GET /api/outreach/analytics

Get outreach statistics.

**Response:**
```json
{
  "total_sent": 150,
  "responses": 23,
  "conversions": 5,
  "response_rate": 0.153,
  "conversion_rate": 0.033
}
```

---

## Clients

### GET /api/clients

List all active clients.

**Response:**
```json
{
  "clients": [
    {
      "id": "client_uuid",
      "email": "creator@example.com",
      "name": "Gaming Creator",
      "platform": "twitch",
      "followerCount": 15000,
      "tier": "growth",
      "status": "active",
      "createdAt": "2026-07-01T00:00:00Z"
    }
  ]
}
```

### GET /api/clients/:id

Get client details.

**Response:**
```json
{
  "id": "client_uuid",
  "email": "creator@example.com",
  "name": "Gaming Creator",
  "platform": "twitch",
  "platformId": "channel_123",
  "followerCount": 15000,
  "tier": "growth",
  "revenueModel": "rev_share",
  "commissionRate": 40,
  "whopSubscriptionId": "sub_xyz789",
  "status": "active",
  "createdAt": "2026-07-01T00:00:00Z",
  "updatedAt": "2026-07-17T06:00:00Z"
}
```

---

## Error Responses

All errors return JSON with error message.

### 400 Bad Request
```json
{
  "error": "Invalid parameter",
  "details": "clientId is required"
}
```

### 401 Unauthorized
```json
{
  "error": "Invalid or missing authentication"
}
```

### 404 Not Found
```json
{
  "error": "Resource not found"
}
```

### 500 Internal Server Error
```json
{
  "error": "Internal server error"
}
```

---

## Rate Limits

| Endpoint | Limit |
|----------|-------|
| General API | 100 requests/minute |
| Webhooks | 1000 requests/minute |
| Clip Generation | 10 requests/minute |
| Outreach | 5 requests/minute |

---

## Webhooks Reference

### Whop Webhook Headers

```
X-Whop-Signature: sha256=abc123...
X-Whop-Timestamp: 1710664800
Content-Type: application/json
```

### Webhook Security

All webhook requests include signature verification. The signature is HMAC-SHA256 of the request body using your webhook secret.

```javascript
// Verify signature
const crypto = require('crypto');
const signature = crypto
    .createHmac('sha256', webhookSecret)
    .update(requestBody)
    .digest('hex');

const isValid = crypto.timingSafeEqual(
    Buffer.from(receivedSignature),
    Buffer.from(signature)
);
```

---

## SDK Examples

### JavaScript/Node.js

```javascript
const axios = require('axios');

const api = axios.create({
    baseURL: 'https://your-domain.com',
    headers: { 'X-API-Secret': process.env.API_SECRET }
});

// Create clip
const clip = await api.post('/api/clips/generate', {
    clientId: 'client_uuid',
    sourceUrl: 'https://twitch.tv/videos/123',
    platforms: ['tiktok']
});

// Search intelligence
const results = await api.post('/api/intelligence/search', {
    query: 'looking for editor',
    options: { store: true }
});
```

### Python

```python
import requests

api = requests.Session()
api.headers.update({'X-API-Secret': 'your-secret'})

# Create clip
response = api.post('https://your-domain.com/api/clips/generate', json={
    'clientId': 'client_uuid',
    'sourceUrl': 'https://twitch.tv/videos/123',
    'platforms': ['tiktok']
})

# Search intelligence
results = api.post('https://your-domain.com/api/intelligence/search', json={
    'query': 'looking for editor'
})
```

### cURL

```bash
# Health check
curl https://your-domain.com/health

# Queue clip
curl -X POST https://your-domain.com/api/clips/generate \
  -H "X-API-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"clientId":"uuid","sourceUrl":"https://..."}'

# Intelligence search
curl -X POST https://your-domain.com/api/intelligence/search \
  -H "X-API-Secret: your-secret" \
  -H "Content-Type: application/json" \
  -d '{"query":"looking for editor","options":{"store":true}}'
```

---

## Postman Collection

Import this collection for easy API testing:

```json
{
  "info": {
    "name": "ClipForge API",
    "schema": "https://schema.getpostman.com/json/collection/v2.1.0/collection.json"
  },
  "item": [
    {
      "name": "Health",
      "request": {
        "method": "GET",
        "url": "{{baseUrl}}/health"
      }
    },
    {
      "name": "Intelligence Search",
      "request": {
        "method": "POST",
        "url": "{{baseUrl}}/api/intelligence/search",
        "body": {
          "mode": "raw",
          "raw": "{\"query\":\"looking for editor\"}"
        }
      }
    }
  ]
}
```
