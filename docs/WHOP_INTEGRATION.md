# Whop Integration Guide

Complete guide for integrating Whop with ClipForge.

---

## Overview

Whop provides:
- **3% transaction fees** (lowest in industry)
- **Native subscription management**
- **Affiliate program** (30% recurring commission)
- **Webhook automation**
- **Global payment coverage** (100+ methods, 195 countries)

---

## Setup

### 1. Create Whop Account

1. Go to https://whop.com/dashboard
2. Sign up / Log in
3. Navigate to Developers section

### 2. Get API Key

```bash
# In Whop Dashboard:
# Developers → API Keys → Create new key
```

Your API key format: `whp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`

### 3. Configure Webhook

1. Go to **Marketing → Webhooks**
2. Click **Add Webhook**
3. Enter URL: `https://your-domain.com/api/webhooks/whop`
4. Select events:
   - `new_member`
   - `cancelled_subscription`
   - `updated_subscription`
   - `payment_failed`
   - `refunded`
5. Copy webhook secret

### 4. Create Your Whop (Product)

1. Go to https://whop.com/sell
2. Create your service listing:
   - Name: "ClipForge Starter/Growth/Viral/Enterprise"
   - Price: $500/$1000/$2000/$5000 per month
   - Features: List your deliverables

---

## Integration Details

### Payment Flow

```
Client subscribes on Whop
        ↓
Whop sends webhook: new_member
        ↓
ClipForge activates client
        ↓
ClipForge starts producing clips
        ↓
Revenue flows to client
        ↓
ClipForge takes commission
```

### Webhook Events

#### new_member

Triggered when a client subscribes to your whop.

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

**Action Taken:**
1. Create client record in database
2. Queue onboarding job
3. Start clip production

#### cancelled_subscription

Triggered when a client cancels.

```json
{
  "event": "cancelled_subscription",
  "data": {
    "id": "mem_abc123",
    "subscription_id": "sub_xyz789",
    "cancelled_at": "2026-07-17T12:00:00Z"
  }
}
```

**Action Taken:**
1. Update client status to 'churned'
2. Stop clip production
3. Send retention email (optional)

#### payment_failed

Triggered when payment fails.

```json
{
  "event": "payment_failed",
  "data": {
    "id": "mem_abc123",
    "subscription_id": "sub_xyz789",
    "failed_at": "2026-07-17T12:00:00Z"
  }
}
```

**Action Taken:**
1. Send notification to client
2. Pause service after grace period

---

## Affiliate Program

### Overview

You can earn commission by:
1. **Referring buyers** to your whop (30% recurring)
2. **Referring sellers** to Whop platform (25% of their transactions)

### Set Up Affiliate Program for Your Whop

1. Go to **Marketing → Affiliates**
2. Enable affiliate program
3. Set default commission rate (30%)
4. Optionally set different rates for:
   - Global affiliates
   - Member affiliates (your existing clients)

### Custom Commission Rates

```javascript
// Example: Set 40% commission for VIP affiliate
await whop.setCustomCommission(
    'wh_your_whop_id',
    'vip-affiliate@example.com',
    40
);
```

### Track Affiliate Performance

```javascript
// Get affiliate statistics
const stats = await whop.getAffiliateStats('affiliate_id');

console.log(stats);
// {
//   totalEarnings: 1500.00,
//   pendingEarnings: 125.00,
//   paidEarnings: 1375.00,
//   totalReferrals: 15,
//   conversionRate: 0.05,
//   earningsPerClick: 2.50
// }
```

---

## API Reference

### Initialize Whop Integration

```javascript
const WhopIntegration = require('./src/integration/whop');

const whop = new WhopIntegration({
    apiKey: process.env.WHOP_API_KEY,
    merchantId: process.env.WHOP_MERCHANT_ID,
    webhookSecret: process.env.WHOP_WEBHOOK_SECRET,
    defaultCommission: 30,
    referralCommission: 25
});
```

### Methods

#### `verifyWebhookSignature(payload, signature)`

Verify incoming webhook authenticity.

```javascript
const isValid = whop.verifyWebhookSignature(
    JSON.stringify(req.body),
    req.headers['x-whop-signature']
);
```

#### `processWebhookEvent(event)`

Process webhook event and return action.

```javascript
const result = await whop.processWebhookEvent(req.body);
// Returns: { action: 'activate_client', email: '...', ... }
```

#### `getSubscription(subscriptionId)`

Get subscription details.

```javascript
const subscription = await whop.getSubscription('sub_xyz789');
```

#### `listSubscriptions(options)`

List all subscriptions.

```javascript
const subscriptions = await whop.listSubscriptions({
    status: 'active',
    limit: 100
});
```

#### `createCheckoutLink(whopId, options)`

Create payment checkout link.

```javascript
const link = await whop.createCheckoutLink('wh_your_whop', {
    email: 'client@example.com',
    successUrl: 'https://your-domain.com/success',
    affiliateCode: 'AFF123'
});
```

#### `getAffiliateStats(affiliateId)`

Get affiliate performance stats.

```javascript
const stats = await whop.getAffiliateStats('affiliate_id');
```

---

## Revenue Calculations

### Service Pricing (Example)

| Tier | Price | Your Revenue (after 3% fee) |
|------|-------|------------------------------|
| Starter | $500/mo | $485.00 |
| Growth | $1,000/mo | $970.00 |
| Viral | $2,000/mo | $1,940.00 |
| Enterprise | $5,000/mo | $4,850.00 |

### Affiliate Earnings

| Referring | Commission | Example |
|-----------|------------|---------|
| New buyer | 30% recurring | $500 × 30% = $150/year |
| New seller | 25% of their transactions | Variable |

---

## Troubleshooting

### Webhooks Not Received

1. Check webhook URL is publicly accessible
2. Verify webhook secret matches
3. Check server logs: `docker compose logs clipforge-api | grep webhook`

### Payment Failures

1. Whop handles most payment issues automatically
2. Monitor `payment_failed` webhooks
3. Send follow-up emails to affected clients

### Commission Not Tracking

1. Verify affiliate program is enabled
2. Check cookie duration (60 days default)
3. Ensure checkout uses correct affiliate code

---

## Best Practices

1. **Enable all webhook events** for complete automation
2. **Set up email notifications** for failed payments
3. **Use tiered pricing** to capture different client segments
4. **Promote affiliate program** to existing clients
5. **Monitor affiliate performance** and adjust commissions

---

## Resources

- Whop Documentation: https://docs.whop.com
- API Reference: https://docs.whop.com/developer/api
- Webhooks: https://docs.whop.com/developer/guides/webhooks
- Affiliate Program: https://docs.whop.com/manage-your-business/growth-marketing/affiliate-program
