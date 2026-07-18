# AGENTS.md — ClipForge operating brief

Entry point for any agent (Claude Code / Codex / Pi) working in or operating this repo.
Read this first, then reach for the right **skill** (`skills/<name>/`) for the task.

## What this is
ClipForge is a small AI clipping/posting operation: 2 people + agents + an Android
phone farm. Three production paths feed one human-review gate; agents drive it through
an MCP server; a content flywheel (persona content → funnel) upsells the done-for-you
service and a turnkey/white-label build. Runs on a €20 Contabo, Tailscale-private.

## Golden rules (do not violate)
1. **Nothing posts or DMs without human approval.** Producing clips/reels/spec-ads and
   staging DMs is autonomous; `approve_clip` / `approve_outreach` require a human OK
   (via Telegram). The gates are the whole point.
2. **AI content is disclosed.** Every persona post carries the platform AI label + a
   natural disclosure. Undisclosed mass AI = demonetized/terminated in 2026.
3. **Account durability is the real cost.** Space out posting; human-reviewed and
   differentiated beats high-volume identical. Don't fingerprint the farm.
4. **Degrade, never crash.** Missing key = that feature runs on fallback/dry-run, not an
   error. The stack must run on a bare box with zero keys.
5. **Verify by running, not by reading.** Bugs here hide from `--check`. Exercise the
   change (`scripts/smoke.sh`), then report what actually happened.

## Which skill to reach for
| Task | Skill |
|---|---|
| Run the fleet: review queue, approve/reject, queue jobs, report status | `clipforge-operator` |
| A fleet DECISION (pricing, ban-proofing, what to cut, gate logic, debugging) | `mental-models-operator` |
| Generate FRESH ideas / unstick a stalled funnel or offer | `creativity` |
| Write or sharpen any script / DM / email / client message | `communication` |
| Write a persona post (mental models / CC / AI systems) | `talking-head-content` |
| Convert audience → done-for-you / turnkey (lead magnet, offer, sequence, CTA) | `upsell-funnel` |

Flow: **creativity** diverges (options) → **mental-models-operator** converges (decide) →
**communication** delivers → feeds **talking-head-content** + **upsell-funnel**; the
operator's real decisions log as lived examples that make the content authentic.

## Architecture at a glance
- **Production (→ `pending_review` gate):** `src/production/pipeline.js` (clip creator
  footage), `stockreel.js` (free Pexels/Pixabay SMB reels), `higgsfield.js` (generative
  spec-ads). Client type picks the path.
- **Gates:** clips + outreach both go `pending_review → approve → farm` (dry-run w/o farm).
- **Control:** `src/mcp/server.mjs` = 13 MCP tools over the HTTP API; runtime-agnostic.
- **Farm:** Hermes (Android over WebSocket/Tailscale). Intelligence = external MCPs
  (ScrapeCreators / Apify / Exa), not in-app — see `config/mcp.example.json`.
- **Data:** Postgres (`clips`, `outreach_messages`, …) + Redis queues
  (`clip_queue`, `generate_queue`, `reel_queue`, `post_queue`, `outreach_queue`).

## Commands
```bash
./scripts/bootstrap.sh        # secrets + brand (run once)
node scripts/preflight.mjs    # readiness matrix: LIVE / FALLBACK / OFF / AGENT
./scripts/deploy.sh           # build → up → migrate → self-verify (preflight + smoke)
bash  scripts/smoke.sh        # end-to-end spine check (dry-run, self-cleaning)
npm run mcp                   # start the MCP server (stdio)
```

## Code conventions
- Node, **CommonJS** in `src/` (the MCP server is ESM `.mjs`). Match surrounding style.
- Prefer the global `fetch` and shelling out to `ffmpeg`/`yt-dlp`; **avoid new npm deps**
  (Dockerfiles run `npm install`, no lockfile).
- Every integration reads `process.env` with fallbacks and degrades gracefully.
- New producers return a pipeline-segment shape and land at `pending_review`.

## Where things live
- `src/production/` producers · `src/mcp/server.mjs` tools · `src/{api,worker,scheduler}/`
- `skills/` the six skills above · `config/mcp.example.json` agent wiring
- `QUICKSTART.md` deploy in 6 steps · `docs/OPERATE.md` operate in depth
