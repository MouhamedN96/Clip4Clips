/**
 * ClipForge Stock-Reel Producer (free / $0-COGS SMB path)
 *
 * The third production path, beside:
 *   1. pipeline.js   — clip existing creator footage (yt-dlp + ffmpeg)
 *   2. higgsfield.js — generative spec ads (paid credits)
 *   3. stockreel.js  — THIS: assemble a vertical "faceless" reel from FREE stock
 *                      footage (Pexels/Pixabay) over an AI-written script.
 *
 * Pattern lifted (clean-room, no forked code) from MoneyPrinterTurbo: script ->
 * per-scene stock clips -> normalize to 1080x1920 -> concat -> burn captions.
 * Reserves Higgsfield credits for premium; this path costs nothing but API-free
 * stock and a cheap DeepSeek script call.
 *
 * Degrades gracefully: with no stock provider key it returns a skipped marker
 * instead of throwing. Returns a pipeline-segment-shaped object so the reel
 * flows into the same human-review gate as every other path.
 */

const { spawn } = require('child_process');
const path = require('path');
const fs = require('fs').promises;
const llm = require('../integration/llm');

class StockReelProducer {
    constructor(config = {}) {
        this.dataDir = config.dataDir || process.env.CLIP_DATA_DIR || '/app/data';
        this.clipsDir = path.join(this.dataDir, 'clips');
        this.stockDir = path.join(this.dataDir, 'stock');
        this.ffmpegPath = config.ffmpegPath || process.env.FFMPEG_PATH || 'ffmpeg';
        this.pexelsKey = config.pexelsKey || process.env.PEXELS_API_KEY;
        this.pixabayKey = config.pixabayKey || process.env.PIXABAY_API_KEY;
    }

    hasStock() {
        return !!(this.pexelsKey || this.pixabayKey);
    }

    async ensureDirs() {
        await fs.mkdir(this.clipsDir, { recursive: true });
        await fs.mkdir(this.stockDir, { recursive: true });
    }

    /**
     * @param {Object} job - { clipId, clientId, brief?, script?, keywords?,
     *                         sceneDuration?, maxScenes?, captions?, platforms? }
     * @returns {Promise<Object>} pipeline-segment shape, or a skipped marker.
     */
    async generateReel(job) {
        if (!this.hasStock()) {
            return { status: 'skipped', reason: 'no stock provider key (PEXELS_API_KEY/PIXABAY_API_KEY)' };
        }
        await this.ensureDirs();

        const sceneDuration = job.sceneDuration || 4;
        const maxScenes = job.maxScenes || 6;
        const scenes = await this.buildScenes(job, maxScenes);
        if (!scenes.length) {
            return { status: 'skipped', reason: 'could not build a script (provide script/brief, or set DEEPSEEK_API_KEY)' };
        }

        // Fetch + normalize one stock clip per scene.
        const normalized = [];
        for (let i = 0; i < scenes.length; i++) {
            try {
                const src = await this.fetchStock(scenes[i].keywords, `${job.clipId || 'reel'}_${i}`);
                if (!src) continue;
                const norm = path.join(this.stockDir, `${job.clipId || 'reel'}_norm_${i}.mp4`);
                await this.normalize(src, sceneDuration, norm);
                normalized.push({ path: norm, scene: scenes[i] });
            } catch (error) {
                console.error(`Stock scene ${i} failed: ${error.message}`);
            }
        }
        if (!normalized.length) {
            return { status: 'skipped', reason: 'no stock footage matched the script keywords' };
        }

        // Concat, then optionally burn captions.
        const outName = `${job.clipId || 'reel'}_reel_${Date.now()}.mp4`;
        const outPath = path.join(this.clipsDir, outName);
        const concatOut = job.captions === false ? outPath : path.join(this.stockDir, `concat_${outName}`);
        await this.concat(normalized.map(n => n.path), concatOut);

        let captions = { status: 'n/a' };
        if (job.captions !== false) {
            try {
                await this.burnCaptions(concatOut, normalized.map(n => n.scene), sceneDuration, outPath);
                captions = { status: 'done' };
            } catch (error) {
                // Captions are best-effort; ship the concatenated reel regardless.
                await fs.rename(concatOut, outPath).catch(() => {});
                captions = { status: 'error', reason: error.message };
            }
        }

        return {
            index: 0,
            provider: 'stock',
            model: this.pexelsKey ? 'pexels' : 'pixabay',
            path: outPath,
            title: job.title || 'Stock reel',
            scenes: normalized.length,
            captions
        };
    }

