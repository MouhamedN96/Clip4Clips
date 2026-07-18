/**
 * MCP server smoke: spawn src/mcp/server.mjs, do the stdio JSON-RPC handshake
 * (initialize → initialized → tools/list), and print the registered tools.
 * Verifies the SDK wiring without needing Postgres/Redis/API up.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const proc = spawn('node', [path.join(root, 'src/mcp/server.mjs')], { stdio: ['pipe', 'pipe', 'inherit'] });

let buf = '';
const pending = {};
proc.stdout.on('data', (d) => {
    buf += d.toString();
    let nl;
    while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg; try { msg = JSON.parse(line); } catch { continue; }
        if (msg.id && pending[msg.id]) pending[msg.id](msg);
    }
});

const send = (obj) => proc.stdin.write(JSON.stringify(obj) + '\n');
const request = (id, method, params) => new Promise((resolve) => { pending[id] = resolve; send({ jsonrpc: '2.0', id, method, params }); });

const fail = (m) => { console.log(`FAIL — ${m}`); proc.kill(); process.exit(1); };

setTimeout(() => fail('timeout waiting for MCP responses'), 8000);

const init = await request(1, 'initialize', {
    protocolVersion: '2024-11-05', capabilities: {}, clientInfo: { name: 'mcp-smoke', version: '1.0.0' }
});
if (!init.result) fail(`initialize: ${JSON.stringify(init.error || init)}`);
console.log(`  ✓ initialize (server: ${init.result.serverInfo?.name} ${init.result.serverInfo?.version})`);

send({ jsonrpc: '2.0', method: 'notifications/initialized' });

const list = await request(2, 'tools/list', {});
const tools = list.result?.tools;
if (!Array.isArray(tools)) fail(`tools/list: ${JSON.stringify(list.error || list)}`);

const expected = ['queue_clip', 'queue_reel', 'queue_specad', 'review_queue', 'approve_clip',
    'reject_clip', 'clip_status', 'outreach_review_queue', 'stage_outreach', 'approve_outreach',
    'reject_outreach', 'list_clients', 'brand'];
const got = tools.map(t => t.name).sort();
const missing = expected.filter(n => !got.includes(n));

console.log(`  ✓ tools/list returned ${tools.length} tools`);
console.log(`    ${got.join(', ')}`);
if (missing.length) fail(`missing tools: ${missing.join(', ')}`);
// Spot-check a schema surfaced correctly.
const approve = tools.find(t => t.name === 'approve_clip');
approve?.inputSchema?.properties?.clipId ? console.log('  ✓ approve_clip exposes clipId input schema') : fail('approve_clip schema missing clipId');

// Optional live call: proves the tool→HTTP forward glue against a running API.
if (process.env.MCP_SMOKE_LIVE) {
    const res = await request(3, 'tools/call', { name: 'brand', arguments: {} });
    const text = res.result?.content?.[0]?.text || '';
    if (res.result && !res.result.isError && text.includes('name')) {
        console.log(`  ✓ live tools/call brand → ${text.replace(/\s+/g, ' ').slice(0, 80)}`);
    } else {
        fail(`live brand call: ${JSON.stringify(res.result || res.error)}`);
    }
}

console.log(`\nPASS — MCP server registers all ${expected.length} tools${process.env.MCP_SMOKE_LIVE ? ' + live call OK' : ''}\n`);
proc.kill();
process.exit(0);
