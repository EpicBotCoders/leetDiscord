'use strict';

/**
 * webhookReporter.js
 *
 * Sends error reports to a Discord webhook channel.
 * Uses Node's built-in `https` module to avoid circular imports.
 *
 * Environment variable:
 *   ERROR_WEBHOOK_URL — Discord webhook URL. If missing, all calls silently no-op.
 *
 * Usage:
 *   const { send } = require('./webhookReporter');
 *   send({ phase, message, error, context, level });
 *   // level defaults to 'error', but can be 'warn' or 'info'
 */

const https = require('https');
const { URL } = require('url');

// Simple in-memory rate limiter: at most one report per unique (phase+message) per 10 seconds
const _recentKeys = new Map(); // key -> timestamp
const RATE_LIMIT_MS = 10_000;

/**
 * Truncate a string to maxLen, appending '…' if cut.
 * @param {string} str
 * @param {number} maxLen
 * @returns {string}
 */
function truncate(str, maxLen = 1024) {
    if (!str) return '';
    return str.length > maxLen ? str.slice(0, maxLen - 1) + '…' : str;
}

/**
 * Get embed title and color based on the log level.
 * @param {string} level
 * @returns {{title: string, color: number}}
 */
function getLevelConfig(level) {
    switch (level) {
        case 'info':
            return { title: 'ℹ️ LeetDiscord Bot Info', color: 0x3498db }; // blue
        case 'warn':
            return { title: '⚠️ LeetDiscord Bot Warning', color: 0xf1c40f }; // yellow
        case 'error':
        default:
            return { title: '🚨 LeetDiscord Bot Error', color: 0xff0000 }; // red
    }
}

/**
 * Build a Discord embed object for the event.
 * @param {{ phase: string, message: string, error?: Error, context?: object, level?: string }} opts
 * @returns {object} Discord embed
 */
function buildEmbed({ phase, message, error, context, level }) {
    const fields = [];

    fields.push({
        name: '📍 Phase',
        value: truncate(phase || 'Unknown', 256),
        inline: false,
    });

    fields.push({
        name: '💬 Message',
        value: truncate(message || 'No message provided', 1024),
        inline: false,
    });

    if (error) {
        const stackStr = error.stack || error.toString();
        fields.push({
            name: '🔍 Stack Trace',
            value: `\`\`\`\n${truncate(stackStr, 990)}\n\`\`\``,
            inline: false,
        });
    }

    if (context && typeof context === 'object' && Object.keys(context).length > 0) {
        const contextStr = Object.entries(context)
            .map(([k, v]) => `**${k}**: ${truncate(String(v), 100)}`)
            .join('\n');
        fields.push({
            name: '📦 Context',
            value: truncate(contextStr, 1024),
            inline: false,
        });
    }

    const config = getLevelConfig(level);

    return {
        title: config.title,
        color: config.color,
        fields,
        footer: {
            text: `Node.js ${process.version} • PID ${process.pid}`,
        },
        timestamp: new Date().toISOString(),
    };
}

/**
 * POST a webhook message to Discord.
 * @param {object} payload  Discord webhook JSON payload
 * @returns {Promise<void>}
 */
function postWebhook(payload) {
    return new Promise((resolve) => {
        const webhookUrl = process.env.ERROR_WEBHOOK_URL;
        if (!webhookUrl) {
            resolve();
            return;
        }

        let parsed;
        try {
            parsed = new URL(webhookUrl);
        } catch (_) {
            // Invalid URL — silently bail
            resolve();
            return;
        }

        const body = JSON.stringify(payload);
        const options = {
            hostname: parsed.hostname,
            path: `${parsed.pathname}${parsed.search || ''}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Content-Length': Buffer.byteLength(body),
            },
        };

        const req = https.request(options, (res) => {
            let responseBody = '';

            res.on('data', (chunk) => {
                responseBody += chunk;
            });

            res.on('end', () => {
                if (res.statusCode >= 400) {
                    console.error(`[webhookReporter] Discord API Error ${res.statusCode}: ${responseBody}`);
                } else {
                    console.log(`[webhookReporter] Successfully sent webhook. Status: ${res.statusCode}`);
                }
                resolve();
            });
        });

        req.on('error', (err) => {
            console.error(`[webhookReporter] Network error: ${err.message}`);
            resolve();
        }); // ignore network errors — never crash the bot
        req.setTimeout(5000, () => {
            req.destroy();
            resolve();
        });

        req.write(body);
        req.end();
    });
}

/**
 * Send an event report to the configured Discord webhook.
 *
 * Rate-limited: identical (phase + message) pairs are suppressed within 10 seconds.
 *
 * @param {{ phase: string, message: string, error?: Error, context?: object, level?: string }} opts
 * @returns {Promise<void>}
 */
async function send({ phase = 'Unknown', message = '', error = null, context = null, level = 'error' } = {}) {
    if (!process.env.ERROR_WEBHOOK_URL) return;

    // Rate-limit: skip if same error reported recently
    const rateKey = `${phase}::${message}`;
    const now = Date.now();
    const lastSent = _recentKeys.get(rateKey);
    if (lastSent && now - lastSent < RATE_LIMIT_MS) return;
    _recentKeys.set(rateKey, now);

    // Prune old rate-limit entries to avoid unbounded memory growth
    if (_recentKeys.size > 200) {
        for (const [k, t] of _recentKeys) {
            if (now - t > RATE_LIMIT_MS) _recentKeys.delete(k);
        }
    }

    const embed = buildEmbed({ phase, message, error, context, level });
    const payload = {
        username: 'LeetBot Event Logger',
        avatar_url: 'https://cdn.discordapp.com/embed/avatars/4.png',
        embeds: [embed],
    };

    await postWebhook(payload);
}

module.exports = { send };
