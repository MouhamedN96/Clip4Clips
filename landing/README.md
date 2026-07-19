# Clip4Clips — marketing landing

The public face for ClipForge (the service) with a CLIPTI Trident teaser. This is
the **public** layer and is completely separate from the private ops API (which
stays Tailscale-only). Nothing here talks to the API.

## What it is

A single self-contained `index.html`. No build step, no external assets:
- Inline CSS + JS, hand-written WebGL hero (a raymarched titanium CLIPTI ring with
  a living, pointer-reactive energy halo), data-URI favicon.
- "Tally" identity: warm graphite, tally-red accent, mono film-slate headlines.
- Spring-physics motion (orchestrated load, magnetic buttons), theme-aware,
  `prefers-reduced-motion` safe.

## Edit it

Open `index.html` and edit directly — it's one file. Common changes:
- Contact email: search `hello@clip4clicks.com` (final CTA + footer note).
- Gallery demos: the `clips` array in the `<script>` (caption, platform, views).
- Ticker copy: the `.ticker .track` spans (keep the two spans identical).

## Deploy on Coolify

The box already runs Coolify, which owns 80/443 and does TLS. Add this as its own
resource so it never collides with the private API.

1. Coolify → New Resource → your Git repo `MouhamedN96/Clip4Clips`, branch `main`.
2. Build pack: **Dockerfile**, base directory `landing/` (uses `landing/Dockerfile`).
3. Set the domain (Porkbun) on the resource → Coolify provisions Let's Encrypt TLS.
4. Porkbun: an **A record** for the domain → the box's public IP.

Deploy. The site is public; the ClipForge API stays private on the tailnet.
