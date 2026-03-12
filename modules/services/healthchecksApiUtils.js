const axios = require('axios');
const logger = require('../core/logger');

const BASE_URL = 'https://healthchecks.io/api/v3';

// Cache structure with TTL
const cache = {
    checks: { value: null, expiry: 0 },
    checkDetails: new Map(), // Map of uuid -> { value: check, expiry: timestamp }
    pings: new Map(), // Map of uuid -> { value: pings, expiry: timestamp }
    flips: new Map()  // Map of uuid -> { value: flips, expiry: timestamp }
};

// TTL constants (in milliseconds)
const TTL = {
    checks: 45 * 1000,    // 45 seconds for list of checks
    pings: 15 * 1000,     // 15 seconds for pings
    flips: 15 * 1000      // 15 seconds for flips
};

/**
 * Get the API key from environment
 */
function getApiKey() {
    const apiKey = process.env.HEALTHCHECKS_API_KEY;
    if (!apiKey) {
        throw new Error('HEALTHCHECKS_API_KEY environment variable is not set');
    }
    return apiKey;
}

/**
 * Create axios instance with auth header
 */
function createAxiosInstance() {
    return axios.create({
        baseURL: BASE_URL,
        headers: {
            'X-Api-Key': getApiKey(),
            'User-Agent': 'LeetDiscordBot/1.0'
        },
        timeout: 10000
    });
}

/**
 * Check if cache entry is still valid
 */
function isCacheValid(expiry) {
    return expiry > Date.now();
}

/**
 * Calculate status based on healthchecks.io API status field
 * API returns: new, up, grace, down, paused
 * We map to: up, late, down, paused
 */
function normalizeStatus(apiStatus) {
    switch (apiStatus) {
        case 'up':
        case 'new':
            return 'up';
        case 'grace':
            return 'late';
        case 'down':
            return 'down';
        case 'paused':
            return 'paused';
        default:
            return 'unknown';
    }
}

/**
 * Get status emoji for display
 */
function getStatusEmoji(status) {
    switch (status) {
        case 'up':
            return '🟢';
        case 'late':
            return '🟡';
        case 'down':
            return '🔴';
        case 'paused':
            return '⏸️';
        default:
            return '❓';
    }
}

/**
 * Format timestamp to Discord readable format
 */
function formatTime(isoTimestamp) {
    if (!isoTimestamp) return 'Never';
    const timestamp = Math.floor(new Date(isoTimestamp).getTime() / 1000);
    return `<t:${timestamp}:F>`;
}

/**
 * Format time ago (Discord relative timestamp)
 */
function formatTimeAgo(isoTimestamp) {
    if (!isoTimestamp) return 'Never';
    const timestamp = Math.floor(new Date(isoTimestamp).getTime() / 1000);
    return `<t:${timestamp}:R>`;
}

/**
 * Format time until (Discord relative timestamp)
 */
function formatTimeUntil(isoTimestamp) {
    if (!isoTimestamp) return 'N/A';
    const timestamp = Math.floor(new Date(isoTimestamp).getTime() / 1000);
    return `<t:${timestamp}:R>`;
}

/**
 * List all checks with caching
 */
async function listChecks() {
    const now = Date.now();
    logger.debug('[hc-api] listChecks called');

    // Return cached if valid
    if (cache.checks.value && isCacheValid(cache.checks.expiry)) {
        logger.debug('[hc-api] Returning cached checks list');
        return cache.checks.value;
    }

    try {
        logger.info('[hc-api] Fetching healthchecks list from API');
        const client = createAxiosInstance();
        const response = await client.get('/checks/');

        const checks = response.data.checks || [];

        // Format checks for display
        const formatted = checks.map(check => formatCheckForDisplay(check));

        // Store in cache
        cache.checks.value = formatted;
        cache.checks.expiry = now + TTL.checks;

        logger.info(`Fetched ${checks.length} checks`);
        return formatted;
    } catch (error) {
        logger.error('Error fetching checks from API:', error.message);

        if (error.response?.status === 401) {
            throw new Error('Invalid or missing HEALTHCHECKS_API_KEY');
        }

        throw error;
    }
}

/**
 * Get details for a single check
 */
async function getCheckDetails(uuid) {
    const now = Date.now();
    logger.debug(`[hc-api] getCheckDetails called for ${uuid}`);

    // Check cache first
    if (cache.checkDetails.has(uuid)) {
        const cached = cache.checkDetails.get(uuid);
        if (isCacheValid(cached.expiry)) {
            logger.debug(`[hc-api] Returning cached details for check ${uuid}`);
            return cached.value;
        }
    }

    try {
        logger.info(`[hc-api] Fetching check details for ${uuid}`);
        const client = createAxiosInstance();
        const response = await client.get(`/checks/${uuid}`);

        const check = response.data;

        // Store in cache
        cache.checkDetails.set(uuid, {
            value: check,
            expiry: now + TTL.checks
        });

        return check;
    } catch (error) {
        logger.error(`Error fetching check ${uuid}:`, error.message);

        if (error.response?.status === 404) {
            throw new Error(`Check not found: ${uuid}`);
        }
        if (error.response?.status === 401) {
            throw new Error('Invalid or missing HEALTHCHECKS_API_KEY');
        }

        throw error;
    }
}

