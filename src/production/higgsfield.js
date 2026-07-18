/**
 * ClipForge Higgsfield Producer (generative / SMB spec-ad path)
 *
 * ClipForge has two production paths:
 *   1. Creators WITH footage -> src/production/pipeline.js (yt-dlp + ffmpeg cutting).
 *   2. Local SMBs with NO footage -> generated spec-ad videos (this file).
 *
 * Higgsfield is the generative provider for path #2. This module submits a
 * text-to-video job (optionally seeded from a product URL via "Marketing
 * Studio"), polls the async job to completion, downloads the resulting vertical
 * 9:16 mp4 into the SAME clips/ directory the clip pipeline writes to, and
 * returns an object shaped exactly like a pipeline segment so generated videos
 * flow into the identical downstream human-review gate.
 *
 * Cost policy: default to the CHEAP model (Kling 3.0, ~6 credits) for volume;
 * only reach for expensive models (Sora 2 / Veo, 40-70 credits) when the job
 * explicitly opts in with premium:true.
 *
 * Degrades gracefully: with no HIGGSFIELD_API_KEY it returns a skipped marker
 * instead of throwing, matching the "seam" convention used by pipeline.js.
 *
 * API SHAPE (verified against the official Higgsfield docs, July 2026):
 *   Base URL : https://platform.higgsfield.ai
 *   Auth     : header  Authorization: Key {KEY_ID}:{KEY_SECRET}
 *   Submit   : POST  https://platform.higgsfield.ai/{model_id}
 *              body { prompt, aspect_ratio, resolution, ... }
 *              -> { status, request_id, status_url, cancel_url }
 *   Poll     : GET   https://platform.higgsfield.ai/requests/{request_id}/status
 *              -> { status, video:{url}, images:[{url}] }  (video/images when completed)
 *   Sources  : https://docs.higgsfield.ai/how-to/introduction  (submit + status schema)
 *              https://docs.higgsfield.ai/how-to/sdk           (poll loop + status enum)
 *              https://github.com/higgsfield-ai/higgsfield-js  (auth "Key id:secret", base URL)
 */

const path = require('path');
const fs = require('fs').promises;
const { createWriteStream } = require('fs');
const { Readable } = require('stream');
const { pipeline: streamPipeline } = require('stream/promises');

// Higgsfield API base. Override with HIGGSFIELD_API_BASE if the account is on a
// different region/host. Verified: https://docs.higgsfield.ai/how-to/introduction
const DEFAULT_API_BASE = 'https://platform.higgsfield.ai';

// VERIFY: exact model_id path strings. Higgsfield model ids are path-like
// (e.g. observed in docs: "higgsfield-ai/soul/standard",
// "bytedance/seedream/v4/text-to-image"). The Kling / Sora / Veo text-to-video
// slugs below are our best-sourced guesses from the model catalogue naming and
// should be confirmed against the live "Models" list in the Higgsfield console;
// they are overridable via env so a wrong default never requires a code change.
const DEFAULT_CHEAP_MODEL = 'kling/v3/text-to-video';       // VERIFY: Kling 3.0 (~6 credits) slug
const DEFAULT_PREMIUM_MODEL = 'openai/sora-2/text-to-video'; // VERIFY: Sora 2 (~40-70 credits) slug

class HiggsfieldProducer {
    constructor(config = {}) {
        this.dataDir = config.dataDir || process.env.CLIP_DATA_DIR || '/app/data';
        this.clipsDir = path.join(this.dataDir, 'clips');

        this.apiBase = (config.apiBase || process.env.HIGGSFIELD_API_BASE || DEFAULT_API_BASE)
            .replace(/\/+$/, '');

        // Auth. Higgsfield expects "Key {KEY_ID}:{KEY_SECRET}". Two ways to supply:
        //   - HIGGSFIELD_API_KEY already holds the full "id:secret" pair, OR
        //   - HIGGSFIELD_API_KEY is the id and HIGGSFIELD_API_SECRET the secret.
        this.apiKey = config.apiKey || process.env.HIGGSFIELD_API_KEY || '';
        this.apiSecret = config.apiSecret || process.env.HIGGSFIELD_API_SECRET || '';

        // Model policy (env-overridable; see VERIFY note on defaults above).
        this.cheapModel = config.model || process.env.HIGGSFIELD_MODEL || DEFAULT_CHEAP_MODEL;
        this.premiumModel = config.premiumModel || process.env.HIGGSFIELD_PREMIUM_MODEL || DEFAULT_PREMIUM_MODEL;

        // Poll tuning.
        this.pollIntervalMs = config.pollIntervalMs || Number(process.env.HIGGSFIELD_POLL_INTERVAL_MS) || 5000;
        this.pollTimeoutMs = config.pollTimeoutMs || Number(process.env.HIGGSFIELD_POLL_TIMEOUT_MS) || 10 * 60 * 1000;

        // Output shape defaults: short vertical spec ad.
        this.aspectRatio = config.aspectRatio || '9:16';
        this.resolution = config.resolution || process.env.HIGGSFIELD_RESOLUTION || '720p';
    }

