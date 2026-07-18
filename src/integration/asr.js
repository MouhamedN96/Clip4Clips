/**
 * ClipForge ASR (speech-to-text) integration
 *
 * Dependency-free, uses the global `fetch` (Node 20+). Produces a timestamped
 * transcript from a local audio/video file. Two providers, tried in order:
 *
 *   1. fal.ai Whisper   (FAL_KEY)                    — audio uploaded as a
 *                                                       base64 data URI.
 *   2. Generic OpenAI-compatible /audio/transcriptions
 *                       (ASR_ENDPOINT + ASR_API_KEY) — e.g. self-hosted
 *                                                       whisper, Groq, etc.
 *
 * Both return a normalized `{ text, items: [{start, end, text}] }` where
 * `items` are at the requested granularity ('segment' or 'word').
 *
 * If no provider is configured, asrConfigured() returns false and the caller
 * degrades gracefully (skips captions / falls back to naive highlights).
 */

const { spawn } = require('child_process');
const path = require('path');
const os = require('os');
const fs = require('fs').promises;

const FAL_BASE_URL = process.env.FAL_BASE_URL || 'https://fal.run';
const FAL_WHISPER_PATH = process.env.FAL_WHISPER_PATH || '/fal-ai/whisper';

/**
 * Resolve provider config, letting explicit opts override the environment.
 * @param {Object} [opts]
 */
function resolveConfig(opts = {}) {
    return {
        falKey: opts.falKey || process.env.FAL_KEY,
        endpoint: opts.endpoint || process.env.ASR_ENDPOINT,
        apiKey: opts.apiKey || process.env.ASR_API_KEY,
        asrModel: opts.asrModel || process.env.ASR_MODEL || 'whisper-1',
        ffmpegPath: opts.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg'
    };
}

/**
 * @param {Object} [opts]
 * @returns {boolean} whether any ASR provider is configured.
 */
function asrConfigured(opts = {}) {
    const c = resolveConfig(opts);
    return !!c.falKey || !!(c.endpoint && c.apiKey);
}

/**
 * Spawn a command, resolve on exit 0, reject otherwise.
 */
function run(cmd, args) {
    return new Promise((resolve, reject) => {
        const proc = spawn(cmd, args, { shell: false });
        let stderr = '';
        proc.stderr.on('data', d => { stderr += d.toString(); });
        proc.on('close', code => {
            if (code === 0) resolve();
            else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`));
        });
        proc.on('error', reject);
    });
}

/**
 * Extract mono 16kHz mp3 audio from any media file into a temp file.
 * @returns {Promise<string>} temp mp3 path (caller deletes)
 */
async function extractAudio(mediaPath, ffmpegPath) {
    const out = path.join(os.tmpdir(), `clipforge_asr_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`);
    await run(ffmpegPath, [
        '-y',
        '-i', mediaPath,
        '-vn',
        '-ac', '1',
        '-ar', '16000',
        '-b:a', '64k',
        '-f', 'mp3',
        out
    ]);
    return out;
}

function normNum(v) {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
}

/**
 * Transcribe via fal.ai Whisper. Audio is sent as a base64 data URI, so no
 * separate upload step is needed.
 * @returns {Promise<{text:string, items:Array}>}
 */
async function transcribeFal(mediaPath, granularity, cfg) {
    const audioPath = await extractAudio(mediaPath, cfg.ffmpegPath);
    try {
        const buf = await fs.readFile(audioPath);
        const dataUri = `data:audio/mpeg;base64,${buf.toString('base64')}`;

        const body = {
            audio_url: dataUri,
            task: 'transcribe',
            chunk_level: granularity === 'word' ? 'word' : 'segment'
        };
        if (process.env.ASR_LANGUAGE) body.language = process.env.ASR_LANGUAGE;

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 300000);
        let data;
        try {
            const res = await fetch(`${FAL_BASE_URL}${FAL_WHISPER_PATH}`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Key ${cfg.falKey}`
                },
                body: JSON.stringify(body),
                signal: controller.signal
            });
            const raw = await res.text();
            if (!res.ok) throw new Error(`fal HTTP ${res.status}: ${raw.slice(0, 400)}`);
            data = JSON.parse(raw);
        } finally {
            clearTimeout(timer);
        }

        const chunks = Array.isArray(data?.chunks) ? data.chunks : [];
        const items = [];
        for (const ch of chunks) {
            const ts = ch.timestamp || ch.timestamps || [];
            const start = normNum(ts[0]);
            let end = normNum(ts[1]);
            const text = (ch.text || '').trim();
            if (start == null || !text) continue;
            if (end == null) end = start; // fixed up below
            items.push({ start, end, text });
        }
        // Fill missing/zero end times from the next item's start.
        for (let i = 0; i < items.length; i++) {
            if (items[i].end <= items[i].start) {
                items[i].end = i + 1 < items.length ? items[i + 1].start : items[i].start + 2;
            }
        }
        return { text: data?.text || items.map(i => i.text).join(' '), items };
    } finally {
        await fs.unlink(audioPath).catch(() => {});
    }
}

