/**
 * ClipForge smoke checker.
 *
 * Drives the RUNNING api (HTTP) and asserts state in Postgres, exercising the
 * full spine in dry-run (no external keys needed):
 *   - clip path:   synthetic local video → ffmpeg cut → pending_review
 *   - reel path:   no stock key → graceful skip → failed(reason)
 *   - generate:    no higgsfield key → graceful skip → failed(reason)
 *   - clip gate:   approve → post_queue → dry-run poster → posted
 *   - outreach gate: stage → pending_review → approve → dry-run send → sent
 *
 * Env: API_URL (default http://localhost:3000), plus the POSTGRES and REDIS
 * vars the app already uses. Requires ffmpeg on PATH to build the sample.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const { Pool } = require('pg');

const API = process.env.API_URL || 'http://localhost:3000';
const DATA_DIR = process.env.CLIP_DATA_DIR || '/app/data';
const pool = new Pool({
    host: process.env.POSTGRES_HOST, port: process.env.POSTGRES_PORT,
    database: process.env.POSTGRES_DB, user: process.env.POSTGRES_USER,
    password: process.env.POSTGRES_PASSWORD
});

let passed = 0, failed = 0;
const created = { clips: [], msgs: [] };
const ok = (m) => { passed++; console.log(`  ✓ ${m}`); };
const bad = (m) => { failed++; console.log(`  ✗ ${m}`); };

// When SMOKE_CLEANUP is set (deploy runs it this way), delete the rows this
// smoke created so it never leaves test data in a production database.
async function cleanup() {
    if (!process.env.SMOKE_CLEANUP) return;
    try {
        if (created.clips.length) await pool.query('DELETE FROM clips WHERE id = ANY($1::uuid[])', [created.clips]);
        if (created.msgs.length) await pool.query('DELETE FROM outreach_messages WHERE id = ANY($1::uuid[])', [created.msgs]);
        await fs.unlink(path.join(DATA_DIR, 'sources', 'smoke_sample.mp4')).catch(() => {});
        console.log('  ✓ cleanup: smoke rows removed');
    } catch (e) {
        console.log(`  (cleanup skipped: ${e.message})`);
    }
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const p = spawn(cmd, args, { shell: false });
        let err = '';
        p.stderr.on('data', d => { err += d; });
        p.on('close', c => c === 0 ? resolve() : reject(new Error(`${cmd} ${c}: ${err.slice(-300)}`)));
        p.on('error', reject);
    });
}

async function api(method, endpoint, body) {
    const res = await fetch(`${API}${endpoint}`, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined
    });
    const text = await res.text();
    let json; try { json = JSON.parse(text); } catch { json = { raw: text }; }
    return { status: res.status, json };
}

// Poll a clip row until it reaches one of `wanted` statuses or times out.
async function waitClip(id, wanted, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const { rows } = await pool.query('SELECT status, metadata FROM clips WHERE id = $1', [id]);
        if (rows[0] && wanted.includes(rows[0].status)) return rows[0];
        await sleep(500);
    }
    const { rows } = await pool.query('SELECT status FROM clips WHERE id = $1', [id]);
    throw new Error(`clip ${id} stuck at '${rows[0]?.status}', wanted ${wanted.join('/')}`);
}

async function waitOutreach(id, wanted, timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const { rows } = await pool.query('SELECT status FROM outreach_messages WHERE id = $1', [id]);
        if (rows[0] && wanted.includes(rows[0].status)) return rows[0];
        await sleep(500);
    }
    const { rows } = await pool.query('SELECT status FROM outreach_messages WHERE id = $1', [id]);
    throw new Error(`message ${id} stuck at '${rows[0]?.status}', wanted ${wanted.join('/')}`);
}

// Poll until a worker-created clip row matching `whereSql` appears (rows are
// created inside the worker, so we can't rely on a fixed sleep).
async function waitForClipId(whereSql, timeoutMs = 15000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
        const { rows } = await pool.query(
            `SELECT id FROM clips WHERE ${whereSql} ORDER BY created_at DESC LIMIT 1`);
        if (rows[0]) return rows[0].id;
        await sleep(400);
    }
    return null;
}

async function main() {
    console.log(`\nClipForge smoke — API ${API}\n`);

    // 0. API health
    try {
        const h = await api('GET', '/health');
        h.status === 200 && h.json.status === 'healthy' ? ok(`health (brand: ${h.json.brand})`) : bad(`health: ${JSON.stringify(h.json)}`);
    } catch (e) { bad(`health unreachable: ${e.message}`); throw e; }

    // 1. Build a synthetic 6s sample video with ffmpeg.
    const sampleDir = path.join(DATA_DIR, 'sources');
    await fs.mkdir(sampleDir, { recursive: true });
    const sample = path.join(sampleDir, 'smoke_sample.mp4');
    await run('ffmpeg', ['-y', '-f', 'lavfi', '-i', 'testsrc=duration=6:size=640x480:rate=30',
        '-f', 'lavfi', '-i', 'sine=frequency=440:duration=6',
        '-c:v', 'libx264', '-preset', 'ultrafast', '-c:a', 'aac', '-shortest', sample]);
    ok('synthetic sample built');

    // 2. Clip path → pending_review
    let clipId;
    {
        const r = await api('POST', '/api/clips/generate', { clientId: null, sourcePath: sample, maxClips: 1 });
        r.status === 200 ? ok('clip job queued') : bad(`clip queue: ${JSON.stringify(r.json)}`);
        // The row is created inside the worker; poll for it (clip path = null platform).
        clipId = await waitForClipId("source_platform IS NULL");
        if (clipId) created.clips.push(clipId);
        try {
            const row = await waitClip(clipId, ['pending_review']);
            row.metadata && row.metadata.clipPath ? ok('clip produced → pending_review (has file)') : bad('clip pending_review but no clipPath');
        } catch (e) { bad(e.message); }
    }

    // 3. Reel path (no stock key) → graceful skip → failed(reason)
    {
        await api('POST', '/api/reels/generate', { brief: 'smoke test local business', keywords: 'city' });
        const id = await waitForClipId("source_platform = 'stock'");
        if (id) created.clips.push(id);
        try {
            const row = await waitClip(id, ['failed']);
            (row.metadata?.error || '').includes('stock') ? ok('reel skipped gracefully (no key) → failed w/ reason') : bad(`reel failed reason: ${row.metadata?.error}`);
        } catch (e) { bad(e.message); }
    }

    // 4. Generate path (no higgsfield key) → graceful skip → failed(reason)
    {
        await api('POST', '/api/specads/generate', { brief: 'smoke spec ad' });
        const id = await waitForClipId("source_platform = 'higgsfield'");
        if (id) created.clips.push(id);
        try {
            const row = await waitClip(id, ['failed']);
            (row.metadata?.error || '').toLowerCase().includes('higgsfield') ? ok('generate skipped gracefully (no key) → failed w/ reason') : bad(`generate failed reason: ${row.metadata?.error}`);
        } catch (e) { bad(e.message); }
    }

    // 5. Clip HITL gate: approve → dry-run post → posted
    if (clipId) {
        const r = await api('POST', `/api/clips/${clipId}/approve`, { platforms: ['tiktok'] });
        r.status === 200 ? ok('clip approved (queued for posting)') : bad(`approve: ${JSON.stringify(r.json)}`);
        try {
            const row = await waitClip(clipId, ['posted']);
            row.metadata?.dryRun === true ? ok('dry-run poster fired → posted (dryRun)') : bad(`posted but dryRun=${row.metadata?.dryRun}`);
        } catch (e) { bad(e.message); }
    }

    // 6. Outreach HITL gate: stage → approve → dry-run send → sent
    {
        const staged = await api('POST', '/api/outreach/send',
            { targetHandle: 'smoke_user', targetPlatform: 'tiktok', message: 'hi from smoke' });
        const mid = staged.json.messageId;
        if (mid) created.msgs.push(mid);
        staged.json.status === 'pending_review' && mid ? ok('outreach staged → pending_review') : bad(`stage: ${JSON.stringify(staged.json)}`);
        if (mid) {
            const appr = await api('POST', `/api/outreach/${mid}/approve`, {});
            appr.status === 200 ? ok('outreach approved') : bad(`outreach approve: ${JSON.stringify(appr.json)}`);
            try {
                await waitOutreach(mid, ['sent']);
                ok('dry-run DM fired → sent');
            } catch (e) { bad(e.message); }
        }
    }

    await cleanup();
    console.log(`\n${failed === 0 ? 'PASS' : 'FAIL'} — ${passed} passed, ${failed} failed\n`);
    await pool.end();
    process.exit(failed === 0 ? 0 : 1);
}

main().catch(async e => { console.error('smoke crashed:', e.message); await cleanup().catch(() => {}); await pool.end().catch(() => {}); process.exit(2); });
