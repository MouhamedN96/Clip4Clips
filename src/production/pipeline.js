/**
 * ClipForge Production Pipeline
 *
 * Turns a long-form source into vertical clips ready for human review.
 * CPU-only: shells out to yt-dlp + ffmpeg (both baked into the Docker image),
 * so it runs on a bare €20 VPS with no GPU.
 *
 * Paid/GPU steps (highlight scoring, ASR captions) are seams: if the relevant
 * key is absent the pipeline degrades gracefully and flags what it skipped,
 * rather than failing. Wire real providers into selectHighlights() / caption().
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const llm = require('../integration/llm');
const asr = require('../integration/asr');

class ProductionPipeline {
    constructor(config = {}) {
        this.dataDir = config.dataDir || process.env.CLIP_DATA_DIR || '/app/data';
        this.clipsDir = path.join(this.dataDir, 'clips');
        this.sourcesDir = path.join(this.dataDir, 'sources');
        this.ytdlpFormat = config.ytdlpFormat || process.env.YTDLP_FORMAT ||
            'bestvideo[ext=mp4]+bestaudio[ext=m4a]/best[ext=mp4]/best';
        this.ffmpegPath = config.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg';
        // Optional ASR provider for burned captions (e.g. fal.ai whisper). Seam only.
        this.asrEndpoint = config.asrEndpoint || process.env.ASR_ENDPOINT;
        this.asrKey = config.asrKey || process.env.ASR_API_KEY;
    }

    async ensureDirs() {
        await fs.mkdir(this.clipsDir, { recursive: true });
        await fs.mkdir(this.sourcesDir, { recursive: true });
    }

    /**
     * Produce clips for one job.
     * @param {Object} job - { clipId, clientId, sourceUrl?, sourcePath?, segments? }
     * @returns {Promise<Array>} produced clips: [{ start, end, title, path, captions }]
     */
    async produce(job) {
        await this.ensureDirs();

        const sourcePath = job.sourcePath || await this.fetchSource(job);
        const segments = job.segments && job.segments.length
            ? job.segments
            : await this.selectHighlights(sourcePath, job);

        const produced = [];
        for (let i = 0; i < segments.length; i++) {
            const seg = segments[i];
            const outName = `${job.clipId || 'clip'}_${i}_${Date.now()}.mp4`;
            const outPath = path.join(this.clipsDir, outName);

            await this.cutVertical(sourcePath, seg.start, seg.end, outPath);
            const captions = await this.caption(outPath, seg);

            produced.push({
                index: i,
                start: seg.start,
                end: seg.end,
                title: seg.title || `Clip ${i + 1}`,
                path: outPath,
                captions
            });
        }

        return produced;
    }

    /**
     * Download source with yt-dlp. Returns local file path.
     */
    async fetchSource(job) {
        if (!job.sourceUrl || !/^https?:\/\//.test(job.sourceUrl)) {
            throw new Error(`No usable source: provide sourcePath or an http(s) sourceUrl (got "${job.sourceUrl}")`);
        }
        const outTemplate = path.join(this.sourcesDir, `${job.clipId || 'src'}_%(id)s.%(ext)s`);
        await this.run('yt-dlp', ['-f', this.ytdlpFormat, '-o', outTemplate, '--no-playlist', job.sourceUrl]);

        // yt-dlp templated the name; find the newest file we just wrote for this job.
        const prefix = `${job.clipId || 'src'}_`;
        const files = (await fs.readdir(this.sourcesDir))
            .filter(f => f.startsWith(prefix))
            .map(f => path.join(this.sourcesDir, f));
        if (!files.length) throw new Error('yt-dlp produced no output file');

        const withTimes = await Promise.all(
            files.map(async f => ({ f, m: (await fs.stat(f)).mtimeMs }))
        );
        withTimes.sort((a, b) => b.m - a.m);
        return withTimes[0].f;
    }

    /**
     * Pick highlight segments.
     *
     * Preferred path: ASR the source to a timestamped transcript, then score
     * candidate windows with DeepSeek (cheap, bulk) and optionally re-rank the
     * finalists with Claude. Returns [{start,end,title,scored:true,score,reason}].
     *
     * Fallback path: if no ASR provider or no DeepSeek key is configured — or
     * anything in the scored path throws — return naive fixed windows so the
     * pipeline is always end-to-end runnable and never throws here.
     */
    async selectHighlights(sourcePath, job) {
        const clipLen = job.clipLength || 30;
        const maxClips = job.maxClips || 3;

        // Only attempt real selection when both halves of the seam are wired.
        if (llm.hasDeepSeek() && asr.asrConfigured({ endpoint: this.asrEndpoint, apiKey: this.asrKey })) {
            try {
                const scored = await this.scoreHighlights(sourcePath, job, clipLen, maxClips);
                if (scored && scored.length) return scored;
                console.warn('[pipeline] scored highlight selection returned nothing; using naive windows');
            } catch (err) {
                console.warn(`[pipeline] highlight scoring failed, falling back to naive windows: ${err.message}`);
            }
        }

        return this.naiveHighlights(sourcePath, clipLen, maxClips);
    }

    /**
     * Naive fixed-window highlights. Always safe; never throws on missing keys.
     */
    async naiveHighlights(sourcePath, clipLen, maxClips) {
        const duration = await this.probeDuration(sourcePath);
        const segments = [];
        for (let t = 0, n = 0; t + clipLen <= duration && n < maxClips; t += clipLen, n++) {
            segments.push({ start: t, end: t + clipLen, title: `Auto segment ${n + 1}`, scored: false });
        }
        // Very short source: take whatever exists.
        if (!segments.length && duration > 0) {
            segments.push({ start: 0, end: Math.min(clipLen, duration), title: 'Auto segment 1', scored: false });
        }
        return segments;
    }

    /**
     * Real highlight selection: transcript -> DeepSeek scoring -> optional
     * Claude re-ranking. Throws on any failure (caller falls back to naive).
     */
    async scoreHighlights(sourcePath, job, clipLen, maxClips) {
        const duration = await this.probeDuration(sourcePath);

        const transcript = await asr.transcribe(sourcePath, {
            granularity: 'segment',
            ffmpegPath: this.ffmpegPath,
            endpoint: this.asrEndpoint,
            apiKey: this.asrKey
        });
        const items = (transcript.items || []).filter(i => Number.isFinite(i.start) && i.text);
        if (!items.length) throw new Error('empty transcript');

        // Compact, line-numbered transcript for the LLM. Cap to keep tokens sane.
        const capped = items.slice(0, 800);
        const lines = capped.map((i, idx) =>
            `[${idx}] ${i.start.toFixed(1)}-${i.end.toFixed(1)}s: ${i.text.replace(/\s+/g, ' ')}`
        ).join('\n');

        // Ask DeepSeek for a generous candidate pool; Claude (if present) trims it.
        const candidateCount = llm.hasClaude() ? Math.max(maxClips * 2, maxClips + 2) : maxClips;
        const sys = 'You are a short-form video editor. You find the most viral, self-contained, ' +
            'emotionally engaging moments in a transcript for vertical clips (TikTok/Reels/Shorts).';
        const user =
            `Transcript segments (index, time range, text):\n${lines}\n\n` +
            `Pick the ${candidateCount} best clip-worthy moments. Each clip should be about ${clipLen}s long ` +
            `(merge adjacent segments as needed) and must start/end on natural boundaries within 0-${Math.floor(duration)}s.\n` +
            `Respond with ONLY JSON of this exact shape:\n` +
            `{"clips":[{"start":<seconds>,"end":<seconds>,"title":"<catchy title>","score":<0-100>,"reason":"<why it's viral>"}]}`;

        const rawDeep = await llm.chatDeepSeek(
            [{ role: 'system', content: sys }, { role: 'user', content: user }],
            { json: true, maxTokens: 2000 }
        );
        let candidates = this.parseClips(llm.parseJSONLoose(rawDeep), duration, clipLen);
        if (!candidates.length) throw new Error('DeepSeek produced no usable clips');

        // Optional final ranking with Claude.
        if (llm.hasClaude() && candidates.length > maxClips) {
            try {
                const rankUser =
                    `Candidate clips:\n${JSON.stringify(candidates)}\n\n` +
                    `Select the single best ${maxClips} for maximum virality and variety. ` +
                    `Respond with ONLY JSON: {"clips":[{"start":..,"end":..,"title":..,"score":..,"reason":..}]}`;
                const rawClaude = await llm.chatClaude(
                    [{ role: 'user', content: rankUser }],
                    { system: sys, maxTokens: 1500 }
                );
                const ranked = this.parseClips(llm.parseJSONLoose(rawClaude), duration, clipLen);
                if (ranked.length) candidates = ranked;
            } catch (err) {
                console.warn(`[pipeline] Claude re-ranking failed, keeping DeepSeek order: ${err.message}`);
            }
        }

        candidates.sort((a, b) => b.score - a.score);
        return candidates.slice(0, maxClips).map((c, idx) => ({
            start: c.start,
            end: c.end,
            title: c.title || `Highlight ${idx + 1}`,
            scored: true,
            score: c.score,
            reason: c.reason || ''
        }));
    }

    /**
     * Validate/normalize LLM clip output into sane {start,end,title,score,reason}.
     */
    parseClips(parsed, duration, clipLen) {
        const arr = Array.isArray(parsed) ? parsed : (parsed && parsed.clips) || [];
        const out = [];
        for (const c of arr) {
            let start = Number(c.start);
            let end = Number(c.end);
            if (!Number.isFinite(start) || !Number.isFinite(end)) continue;
            start = Math.max(0, start);
            if (duration > 0) end = Math.min(end, duration);
            // Guard against zero/negative or absurd lengths.
            if (end <= start) end = Math.min(start + clipLen, duration || start + clipLen);
            if (end - start < 2) continue;
            out.push({
                start,
                end,
                title: typeof c.title === 'string' ? c.title.slice(0, 120) : '',
                score: Number.isFinite(Number(c.score)) ? Number(c.score) : 50,
                reason: typeof c.reason === 'string' ? c.reason.slice(0, 300) : ''
            });
        }
        return out;
    }

    /**
     * Cut [start,end] and reframe to vertical 1080x1920.
     */
    async cutVertical(sourcePath, start, end, outPath) {
        const args = [
            '-y',
            '-ss', String(start),
            '-to', String(end),
            '-i', sourcePath,
            '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
            '-c:a', 'aac', '-b:a', '128k',
            '-movflags', '+faststart',
            outPath
        ];
        await this.run(this.ffmpegPath, args);
        return outPath;
    }

    /**
     * Burn captions into a clip.
     *
     * ASR the clip to word-level timestamps, build an .ass subtitle file, and
     * re-encode with ffmpeg `-vf ass=...`. Returns {status:'done', path} on
     * success. If no ASR provider is configured, skips cleanly. Any failure is
     * returned as {status:'error'} rather than thrown, so one bad caption pass
     * never sinks the whole job.
     */
    async caption(clipPath, seg) {
        if (!asr.asrConfigured({ endpoint: this.asrEndpoint, apiKey: this.asrKey })) {
            return { status: 'skipped', reason: 'no ASR endpoint configured' };
        }

        try {
            const transcript = await asr.transcribe(clipPath, {
                granularity: 'word',
                ffmpegPath: this.ffmpegPath,
                endpoint: this.asrEndpoint,
                apiKey: this.asrKey
            });
            const items = (transcript.items || []).filter(i => Number.isFinite(i.start) && i.text);
            if (!items.length) {
                return { status: 'skipped', reason: 'ASR returned no words' };
            }

            const base = clipPath.replace(/\.mp4$/i, '');
            const assPath = `${base}.ass`;
            await fs.writeFile(assPath, this.buildAss(items), 'utf8');

            const outPath = `${base}_cc.mp4`;
            // The ass filter path must escape ffmpeg's filtergraph metacharacters.
            const escaped = assPath.replace(/\\/g, '\\\\').replace(/:/g, '\\:').replace(/'/g, "\\'");
            await this.run(this.ffmpegPath, [
                '-y',
                '-i', clipPath,
                '-vf', `ass='${escaped}'`,
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
                '-c:a', 'copy',
                '-movflags', '+faststart',
                outPath
            ]);

            await fs.unlink(assPath).catch(() => {});
            return { status: 'done', path: outPath };
        } catch (err) {
            return { status: 'error', reason: err.message };
        }
    }

    /**
     * Build an .ass subtitle file from word/segment items. Groups words into
     * short caption lines (~5 words) for readable, karaoke-style pacing.
     * @param {Array<{start:number,end:number,text:string}>} items
     * @returns {string} ASS document
     */
    buildAss(items) {
        const header = [
            '[Script Info]',
            'ScriptType: v4.00+',
            'PlayResX: 1080',
            'PlayResY: 1920',
            'WrapStyle: 2',
            '',
            '[V4+ Styles]',
            'Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding',
            // White text, thick black outline, bottom-center, large for vertical video.
            'Style: Default,Arial,72,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,-1,0,0,0,100,100,0,0,1,4,2,2,60,60,220,1',
            '',
            '[Events]',
            'Format: Layer, Start, End, Style, MarginL, MarginR, MarginV, Effect, Text'
        ].join('\n');

        const lines = [];
        const groupSize = 5;
        for (let i = 0; i < items.length; i += groupSize) {
            const group = items.slice(i, i + groupSize);
            const start = group[0].start;
            let end = group[group.length - 1].end;
            if (!(end > start)) end = start + 1.5;
            const text = group.map(g => g.text).join(' ')
                .replace(/[\r\n]+/g, ' ')
                .replace(/\{/g, '(').replace(/\}/g, ')'); // {} are ASS override delimiters
            lines.push(`Dialogue: 0,${this.assTime(start)},${this.assTime(end)},Default,,0,0,0,,${text}`);
        }
        return `${header}\n${lines.join('\n')}\n`;
    }

    /**
     * Format seconds as ASS time H:MM:SS.cc (centiseconds).
     */
    assTime(seconds) {
        const s = Math.max(0, seconds);
        const h = Math.floor(s / 3600);
        const m = Math.floor((s % 3600) / 60);
        const sec = Math.floor(s % 60);
        const cs = Math.round((s - Math.floor(s)) * 100);
        const pad = (n, w = 2) => String(n).padStart(w, '0');
        return `${h}:${pad(m)}:${pad(sec)}.${pad(cs)}`;
    }

    /**
     * ffprobe duration in seconds (falls back to 0 if unavailable).
     */
    async probeDuration(sourcePath) {
        try {
            const out = await this.run('ffprobe', [
                '-v', 'error',
                '-show_entries', 'format=duration',
                '-of', 'default=noprint_wrappers=1:nokey=1',
                sourcePath
            ]);
            const secs = parseFloat(out.trim());
            return Number.isFinite(secs) ? secs : 0;
        } catch {
            return 0;
        }
    }

    /**
     * Spawn a command, resolve stdout, reject on non-zero exit.
     */
    run(cmd, args) {
        return new Promise((resolve, reject) => {
            const proc = spawn(cmd, args, { shell: false });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });
            proc.on('close', code => {
                if (code === 0) resolve(stdout);
                else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-500) || stdout.slice(-500)}`));
            });
            proc.on('error', reject);
        });
    }
}

module.exports = ProductionPipeline;