/**
 * Transcribe via a generic OpenAI-compatible /audio/transcriptions endpoint.
 * Requests verbose_json with segment (and word) timestamps.
 * @returns {Promise<{text:string, items:Array}>}
 */
async function transcribeGeneric(mediaPath, granularity, cfg) {
    const audioPath = await extractAudio(mediaPath, cfg.ffmpegPath);
    try {
        const buf = await fs.readFile(audioPath);
        const form = new FormData();
        form.append('file', new Blob([buf], { type: 'audio/mpeg' }), 'audio.mp3');
        form.append('model', cfg.asrModel);
        form.append('response_format', 'verbose_json');
        form.append('timestamp_granularities[]', granularity === 'word' ? 'word' : 'segment');
        if (process.env.ASR_LANGUAGE) form.append('language', process.env.ASR_LANGUAGE);

        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), 300000);
        let data;
        try {
            const res = await fetch(cfg.endpoint, {
                method: 'POST',
                headers: { 'Authorization': `Bearer ${cfg.apiKey}` },
                body: form,
                signal: controller.signal
            });
            const raw = await res.text();
            if (!res.ok) throw new Error(`ASR HTTP ${res.status}: ${raw.slice(0, 400)}`);
            data = JSON.parse(raw);
        } finally {
            clearTimeout(timer);
        }

        const src = granularity === 'word'
            ? (Array.isArray(data?.words) ? data.words : [])
            : (Array.isArray(data?.segments) ? data.segments : []);

        let items = src.map(s => ({
            start: normNum(s.start),
            end: normNum(s.end),
            text: (s.text || s.word || '').trim()
        })).filter(i => i.start != null && i.end != null && i.text);

        // Fall back to segments if word-level wasn't returned.
        if (!items.length && granularity === 'word' && Array.isArray(data?.segments)) {
            items = data.segments.map(s => ({
                start: normNum(s.start),
                end: normNum(s.end),
                text: (s.text || '').trim()
            })).filter(i => i.start != null && i.end != null && i.text);
        }

        return { text: data?.text || items.map(i => i.text).join(' '), items };
    } finally {
        await fs.unlink(audioPath).catch(() => {});
    }
}

/**
 * Transcribe a local media file to a timestamped transcript.
 * @param {string} mediaPath
 * @param {Object} [opts]
 * @param {'segment'|'word'} [opts.granularity='segment']
 * @param {string} [opts.ffmpegPath]
 * @param {string} [opts.falKey] @param {string} [opts.endpoint] @param {string} [opts.apiKey]
 * @returns {Promise<{text:string, items:Array<{start:number,end:number,text:string}>}>}
 */
async function transcribe(mediaPath, opts = {}) {
    const cfg = resolveConfig(opts);
    const granularity = opts.granularity === 'word' ? 'word' : 'segment';
    if (cfg.falKey) return transcribeFal(mediaPath, granularity, cfg);
    if (cfg.endpoint && cfg.apiKey) return transcribeGeneric(mediaPath, granularity, cfg);
    throw new Error('No ASR provider configured (set FAL_KEY or ASR_ENDPOINT + ASR_API_KEY)');
}

module.exports = {
    asrConfigured,
    transcribe
};
