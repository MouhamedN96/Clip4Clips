# Operating ClipForge

Turnkey deploy + operate on a €20 Contabo, mirroring an agent-driven,
Tailscale-private, Telegram-controlled setup. Everything degrades gracefully:
the fleet runs on the bare box with **zero API keys** and lights up feature by
feature as you add them (`node scripts/preflight.mjs` shows exactly what's live).

## 1. Deploy (three commands)

```bash
git clone <repo> /opt/clipforge && cd /opt/clipforge
./scripts/bootstrap.sh          # generates secrets, sets BRAND_NAME/DOMAIN
#   paste API keys into config/.env  (all optional — unset = fallback, not failure)
node scripts/preflight.mjs      # readiness + fallback matrix (LIVE / FALLBACK / OFF)
./scripts/deploy.sh             # builds + brings up the stack
```

## 2. Keys & fallback

| Add this key | Turns on | Without it (fallback) |
|---|---|---|
| `DEEPSEEK_API_KEY` + `FAL_KEY` | AI highlight scoring + burned captions | naive windows, no captions |
| `PEXELS_API_KEY` / `PIXABAY_API_KEY` | free stock-reel SMB path | that path OFF |
| `HIGGSFIELD_API_KEY` | generative spec-ads | that path OFF |
| `HERMES_RELAY_URL` (Tailscale ok) | real posting + DMs | **dry-run** (logs, never sends) |
| `WHOP_API_KEY` | billing + subscription webhooks | billing OFF |

Run `preflight.mjs` any time to see the current picture. Nothing here is fatal —
core clip production (yt-dlp + ffmpeg) is always on, CPU-only.

## 3. Wire it to your agents (the operate layer)

ClipForge exposes a `clipforge` MCP server (`src/mcp/server.mjs`, 13 tools). Copy
the block from `config/mcp.example.json` into Claude Code / Codex / Pi. Then load
the **`clipforge-operator`** skill (`skills/clipforge-operator/`) so the agent knows
the loop and the HITL rules. Your agent already talks to Telegram — approvals and
status reports flow through the channel you own; ClipForge adds no second bot.

Loop: agent runs `review_queue` → posts each item to Telegram → you tap Approve →
agent calls `approve_clip` → posts via Hermes (or dry-run) → reports the result.
Same shape for outreach via `stage_outreach` / `approve_outreach`.

## 4. Networking — Tailscale, zero public ports

- The rack: set `HERMES_RELAY_URL=wss://<rack>.<tailnet>.ts.net:8766`. Phones dial
  out; nothing is exposed publicly.
- The API: set `BIND_ADDRESS` to the Contabo tailnet IP (or `127.0.0.1`) so the API
  is reachable only over the tailnet. Agents + MCP reach it locally.
- Only exception: if you use Whop **webhooks**, that one path needs a public HTTPS
  endpoint (nginx + certbot, already in the stack). Otherwise stay fully private.

## 5. Always-on

`deploy.sh` installs a `clipforge.service` systemd unit for the container stack
(auto-restart on reboot). For the operator agent, run it under a systemd **user**
service with lingering enabled (`loginctl enable-linger`) or a persistent `tmux`
session, so it survives logout and restarts on crash — the standard CC-on-VPS
pattern.

## 6. Daily operation

1. `preflight.mjs` — confirm what's live.
2. Ask the agent to run the loop: it surfaces the review queue to Telegram.
3. Approve/reject from your phone. The farm posts approved items (spaced out —
   account durability is the real cost).
4. `smoke.sh` any time to confirm the spine is healthy end-to-end.
