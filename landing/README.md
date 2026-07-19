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

## Deploy — GitHub Pages (live)

This is the deploy in use. `.github/workflows/deploy-landing.yml` publishes this
folder to GitHub Pages on every push to `main` that touches `landing/`. Edit
`index.html`, push, and it redeploys automatically.

- Live: https://mouhamedn96.github.io/Clip4Clips/
- Free, HTTPS-enforced, on GitHub's CDN. Off the VPS entirely.

### Custom (Porkbun) domain

1. Add a `CNAME` file in this folder containing just the domain (e.g. `clip4clicks.com`).
2. Porkbun DNS:
   - apex (`clip4clicks.com`): four **A** records → `185.199.108.153`,
     `185.199.109.153`, `185.199.110.153`, `185.199.111.153`.
   - or a subdomain (`www`): one **CNAME** → `mouhamedn96.github.io`.
3. Push. GitHub verifies the domain and issues TLS.

## Alternative — Coolify (Dockerfile)

`landing/Dockerfile` (nginx static) is kept for hosting on the box's Coolify
instead: New Resource → repo `MouhamedN96/Clip4Clips`, build pack **Dockerfile**,
base directory `landing/`, set the domain, Coolify does TLS. Use this only if you
want it on the VPS; GitHub Pages is simpler and keeps load off the box.