/**
 * Get pings for a check with caching
 */
async function getCheckPings(uuid, limit = 20) {
    const now = Date.now();

    // Check cache first
    if (cache.pings.has(uuid)) {
        const cached = cache.pings.get(uuid);
        if (isCacheValid(cached.expiry)) {
            logger.debug(`Using cached pings for check ${uuid}`);
            return cached.value.slice(0, limit);
        }
    }

    try {
        logger.info(`Fetching pings for check ${uuid}`);
        const client = createAxiosInstance();
        const response = await client.get(`/checks/${uuid}/pings/`);

        const pings = response.data.pings || [];

        // Store full list in cache
        cache.pings.set(uuid, {
            value: pings,
            expiry: now + TTL.pings
        });

        return pings.slice(0, limit);
    } catch (error) {
        logger.error(`Error fetching pings for ${uuid}:`, error.message);

        if (error.response?.status === 404) {
            throw new Error(`Check not found: ${uuid}`);
        }
        if (error.response?.status === 401) {
            throw new Error('Invalid or missing HEALTHCHECKS_API_KEY');
        }

        throw error;
    }
}

/**
 * Get flips (status changes) for a check with caching
 */
async function getCheckFlips(uuid, seconds = null) {
    const now = Date.now();

    // Build cache key to differentiate by time filter
    const cacheKey = seconds ? `${uuid}:${seconds}` : uuid;

    // Check cache first
    if (cache.flips.has(cacheKey)) {
        const cached = cache.flips.get(cacheKey);
        if (isCacheValid(cached.expiry)) {
            logger.debug(`Using cached flips for check ${uuid}`);
            return cached.value;
        }
    }

    try {
        logger.info(`Fetching flips for check ${uuid}`);
        const client = createAxiosInstance();

        let url = `/checks/${uuid}/flips/`;
        if (seconds) {
            url += `?seconds=${seconds}`;
        }

        const response = await client.get(url);
        const flips = Array.isArray(response.data) ? response.data : [];

        // Store in cache
        cache.flips.set(cacheKey, {
            value: flips,
            expiry: now + TTL.flips
        });

        return flips;
    } catch (error) {
        logger.error(`Error fetching flips for ${uuid}:`, error.message);

        if (error.response?.status === 404) {
            throw new Error(`Check not found: ${uuid}`);
        }
        if (error.response?.status === 401) {
            throw new Error('Invalid or missing HEALTHCHECKS_API_KEY');
        }

        throw error;
    }
}

/**
 * Format check data for display
 */
function formatCheckForDisplay(check) {
    return {
        name: check.name,
        slug: check.slug,
        uuid: check.uuid,
        status: normalizeStatus(check.status),
        statusEmoji: getStatusEmoji(normalizeStatus(check.status)),
        lastPing: check.last_ping,
        nextPing: check.next_ping,
        timeout: check.timeout,
        grace: check.grace,
        tags: check.tags,
        desc: check.desc,
        nPings: check.n_pings
    };
}

/**
 * Find check by name (name or slug) from list of checks
 */
async function findCheckByName(name) {
    const checks = await listChecks();
    const searchTerm = name.toLowerCase();

    // Try exact match first
    let match = checks.find(c =>
        c.name.toLowerCase() === searchTerm ||
        c.slug.toLowerCase() === searchTerm
    );

    if (match) return match;

    // Try partial match
    match = checks.find(c =>
        c.name.toLowerCase().includes(searchTerm) ||
        c.slug.toLowerCase().includes(searchTerm)
    );

    if (!match) {
        throw new Error(`Check not found: "${name}"`);
    }

    return match;
}

/**
 * Clear all caches (for testing or manual refresh)
 */
function clearCache() {
    cache.checks = { value: null, expiry: 0 };
    cache.checkDetails.clear();
    cache.pings.clear();
    cache.flips.clear();
    logger.info('Healthchecks cache cleared');
}

module.exports = {
    listChecks,
    getCheckDetails,
    getCheckPings,
    getCheckFlips,
    findCheckByName,
    formatCheckForDisplay,
    normalizeStatus,
    getStatusEmoji,
    formatTime,
    formatTimeAgo,
    formatTimeUntil,
    clearCache
};
