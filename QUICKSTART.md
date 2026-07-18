# ClipForge Quickstart

Plug-and-play: clone → bootstrap → keys → deploy (self-verifies) → wire your agent →
connect a lead source → point at the rack → operate from Telegram.

You can deploy with **zero API keys** — core clipping runs CPU-only on a €20 box, and
every integration degrades gracefully. Features light up as you add keys; run
`node scripts/preflight.mjs` any time to see what's LIVE / FALLBACK / OFF.

---

## A. Box + deploy (~5 min)

On the Contabo box (already on your tailnet):

```bash
git clone <your-repo> /opt/clipforge && cd /opt/clipforge
./scripts/bootstrap.sh          # generates secrets, asks brand name + domain
nano config/.env                # paste keys (see section B)
node scripts/preflight.mjs      # readiness matrix: LIVE / FALLBACK / OFF per feature
./scripts/deploy.sh             # builds, brings up, then self-verifies (preflight + smoke)
```

`deploy.sh` ends by running the end-to-end smoke (dry-run) and cleaning up its own rows.
Green = the spine works.

---

## B. Minimal keys (in `config/.env`)

Deploy with none, then add cheapest-first. Re-run `preflight.mjs` after editing.

| Key | Unlocks | Without it |
|---|---|---|
| `DEEPSEEK_API_KEY` + `FAL_KEY` | AI highlight scoring + burned captions | naive windows, no captions |
| `PEXELS_API_KEY` | free stock-reel SMB path | that path OFF |
| `HERMES_RELAY_URL=wss://<rack>.<tailnet>.ts.net:8766` | real posting + DMs | dry-run (logs, never sends) |
| `HIGGSFIELD_API_KEY` | generative spec-ads (optional) | that path OFF |
| `WHOP_API_KEY` | billing / subscription webhooks (optional) | billing OFF |

Core secrets (`API_SECRET`, `POSTGRES_PASSWORD`, `REDIS_PASSWORD`) are filled by
`bootstrap.sh` — don't hand-edit them.

---

## C. Wire your agent (Claude Code / Codex / Pi) — the operate layer

Copy the `clipforge` block from `config/mcp.example.json` into your agent's MCP config:

- Local (agent on the same box): `CLIPFORGE_API_URL=http://localhost:3000`
- From your laptop: `CLIPFORGE_API_URL=http://<contabo>.<tailnet>.ts.net:3000`

Then load the operator skill — copy `skills/clipforge-operator/` into your agent's skills
directory. It teaches the produce→review→post loop and the hard rule: **nothing posts or
DMs without human approval via Telegram.** Your agent already talks to Telegram; ClipForge
adds no second bot.

The 13 MCP tools: `queue_clip` / `queue_reel` / `queue_specad`, `review_queue` /
`approve_clip` / `reject_clip` / `clip_status`, `outreach_review_queue` / `stage_outreach`
/ `approve_outreach` / `reject_outreach`, `list_clients`, `brand`.

---

## D. Connect a lead source (free-tier)

Intelligence is NOT built into ClipForge — the agent does it via MCP. Keyless Reddit is
403-blocked from VPS IPs, so use a managed scraper (both have free tiers). Enable one in
the **same** MCP config (blocks are stubbed in `config/mcp.example.json`):

- **ScrapeCreators** (`SCRAPECREATORS_API_KEY`) — creator/lead data across TikTok/IG/YouTube/X, or
- **Apify** (`APIFY_TOKEN`) — Reddit/social scrapers (24k actors).

Flow: agent finds leads → surfaces to Telegram → you vet → `stage_outreach` → approve → farm DMs.

---

## E. Point the farm at the rack (Tailscale)

On the rack host (on your tailnet), run Hermes. Set `HERMES_RELAY_URL` in `.env` to its
tailnet name — phones dial out, nothing exposed publicly. Optionally set `BIND_ADDRESS`
to the Contabo tailnet IP so the API itself is private too.
(Skip STF — Hermes + rack covers device control. Only exception to "no public ports": Whop
webhooks need a public HTTPS endpoint, already handled by the nginx + certbot in the stack.)

---

## F. Always-on + operate

- **Always-on:** `deploy.sh` installs a `clipforge.service` systemd unit (auto-restart on
  reboot). Run your operator agent under a systemd **user** service with lingering
  (`loginctl enable-linger`) or a persistent `tmux` session.
- **Operate:** from Telegram, tell the agent to run the loop — it pulls the review queue,
  shows each clip/DM, you tap Approve, the farm posts (spaced out; account durability is
  the real cost).

---

## Verify any time

```bash
node scripts/preflight.mjs      # what's live vs fallback
bash  scripts/smoke.sh          # end-to-end spine check (dry-run, self-cleaning)
node  scripts/leads-probe.mjs   # is a keyless lead source reachable from this box?
```

See `docs/OPERATE.md` for the detailed version.
