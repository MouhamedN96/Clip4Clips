# last30days-skill Integration Guide

Complete guide for using last30days-skill with ClipForge.

---

## Overview

**last30days-skill** is an AI-powered research tool that searches across multiple platforms:
- Reddit, X/Twitter, YouTube, TikTok
- Hacker News, Polymarket, GitHub
- Instagram, LinkedIn, and more

**GitHub**: https://github.com/mvanhorn/last30days-skill
**Stats**: 52.4k stars, 2,700+ tests

---

## Installation

### Option 1: Via npm (Recommended)

```bash
# Install globally
npx skills add mvanhorn/last30days-skill -g

# Or install locally
npx skills add mvanhorn/last30days-skill
```

### Option 2: Manual Install

```bash
# Clone repository
git clone https://github.com/mvanhorn/last30days-skill.git /opt/last30days

# Create symlink
ln -s /opt/last30days/skills/last30days ~/.claude/skills/last30days
```

### Option 3: Docker Container (Pre-configured)

The `last30days` service is already included in `docker-compose.yml`.

---

## Configuration

### Environment Variables

```bash
# Required for web search
BRAVE_SEARCH_KEY=your_brave_key

# Required for X/Twitter
XQUIK_API_KEY=your_xquik_key
# OR use browser cookies

# Required for TikTok/Instagram/LinkedIn
SCRAPECREATORS_KEY=your_key

# Optional: for Perplexity
PERPLEXITY_API_KEY=your_key

# Data storage directory
LAST30DAYS_MEMORY_DIR=/opt/clipforge/data/last30days
```

### Get API Keys

| Service | Key Location | Cost |
|---------|--------------|------|
| Brave Search | https://brave.com/search/api/ | Free tier: 2,000 queries/month |
| XQUIK | https://xquik.ai | Free tier available |
| ScrapeCreators | https://scrapecreators.com | Free tier: 10,000 calls |

---

## Usage Examples

### Basic Search

```bash
# Search for a topic
last30days "looking for TikTok editor"

# Search and save results
last30days "need video editor Twitch" --store

# JSON output
last30days "Opus Clip review" --emit=json
```

### Discover Trending Topics

```bash
# Discover trending in a category
last30days --discover "AI tools"

# Gaming trends
last30days --discover "gaming streams"

# Podcast trends
last30days --discover "business podcasts"
```

### Competitor Analysis

```bash
# Compare tools
last30days "Opus Clip vs Munch"

# Auto-discover competitors
last30days "ClipForge" --competitors

# Track changes over time
last30days "Opus Clip" --as-of=30d
```

### Creator Analysis

```bash
# Analyze YouTube channel
last30days "channel:SomeGamingChannel"

# Reddit reputation check
last30days "u/CreatorUsername"

# Twitter/X analysis
last30days "from:@CreatorHandle"
```

---

## API Reference

### Initialize in Node.js

```javascript
const Last30DaysIntegration = require('./src/integration/last30days');

const last30days = new Last30DaysIntegration({
    memoryDir: '/opt/clipforge/data/last30days',
    braveSearchKey: process.env.BRAVE_SEARCH_KEY,
    xquikApiKey: process.env.XQUIK_API_KEY,
    scrapeCreatorsKey: process.env.SCRAPECREATORS_KEY
});
```

### Methods

#### `search(query, options)`

Run a search query.

```javascript
const result = await last30days.search('looking for editor', {
    store: true,        // Save to library
    emit: 'json',       // Output format: 'json' or 'markdown'
    saveSuffix: 'leads' // Custom save filename suffix
});

console.log(result);
// {
//   content: "...",
//   format: 'markdown'
// }
```

#### `discover(topic)`

Discover trending topics.

```javascript
const trends = await last30days.discover('gaming trends');
```

#### `compare(query)`

Compare competitors.

```javascript
const comparison = await last30days.compare('Opus Clip vs Munch');
```

#### `findEditorLeads()`

Find creators looking for editors.

```javascript
const leads = await last30days.findEditorLeads();

console.log(leads);
// [
//   {
//     platform: 'reddit',
//     title: 'Looking for TikTok editor for gaming channel',
//     url: 'https://reddit.com/...',
//     upvotes: 42,
//     author: 'Gamer123',
//     type: 'potential_client'
//   },
//   ...
// ]
```

