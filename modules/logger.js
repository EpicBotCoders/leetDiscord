const winston = require('winston');
const Transport = require('winston-transport');
const path = require('path');

// ---------------------------------------------------------------------------
// Custom Discord Webhook Transport
// ---------------------------------------------------------------------------

/**
 * Derives the calling file + line from a synthetic Error stack.
 * Must be called SYNCHRONOUSLY within log() so the original call stack is intact.
 */
function getCallerPhase() {
    const err = new Error();
    const lines = (err.stack || '').split('\n');
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i];
        // Skip frames belonging to Winston internals or this logger file itself
        if (
            line.includes('logger.js') ||
            line.includes('/node_modules/winston') ||
            line.includes('\\node_modules\\winston') ||
            line.includes('/node_modules/winston-transport') ||
            line.includes('\\node_modules\\winston-transport') ||
            line.includes('DerivedLogger')
        ) {
            continue;
        }
        // Skip pure Node.js internals (no file path in parens)
        if (line.includes('node:internal') || line.includes('(node:')) {
            continue;
        }
        // Extract "filename:line" from "    at Context.<fn> (/abs/path/file.js:42:7)"
        const match = line.match(/\((.+?):(\d+):\d+\)/) || line.match(/at (.+?):(\d+):\d+/);
        if (match) {
            const filePath = match[1];
            const lineNo = match[2];
            const base = path.basename(filePath);
            return `${base}:${lineNo}`;
        }
    }
    return 'Unknown';
}

class DiscordWebhookTransport extends Transport {
    constructor(opts) {
        super(opts);
        this.level = 'error'; // only handle error-level logs
    }

    log(info, callback) {
        // ── Extract everything SYNCHRONOUSLY here, while the call stack is intact ──

        // Capture phase from the current call stack (before setImmediate unwinds it)
        const phase = getCallerPhase();

        // info[Symbol.for('splat')] = extra args passed to logger.error(msg, ...args)
        const splat = info[Symbol.for('splat')] || [];

        // Find an Error instance in the splat args (e.g. logger.error('msg', err))
        const errorObj = splat.find((s) => s instanceof Error) || null;

        // Find a plain object context (e.g. logger.error('msg', err, { guildId }))
        const contextObj = splat.find(
            (s) => s && typeof s === 'object' && !(s instanceof Error)
        ) || null;

        const message = String(info.message || '');

        // Defer the actual HTTP call so we don't block the logging pipeline
        setImmediate(() => {
            // Lazily require to avoid circular-import at module load time
            const { send } = require('./webhookReporter');
            send({ phase, message, error: errorObj, context: contextObj }).catch((err) => {
                // Surface webhook send failures without crashing the process
                console.error('[webhookReporter] Failed to send error to Discord webhook:', err?.message);
            });
        });

        callback();
    }
}


// ---------------------------------------------------------------------------
// Log format
// ---------------------------------------------------------------------------

const logFormat = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.printf(({ level, message, timestamp, stack }) => {
        if (stack) {
            return `${timestamp} ${level}: ${message}\n${stack}`;
        }
        return `${timestamp} ${level}: ${message}`;
    })
);

// ---------------------------------------------------------------------------
// Logger instance
// ---------------------------------------------------------------------------

const logger = winston.createLogger({
    level: 'debug',
    format: logFormat,
    transports: [
        // Console output with colours
        new winston.transports.Console({
            format: winston.format.combine(
                winston.format.colorize(),
                winston.format.simple()
            )
        }),
        // All logs → combined.log
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/combined.log'),
            maxsize: 5242880, // 5 MB
            maxFiles: 5,
        }),
        // Error logs → error.log
        new winston.transports.File({
            filename: path.join(__dirname, '../logs/error.log'),
            level: 'error',
            maxsize: 5242880, // 5 MB
            maxFiles: 5,
        }),
        // Discord webhook — fires on every logger.error() call
        new DiscordWebhookTransport(),
    ]
});

// Morgan-compatible stream
logger.stream = {
    write: (message) => {
        logger.info(message.trim());
    }
};

module.exports = logger;