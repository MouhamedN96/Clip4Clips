/**
 * Keyless lead probe — proves free lead discovery works with NO API key.
 *
 * Uses Reddit's public search JSON (just needs a User-Agent). Finds creators
 * publicly asking for an editor/clipper — the exact signal ClipForge outreach
 * targets. This is a standalone demo/tool; in production the operator agent does
 * this via an MCP (Apify Reddit actor / ScrapeCreators), but it shows the path
 * is real and free, not just configured.
 *
 * Usage:  node scripts/leads-probe.mjs
 */

const UA = 'clipforge-leads-probe/1.0 (research)';
const QUERIES = [
    'looking for tiktok editor',
    'need a video editor for youtube',
    'hiring clip editor'
];
const HIRE = /(looking for|need|hiring|searching for|want).*(editor|clipper|clips)/i;

async function searchReddit(q) {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=new&limit=25&raw_json=1`;
    const res = await fetch(url, { headers: { 'User-Agent': UA } });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return (data?.data?.children || []).map(c => c.data);
}

const seen = new Set();
const leads = [];
let blocked = false;

for (const q of QUERIES) {
    try {
        const posts = await searchReddit(q);
        for (const p of posts) {
            if (seen.has(p.id)) continue;
            if (!HIRE.test(p.title || '')) continue;
            seen.add(p.id);
            leads.push({
                title: (p.title || '').slice(0, 70),
                sub: `r/${p.subreddit}`,
                author: `u/${p.author}`,
                ups: p.ups,
                comments: p.num_comments,
                url: `https://reddit.com${p.permalink}`,
                age_h: Math.round((Date.now() / 1000 - p.created_utc) / 3600)
            });
        }
    } catch (e) {
        if (/40[13]/.test(e.message)) blocked = true;
        console.error(`  query "${q}" failed: ${e.message}`);
    }
    await new Promise(r => setTimeout(r, 1500)); // be polite to the public endpoint
}

leads.sort((a, b) => a.age_h - b.age_h);

console.log(`\nKeyless Reddit lead probe — ${leads.length} candidate(s) matching hire signals\n`);
for (const l of leads.slice(0, 15)) {
    console.log(`  • ${l.title}`);
    console.log(`    ${l.sub}  ${l.author}  ↑${l.ups}  💬${l.comments}  ${l.age_h}h ago`);
    console.log(`    ${l.url}`);
}
if (leads.length) {
    console.log(`\nPASS — free, no key, real posts.\n`);
} else if (blocked) {
    console.log(`\nBLOCKED — Reddit returns 403 to unauthenticated/datacenter (VPS) IPs, even with a`);
    console.log(`browser UA. The keyless FETCH works (other open APIs return 200); the useful lead`);
    console.log(`SOURCES don't allow it anymore. Use a managed scraper that proxies + handles anti-bot:`);
    console.log(`  • Apify Reddit actor (free tier) or ScrapeCreators (free tier) via their MCP server.`);
    console.log(`So the free-tier KEY isn't over-engineering — it's what makes this actually run.\n`);
} else {
    console.log(`\nNO MATCHES — endpoint reachable but nothing matched the hire filter.\n`);
}
process.exit(0);