    /**
     * Turn brief/script into [{ text, keywords }] scenes.
     */
    async buildScenes(job, maxScenes) {
        // Caller-supplied script wins.
        if (Array.isArray(job.script)) {
            return job.script.slice(0, maxScenes).map(s =>
                typeof s === 'string'
                    ? { text: s, keywords: this.keywordsFrom(s, job.keywords) }
                    : { text: s.text || '', keywords: s.keywords || this.keywordsFrom(s.text || '', job.keywords) }
            );
        }
        if (typeof job.script === 'string' && job.script.trim()) {
            return this.splitScript(job.script, job.keywords, maxScenes);
        }

        // Otherwise write a short script from the brief with DeepSeek.
        if (job.brief && llm.hasDeepSeek()) {
            try {
                const content = await llm.chatDeepSeek([
                    { role: 'system', content: 'You write punchy short-form video scripts. Reply ONLY with JSON.' },
                    { role: 'user', content:
                        `Write a ${maxScenes}-scene vertical short-form ad script for: "${job.brief}". ` +
                        `Return JSON {"scenes":[{"text":"on-screen line (<=12 words)","keywords":"2-4 stock-footage search words"}]}` }
                ], { json: true, maxTokens: 700 });
                const parsed = llm.parseJSONLoose(content);
                const arr = parsed && Array.isArray(parsed.scenes) ? parsed.scenes : [];
                const scenes = arr.slice(0, maxScenes)
                    .map(s => ({ text: String(s.text || '').trim(), keywords: String(s.keywords || '').trim() }))
                    .filter(s => s.keywords);
                if (scenes.length) return scenes;
            } catch (error) {
                console.error(`Script generation failed, falling back: ${error.message}`);
            }
        }

        // Last resort: one scene straight from the brief + any provided keywords.
        if (job.brief) {
            return [{ text: job.brief.slice(0, 80), keywords: this.keywordsFrom(job.brief, job.keywords) }];
        }
        return [];
    }

    splitScript(text, extraKeywords, maxScenes) {
        return text.split(/(?<=[.!?])\s+/)
            .map(s => s.trim())
            .filter(Boolean)
            .slice(0, maxScenes)
            .map(s => ({ text: s, keywords: this.keywordsFrom(s, extraKeywords) }));
    }

    keywordsFrom(text, extra) {
        if (extra) return Array.isArray(extra) ? extra.join(' ') : String(extra);
        const stop = new Set(['the', 'and', 'for', 'with', 'your', 'you', 'our', 'this', 'that', 'are', 'from']);
        return text.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').split(/\s+/)
            .filter(w => w.length > 3 && !stop.has(w)).slice(0, 3).join(' ') || 'business';
    }

    /**
     * Search a stock provider and download the best portrait-ish clip.
     */
    async fetchStock(keywords, tag) {
        const outFile = path.join(this.stockDir, `${tag}_src.mp4`);
        let url;
        if (this.pexelsKey) url = await this.searchPexels(keywords);
        if (!url && this.pixabayKey) url = await this.searchPixabay(keywords);
        if (!url) return null;

        const res = await fetch(url);
        if (!res.ok) throw new Error(`stock download ${res.status}`);
        const buf = Buffer.from(await res.arrayBuffer());
        await fs.writeFile(outFile, buf);
        return outFile;
    }

    async searchPexels(query) {
        const u = `https://api.pexels.com/videos/search?query=${encodeURIComponent(query)}&orientation=portrait&per_page=5&size=medium`;
        const res = await fetch(u, { headers: { Authorization: this.pexelsKey } });
        if (!res.ok) return null;
        const data = await res.json();
        const video = (data.videos || [])[0];
        if (!video) return null;
        // Prefer a portrait file, then the highest-res available.
        const files = (video.video_files || []).slice().sort((a, b) => (b.width || 0) - (a.width || 0));
        const portrait = files.find(f => (f.height || 0) >= (f.width || 0));
        return (portrait || files[0] || {}).link || null;
    }