    async ensureDirs() {
        await fs.mkdir(this.clipsDir, { recursive: true });
    }

    /**
     * Build the "Key id:secret" Authorization header value, or null if unset.
     */
    authHeader() {
        if (!this.apiKey) return null;
        // If the key already contains a colon it's the full id:secret pair.
        const credentials = this.apiKey.includes(':') || !this.apiSecret
            ? this.apiKey
            : `${this.apiKey}:${this.apiSecret}`;
        return `Key ${credentials}`;
    }

    /**
     * Generate one spec-ad video for a job and return a pipeline-shaped segment.
     *
     * @param {Object} job - { clipId, clientId, brief?, productUrl?, platforms?, premium? }
     * @returns {Promise<Object>} Either a pipeline segment
     *   { index:0, provider:'higgsfield', model, path, title, captions:{status:'n/a'} }
     *   or a skip marker { status:'skipped', reason } (never throws on missing key).
     */
    async generateSpecAd(job = {}) {
        const auth = this.authHeader();
        if (!auth) {
            return { status: 'skipped', reason: 'no HIGGSFIELD_API_KEY' };
        }

        await this.ensureDirs();

        const model = job.premium === true ? this.premiumModel : this.cheapModel;
        const prompt = this.buildPrompt(job);

        // Submit the async generation job.
        const { requestId, statusUrl } = await this.submit(model, prompt, job, auth);

        // Poll until the video URL is ready (or we time out).
        const videoUrl = await this.pollForVideo(requestId, statusUrl, auth);

        // Download the mp4 into the shared clips/ directory.
        const outName = `${job.clipId || 'gen'}_gen_${Date.now()}.mp4`;
        const outPath = path.join(this.clipsDir, outName);
        await this.download(videoUrl, outPath, auth);

        return {
            index: 0,
            provider: 'higgsfield',
            model,
            path: outPath,
            title: job.brief
                ? `Spec ad: ${String(job.brief).slice(0, 60)}`
                : `Spec ad ${job.clientId || job.clipId || ''}`.trim(),
            // Generated ads carry their own on-screen text; ASR captioning does
            // not apply, so mark n/a (distinct from the clip path's skipped/pending).
            captions: { status: 'n/a' }
        };
    }

    /**
     * Compose the generation prompt from the brief and/or product URL.
     * Higgsfield "Marketing Studio" can seed a video from a product URL; we pass
     * product_url through when present so the platform can scrape it.
     */
    buildPrompt(job) {
        const parts = [];
        if (job.brief) parts.push(String(job.brief));
        if (job.productUrl && !job.brief) {
            parts.push(`Short vertical social ad for the product at ${job.productUrl}.`);
        }
        if (!parts.length) {
            parts.push('Short punchy vertical social media advertisement for a local small business.');
        }
        // Nudge toward the short-form, mobile-first look regardless of source.
        parts.push('Vertical 9:16, fast-paced, high energy, suitable for TikTok/Reels/Shorts.');
        return parts.join(' ');
    }

