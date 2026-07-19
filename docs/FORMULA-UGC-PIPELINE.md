# Formula-UGC & Arbitrage Pipeline — spec

Two new production paths on the **existing** ClipForge review → post spine. Neither
is built yet; this is the design so it's ready when the probe (below) says go.

The thesis: the farm's edge isn't *making* content, it's **sensing** what already
works and **distributing** fast. AI collapses production/localization to ~$0. So we
add two paths:

- **A — `source_foreign`**: import content already proven viral in another market
  (Douyin / Kuaishou / Xiaohongshu / Bilibili) and localize it. Fast, cheap, but
  rights-constrained — this is the *sensor*, not the end state.
- **B — `dna_extract` + `formula_ugc`**: mine proven virals for their reusable DNA
  (hook, beats, cut rhythm, caption style) and produce **original** content on that
  template. Monetization-eligible, no rights/dedup risk — this is the *engine*.

---

## Path A — `source_foreign` (arbitrage / import)

1. **Sense.** Farm accounts on eastern platforms + scrapers watch rising content.
   Score by velocity (views/hr), engagement, and a **universal-legibility** classifier
   (visual/spectacle travels; language/humor-dependent does not).
2. **Ingest.** Download source + metadata + original audio.
3. **Localize.** ASR (zh/ja/ko) → translate (LLM) → re-caption (.ass karaoke) →
   optional TTS / voice-clone dub → reformat vertical 1080×1920 → re-encode and strip
   watermark/logo (crop or inpaint) → new audio bed if needed.
4. **Transform** (beat the "unoriginal" filter): re-encode, re-time, re-caption,
   add branded intro/outro. Genuine transformation, not a re-upload.
5. **Gate.** `pending_review` — human vets rights + quality.
6. **Post.** Hermes → Western accounts, spaced.

Constraints: rights (transform heavily or license — see below), watermark/duplicate
detection, cultural fit. Access to walled platforms = the farm hosts eastern
monitoring accounts.

---

## Path B — `dna_extract` + `formula_ugc` (the durable engine)

### B1. DNA Extractor
- **Input:** a corpus of proven virals (from Path A sensing, or Western top performers).
- **Per clip:** download → ASR transcript → scene/shot segmentation (scene-detect) →
  measure cut rhythm (cuts/min, avg shot length) → extract hook (first 3s: text +
  visual + audio) → caption style → audio/track → CTA / loop structure → engagement metadata.
- **Output:** a structured **template** record —
  `{hook_type, beats[], pacing, caption_style, audio_style, cta, niche, proof_metrics}` —
  stored in a template library, ranked by proven performance.

### B2. Formula-UGC Producer
- **Input:** a template + a target niche / offer / persona.
- Generate an **original** script on the beat structure (LLM, hook-first), then produce one of:
  - **Faceless** (most scalable): TTS or real VO + curated b-roll/stock matched to
    beats → captions in the template's style → cut to the template's pacing.
  - **AI-avatar** (disclosed) or **real talking-head** (rev-share creator bench) reading the script.
- Assemble to the template's cut rhythm; overlay the hook; export vertical.
- **Disclose AI** where the platform requires it.
- **Gate:** `pending_review` → **Post:** Hermes → owned niche pages.

Monetization hooks: tag content for reward-program campaigns; attach affiliate; owned-page brand deals.

---

## Mapping onto the existing codebase

Reuses what's already built:
- `src/production/pipeline.js` (ffmpeg reformat + .ass captions), `integration/asr.js`,
  `integration/llm.js`, `src/production/stockreel.js` (b-roll assembly), the worker
  gates, the MCP tools, Hermes posting, the `pending_review` → `post_queue` spine.

New seams (stubs, graceful-degrading like the rest):
- Modules: `src/production/foreign.js`, `src/production/dna.js`, `src/production/formula.js`;
  `integration/translate.js`, `integration/tts.js`, `integration/scenedetect.js`.
- Queues: `source_foreign_queue`, `dna_queue`, `formula_ugc_queue` → all land in the
  existing review gate.
- DB: `templates` table (the DNA library), `sources` table (sensed foreign content).
- MCP tools: `queue_import`, `extract_dna`, `queue_formula`, `list_templates`.

---

## Probe first — do NOT build yet

Two-week manual test before writing any of the above:
1. Pick **2 universally-legible niches**.
2. Stand up monitoring accounts (east) + a few owned posting accounts (west).
3. Run **find → localize → post** (Path A) and **dna → formula → post** (Path B) by hand.
4. Measure: **mean views/post, hit-rate, time-to-post, account survivability, $ from
   reward programs**.
5. Feed the real numbers into `tools/economics.html`. Wire the code paths only if the
   hit-rate delta clears the target math (base case needs ~14k mean views on 20 warmed
   accounts, or ~30 accounts, to hit $20k/mo).

---

## Risks and the design-arounds

| Risk | Design-around |
|---|---|
| **Rights** (Path A) | Transform heavily; the durable exit is **licensing eastern creators** to become their official Western distributor (rev-share). Path B sidesteps rights entirely. |
| **Platform "AI-slop"/unoriginal crackdown** | Quality bar; disclose AI; prefer high-quality faceless or real talking-head over avatar spam. Original (Path B) is monetization-eligible; reposts often aren't. |
| **Duplicate / watermark downranking** | Genuine transformation (re-encode, re-caption, re-voice, re-cut). |
| **Localization fit** | Universal-legibility classifier gates sourcing. |
| **Walled-platform access** | Farm hosts eastern monitoring accounts. |