#### `analyzeCreator(handle)`

Analyze a specific creator.

```javascript
const analysis = await last30days.analyzeCreator('SomeGamingChannel');
```

#### `trackTopic(topic)`

Track topic over time.

```javascript
const trends = await last30days.trackTopic('TikTok Creator Rewards');
```

---

## ClipForge Use Cases

### 1. Creator Lead Generation

```javascript
// Automated daily lead search
const leads = await last30days.findEditorLeads();

// Process and queue outreach
for (const lead of leads) {
    await redis.lpush('outreach_queue', JSON.stringify({
        platform: lead.platform,
        handle: lead.author || lead.handle,
        message: generatePersonalizedMessage(lead),
        source: 'last30days'
    }));
}
```

### 2. Competitor Monitoring

```javascript
// Weekly competitor check
const comparisons = [
    'Opus Clip vs Munch',
    'ClipForge vs Opus Clip',
    'AI video clipping tools'
];

for (const comp of comparisons) {
    const result = await last30days.compare(comp);
    await storeCompetitorData(comp, result);
}
```

### 3. Trend Intelligence

```javascript
// Track gaming trends for clip ideas
const gamingTrends = await last30days.discover('gaming');

console.log(gamingTrends);
// Find trending games, sounds, moments

// Track for podcast content
const podcastTrends = await last30days.discover('podcast viral moments');
```

### 4. Client Intelligence

```javascript
// Before outreach, research the target
const clientIntel = await last30days.analyzeCreator(targetHandle);

// Get recent activity, reputation, engagement
const recentMentions = await last30days.search(`mentions of ${targetHandle}`);
```

---

## Scheduled Intelligence

### Cron Jobs

Add to your scheduler for automated intelligence:

```bash
# Every 6 hours: Find new leads
0 */6 * * * last30days "looking for video editor" --store

# Daily at 8 AM: Gaming trends
0 8 * * * last30days --discover "gaming streams" --store --emit=json

# Daily at 10 AM: Competitor analysis
0 10 * * * last30days "Opus Clip vs Munch" --competitors --store
```

### Library Management

```bash
# Search your research library
last30days library search "TikTok editors"

# Generate HTML report
last30days "gaming trends" --store --emit=html

# View library index
last30days library
```

---

## Output Formats

### Markdown (Default)

Human-readable summary with citations.

### JSON

Machine-readable structured data.

```json
{
  "query": "looking for TikTok editor",
  "sources": ["reddit", "twitter"],
  "items": [
    {
      "source": "reddit",
      "title": "...",
      "url": "...",
      "upvotes": 42
    }
  ]
}
```

### HTML

Shareable research report.

```bash
last30days "AI tools comparison" --emit=html --output=report.html
```

---

## Cost Optimization

### Free Sources (No API Key Required)

- Reddit (with real scores)
- Hacker News
- Polymarket
- GitHub
- YouTube (via yt-dlp)
- arXiv
- Techmeme

### Paid Sources

| Source | Key | Free Tier |
|--------|-----|-----------|
| Brave Search | BRAVE_SEARCH_KEY | 2,000/month |
| X/Twitter | XQUIK_API_KEY | Varies |
| TikTok/Instagram | SCRAPECREATORS_KEY | 10,000 calls |

### Cost-Saving Tips

1. **Start with free sources** for initial research
2. **Enable paid sources** only for critical searches
3. **Cache results** with `--store` to avoid re-searching
4. **Use `--as-of=30d`** to compare against historical data

---

## Troubleshooting

### No Results

1. Check API keys are set correctly
2. Verify network connectivity
3. Try different query terms

### Rate Limiting

1. Add delays between searches
2. Use caching (`--store`)
3. Check Brave Search quota: https://brave.com/search/api/

### Permission Errors

```bash
# Fix data directory permissions
chmod -R 755 /opt/clipforge/data/last30days
```

---

## Resources

- GitHub: https://github.com/mvanhorn/last30days-skill
- Documentation: https://github.com/mvanhorn/last30days-skill#readme
- Configuration: https://github.com/mvanhorn/last30days-skill/blob/main/CONFIGURATION.md
- Community: https://github.com/mvanhorn/last30days-skill/discussions