    /**
     * Submit a generation request.
     * POST {base}/{model_id}  ->  { status, request_id, status_url, cancel_url }
     * Source: https://docs.higgsfield.ai/how-to/introduction
     */
    async submit(model, prompt, job, auth) {
        const url = `${this.apiBase}/${model.replace(/^\/+/, '')}`;

        const body = {
            prompt,
            aspect_ratio: this.aspectRatio,
            resolution: this.resolution
        };
        // VERIFY: "Marketing Studio" product-URL seeding. Field name for passing a
        // product/landing URL is not documented in the public generic-submit
        // schema; product_url is our best guess. Harmless if the model ignores it.
        if (job.productUrl) body.product_url = job.productUrl;

        const res = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': auth,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        if (!res.ok) {
            const text = await res.text().catch(() => '');
            throw new Error(`Higgsfield submit failed (${res.status}) for model "${model}": ${text.slice(0, 300)}`);
        }

        const data = await res.json();
        const requestId = data.request_id || data.id;
        if (!requestId) {
            throw new Error(`Higgsfield submit returned no request_id: ${JSON.stringify(data).slice(0, 300)}`);
        }
        const statusUrl = data.status_url || `${this.apiBase}/requests/${requestId}/status`;
        return { requestId, statusUrl };
    }

    /**
     * Poll the status endpoint until a video URL appears, the job fails, or we
     * exceed pollTimeoutMs.
     * GET {base}/requests/{request_id}/status
     *   -> { status: queued|in_progress|completed|failed|nsfw|cancelled, video:{url}, images:[{url}] }
     * Sources: https://docs.higgsfield.ai/how-to/introduction  (status schema)
     *          https://docs.higgsfield.ai/how-to/sdk           (status enum)
     */
    async pollForVideo(requestId, statusUrl, auth) {
        const url = statusUrl || `${this.apiBase}/requests/${requestId}/status`;
        const deadline = Date.now() + this.pollTimeoutMs;

        for (;;) {
            const res = await fetch(url, {
                method: 'GET',
                headers: { 'Authorization': auth }
            });

            if (!res.ok) {
                const text = await res.text().catch(() => '');
                throw new Error(`Higgsfield status check failed (${res.status}) for ${requestId}: ${text.slice(0, 300)}`);
            }

            const data = await res.json();
            const status = String(data.status || '').toLowerCase();

            if (status === 'completed') {
                const videoUrl = this.extractVideoUrl(data);
                if (!videoUrl) {
                    throw new Error(`Higgsfield job ${requestId} completed but no video URL was found: ${JSON.stringify(data).slice(0, 300)}`);
                }
                return videoUrl;
            }

            if (status === 'failed' || status === 'nsfw' || status === 'cancelled' || status === 'canceled') {
                throw new Error(`Higgsfield job ${requestId} ended as "${status}"`);
            }

            // queued / in_progress / anything else -> keep waiting.
            if (Date.now() >= deadline) {
                throw new Error(`Higgsfield job ${requestId} timed out after ${this.pollTimeoutMs}ms (last status "${status}")`);
            }
            await this.sleep(this.pollIntervalMs);
        }
    }

    /**
     * Pull the mp4 URL out of a completed status payload. The documented shape is
     * { video: { url } }; we also tolerate a couple of plausible variants so a
     * minor field-name change upstream doesn't break the download.
     */
    extractVideoUrl(data) {
        if (data.video && data.video.url) return data.video.url;
        if (typeof data.video === 'string') return data.video;
        if (Array.isArray(data.videos) && data.videos[0]) {
            return data.videos[0].url || data.videos[0];
        }
        // VERIFY: some models surface video under results/output rather than "video".
        if (data.results && data.results.raw && data.results.raw.url) return data.results.raw.url;
        if (data.output && data.output.url) return data.output.url;
        return null;
    }

    /**
     * Stream a remote file to disk. Auth header is sent because completed-asset
     * URLs may be gated; harmless if the CDN URL is public.
     */
    async download(url, outPath, auth) {
        const res = await fetch(url, { headers: auth ? { 'Authorization': auth } : {} });
        if (!res.ok || !res.body) {
            const text = res.ok ? '(empty body)' : await res.text().catch(() => '');
            throw new Error(`Higgsfield download failed (${res.status}) for ${url}: ${String(text).slice(0, 200)}`);
        }
        await streamPipeline(Readable.fromWeb(res.body), createWriteStream(outPath));
        return outPath;
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

module.exports = HiggsfieldProducer;