    async searchPixabay(query) {
        const u = `https://pixabay.com/api/videos/?key=${this.pixabayKey}&q=${encodeURIComponent(query)}&per_page=5`;
        const res = await fetch(u);
        if (!res.ok) return null;
        const data = await res.json();
        const hit = (data.hits || [])[0];
        if (!hit || !hit.videos) return null;
        const v = hit.videos;
        return (v.large || v.medium || v.small || {}).url || null;
    }

    /**
     * Trim to `seconds` and reframe to a uniform vertical 1080x1920@30, silent.
     * Uniform params are required for a clean concat.
     */
    async normalize(src, seconds, outPath) {
        await this.run(this.ffmpegPath, [
            '-y', '-i', src, '-t', String(seconds),
            '-vf', 'scale=1080:1920:force_original_aspect_ratio=increase,crop=1080:1920,setsar=1,fps=30',
            '-an',
            '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
            '-movflags', '+faststart', outPath
        ]);
        return outPath;
    }

    async concat(paths, outPath) {
        const listFile = path.join(this.stockDir, `list_${Date.now()}.txt`);
        await fs.writeFile(listFile, paths.map(p => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'));
        try {
            await this.run(this.ffmpegPath, [
                '-y', '-f', 'concat', '-safe', '0', '-i', listFile,
                '-c', 'copy', '-movflags', '+faststart', outPath
            ]);
        } finally {
            await fs.unlink(listFile).catch(() => {});
        }
        return outPath;
    }

    /**
     * Burn one caption line per scene, timed by scene duration.
     */
    async burnCaptions(inPath, scenes, sceneDuration, outPath) {
        const assPath = path.join(this.stockDir, `caps_${Date.now()}.ass`);
        await fs.writeFile(assPath, this.buildAss(scenes, sceneDuration));
        try {
            await this.run(this.ffmpegPath, [
                '-y', '-i', inPath,
                '-vf', `ass=${assPath.replace(/\\/g, '/').replace(/:/g, '\\:')}`,
                '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '23',
                '-movflags', '+faststart', outPath
            ]);
        } finally {
            await fs.unlink(assPath).catch(() => {});
        }
        return outPath;
    }

    buildAss(scenes, sceneDuration) {
        const header =
            '[Script Info]\nScriptType: v4.00+\nPlayResX: 1080\nPlayResY: 1920\n\n' +
            '[V4+ Styles]\n' +
            'Format: Name, Fontname, Fontsize, PrimaryColour, OutlineColour, BackColour, Bold, Outline, Shadow, Alignment, MarginL, MarginR, MarginV\n' +
            'Style: Cap, Arial, 72, &H00FFFFFF, &H00000000, &H64000000, 1, 4, 0, 2, 60, 60, 250\n\n' +
            '[Events]\nFormat: Layer, Start, End, Style, Text\n';
        const lines = scenes.map((s, i) => {
            const start = this.assTime(i * sceneDuration);
            const end = this.assTime((i + 1) * sceneDuration);
            const text = String(s.text || '').replace(/\n/g, ' ').replace(/[{}]/g, '');
            return `Dialogue: 0,${start},${end},Cap,,${text}`;
        });
        return header + lines.join('\n') + '\n';
    }

    assTime(sec) {
        const h = Math.floor(sec / 3600);
        const m = Math.floor((sec % 3600) / 60);
        const s = (sec % 60).toFixed(2).padStart(5, '0');
        return `${h}:${String(m).padStart(2, '0')}:${s}`;
    }

    run(cmd, args) {
        return new Promise((resolve, reject) => {
            const proc = spawn(cmd, args, { shell: false });
            let stdout = '';
            let stderr = '';
            proc.stdout.on('data', d => { stdout += d.toString(); });
            proc.stderr.on('data', d => { stderr += d.toString(); });
            proc.on('close', code => {
                if (code === 0) resolve(stdout);
                else reject(new Error(`${cmd} exited ${code}: ${stderr.slice(-400)}`));
            });
            proc.on('error', reject);
        });
    }
}

module.exports = StockReelProducer;
