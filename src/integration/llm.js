/**
 * ClipForge LLM integration
 *
 * Thin, dependency-free chat helpers over two providers:
 *   - DeepSeek  (OpenAI-compatible /chat/completions) — cheap bulk scoring.
 *   - Claude    (Anthropic Messages API)              — optional final ranking.
 *
 * Uses the global `fetch` (Node 20+). No npm deps. Every function reads its
 * config from process.env with sensible fallbacks and throws a plain Error on
 * failure so callers can degrade gracefully (the pipeline catches and falls
 * back to naive selection when a key is missing or a call fails).
 */

const DEEPSEEK_BASE_URL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com';
// `deepseek-chat` is the canonical cheap model; it is scheduled to be renamed to
// `deepseek-v4-flash`, so keep DEEPSEEK_MODEL overridable via env.
const DEEPSEEK_MODEL = process.env.DEEPSEEK_MODEL || 'deepseek-chat';

const CLAUDE_BASE_URL = process.env.CLAUDE_BASE_URL || 'https://api.anthropic.com';
const CLAUDE_MODEL = process.env.CLAUDE_MODEL || 'claude-opus-4-8';
const CLAUDE_API_VERSION = process.env.CLAUDE_API_VERSION || '2023-06-01';

/** @returns {boolean} whether a DeepSeek key is configured. */
function hasDeepSeek() {
    return !!process.env.DEEPSEEK_API_KEY;
}

/** @returns {boolean} whether a Claude/Anthropic key is configured. */
function hasClaude() {
    return !!process.env.CLAUDE_API_KEY;
}

/**
 * Fetch with an abort-based timeout. Returns the parsed JSON body.
 * @param {string} url
 * @param {Object} options - fetch options
 * @param {number} timeoutMs
 */
async function fetchJSON(url, options, timeoutMs = 120000) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { ...options, signal: controller.signal });
        const text = await res.text();
        if (!res.ok) {
            throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
        }
        try {
            return JSON.parse(text);
        } catch {
            throw new Error(`Non-JSON response: ${text.slice(0, 300)}`);
        }
    } finally {
        clearTimeout(timer);
    }
}

/**
 * Chat completion via DeepSeek (OpenAI-compatible).
 * @param {Array<{role:string, content:string}>} messages
 * @param {Object} [opts]
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]
 * @param {number} [opts.temperature]
 * @param {boolean} [opts.json] - request JSON-object output
 * @returns {Promise<string>} assistant message content
 */
async function chatDeepSeek(messages, opts = {}) {
    const key = process.env.DEEPSEEK_API_KEY;
    if (!key) throw new Error('DEEPSEEK_API_KEY not set');

    const body = {
        model: opts.model || DEEPSEEK_MODEL,
        messages,
        max_tokens: opts.maxTokens || 2000,
        temperature: opts.temperature != null ? opts.temperature : 0.3,
        stream: false
    };
    if (opts.json) body.response_format = { type: 'json_object' };

    const data = await fetchJSON(`${DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${key}`
        },
        body: JSON.stringify(body)
    });

    const content = data?.choices?.[0]?.message?.content;
    if (typeof content !== 'string' || !content.trim()) {
        throw new Error('DeepSeek returned empty content');
    }
    return content;
}

/**
 * Chat completion via Claude (Anthropic Messages API).
 * NOTE: Opus 4.8 rejects `temperature`, so it is never sent.
 * @param {Array<{role:string, content:string}>} messages - user/assistant turns
 * @param {Object} [opts]
 * @param {string} [opts.model]
 * @param {number} [opts.maxTokens]
 * @param {string} [opts.system] - system prompt
 * @returns {Promise<string>} concatenated assistant text
 */
async function chatClaude(messages, opts = {}) {
    const key = process.env.CLAUDE_API_KEY;
    if (!key) throw new Error('CLAUDE_API_KEY not set');

    const body = {
        model: opts.model || CLAUDE_MODEL,
        max_tokens: opts.maxTokens || 2000,
        messages
    };
    if (opts.system) body.system = opts.system;

    const data = await fetchJSON(`${CLAUDE_BASE_URL}/v1/messages`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'x-api-key': key,
            'anthropic-version': CLAUDE_API_VERSION
        },
        body: JSON.stringify(body)
    });

    if (data?.stop_reason === 'refusal') {
        throw new Error('Claude refused the request');
    }

    const text = Array.isArray(data?.content)
        ? data.content.filter(b => b && b.type === 'text').map(b => b.text).join('')
        : '';
    if (!text.trim()) throw new Error('Claude returned empty content');
    return text;
}

/**
 * Best-effort JSON parse of an LLM reply: strips ``` fences and pulls the first
 * JSON array/object out of surrounding prose.
 * @param {string} raw
 * @returns {*} parsed value
 */
function parseJSONLoose(raw) {
    let s = String(raw).trim();
    // Strip markdown code fences.
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim();
    try {
        return JSON.parse(s);
    } catch {
        // Fall back to the first array or object substring.
        const match = s.match(/(\[[\s\S]*\]|\{[\s\S]*\})/);
        if (match) return JSON.parse(match[1]);
        throw new Error(`Could not parse JSON from LLM reply: ${s.slice(0, 200)}`);
    }
}

module.exports = {
    hasDeepSeek,
    hasClaude,
    chatDeepSeek,
    chatClaude,
    parseJSONLoose
};
