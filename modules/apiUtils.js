const axios = require('axios');
const logger = require('./logger');
const DailySubmission = require('./models/DailySubmission');

// In-memory cache store
const cache = {
    dailySlug: { value: null, expiry: 0 },
    problemDetails: new Map(),
    userSubmissions: new Map(),
    userCalendar: new Map()
};

const TTL = {
    userSubmissions: 60 * 1000,        // 1 minute
    userCalendar: 24 * 60 * 60 * 1000  // 1 day
};

function getNextUtcMidnightTimestamp() {
    const now = new Date();
    const nextUtcMidnight = new Date(Date.UTC(
        now.getUTCFullYear(),
        now.getUTCMonth(),
        now.getUTCDate() + 1, // next day
        0, 0, 0, 0
    ));
    return nextUtcMidnight.getTime();
}

// Fetch today’s daily challenge slug with cache
async function getDailySlug() {
    const now = Date.now();

    if (cache.dailySlug.value && cache.dailySlug.expiry > now) {
        logger.info('Using cached daily slug');
        return cache.dailySlug.value;
    }

    try {
        logger.info('Fetching daily challenge slug.');
        const res = await axios.get('https://leetcode-api-pied.vercel.app/daily');
        const slug = res.data.question.titleSlug;

        // Set cache to expire at next UTC midnight
        cache.dailySlug.value = slug;
        cache.dailySlug.expiry = getNextUtcMidnightTimestamp();

        return slug;
    } catch (error) {
        logger.error('Error fetching daily challenge slug:', error);
        throw error;
    }
}

// Fetch problem details with cache
async function getProblemDetails(slug) {
    const now = Date.now();
    const cached = cache.problemDetails.get(slug);

    if (cached && cached.expiry > now) {
        logger.info(`Returning cached problem details for slug: ${slug}`);
        return cached.value;
    }

    try {
        logger.info(`Fetching problem details for slug: ${slug}`);
        const res = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${slug}`);

        cache.problemDetails.set(slug, {
            value: res.data,
            expiry: getNextUtcMidnightTimestamp()
        });

        return res.data;
    } catch (error) {
        logger.error(`Error fetching problem details for slug: ${slug}`, error);
        throw error;
    }
}

// Fetch recent submissions for a user (limit 20) with cache
async function getUserSubmissions(username) {
    const now = Date.now();
    const cached = cache.userSubmissions.get(username);

    if (cached && now - cached.timestamp < TTL.userSubmissions) {
        logger.info(`Returning cached submissions for ${username}`);
        return cached.value;
    }

    try {
        logger.info(`Fetching submissions for user: ${username}`);
        const res = await axios.get(`https://leetcode-api-pied.vercel.app/user/${username}/submissions?limit=20`);
        cache.userSubmissions.set(username, { value: res.data, timestamp: now });
        return res.data;
    } catch (error) {
        logger.error(`Error fetching submissions for user: ${username}`, error);
        throw error;
    }
}

// Fetch user's calendar data with cache
async function getUserCalendar(username, year = null) {
    const now = Date.now();
    const currentYear = year || new Date().getFullYear();
    const cacheKey = `${username}-${currentYear}`;
    const cached = cache.userCalendar.get(cacheKey);

    if (cached && now - cached.timestamp < TTL.userCalendar) {
        logger.info(`Returning cached calendar for ${username} (year: ${currentYear})`);
        return cached.value;
    }

    try {
        logger.info(`Fetching calendar for user: ${username} (year: ${currentYear})`);
        const res = await axios.get(`https://leetcode-api-pied.vercel.app/user/${username}/calendar?year=${currentYear}`);
        cache.userCalendar.set(cacheKey, { value: res.data, timestamp: now });
        return res.data;
    } catch (error) {
        logger.error(`Error fetching calendar for user: ${username}`, error);
        throw error;
    }
}

// Check whether user solved today’s slug
async function checkUser(username, slug) {
    try {
        logger.info(`Checking if user ${username} solved slug ${slug}`);
        const subs = await getUserSubmissions(username);
        return subs.some(s => s.titleSlug === slug && s.statusDisplay === 'Accepted');
    } catch (error) {
        logger.error(`Error checking user ${username} for slug ${slug}:`, error);
        throw error;
    }
}

// Helper function to safely parse submission timestamp
function parseSubmissionTime(submission) {
    if (!submission.timestamp) {
        logger.warn('No timestamp in submission:', submission);
        return new Date();
    }

    const timestamp = parseInt(submission.timestamp);
    if (!isNaN(timestamp)) {
        const date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
        if (date.toString() !== 'Invalid Date') {
            return date;
        }
    }

    const isoDate = new Date(submission.timestamp);
    if (isoDate.toString() !== 'Invalid Date') {
        return isoDate;
    }

    logger.warn(`Invalid timestamp format: ${submission.timestamp}, using current time`);
    return new Date();
}

// Enhanced check function with caching and recording
async function enhancedCheck(users, client, channelId) {
    logger.info('Starting enhanced check for users:', users);
    logger.debug('Cache state:', cache);
    try {
        const dailySlug = await getDailySlug();
        const problem = await getProblemDetails(dailySlug);

        const topicTags = problem.topicTags ? problem.topicTags.map(tag => tag.name).join(', ') : 'N/A';
        const stats = problem.stats ? JSON.parse(problem.stats) : { acRate: 'N/A' };

        const problemField = {
            name: 'Problem Info',
            value: `**${problem.title || 'Unknown Problem'}** (${problem.difficulty || 'N/A'})\n` +
                `Topics: ${topicTags}\n` +
                `Acceptance Rate: ${stats.acRate}\n` +
                `[View Problem](${problem.url || 'N/A'})`
        };

        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const userStatusFields = await Promise.all(users.map(async username => {
            // Step 1: Check if already submitted in DB
            let userId = username;
            let existingSubmission = null;

            try {
                const channel = await client.channels.fetch(channelId);
                const guild = channel.guild;
                const member = await guild.members.fetch({ user: username, force: true }).catch(() => null);
                if (member) userId = member.id;

                existingSubmission = await DailySubmission.findOne({
                    guildId: guild.id,
                    userId,
                    leetcodeUsername: username,
                    questionSlug: dailySlug,
                    date: {
                        $gte: today,
                        $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                    }
                });
            } catch (error) {
                logger.warn(`Could not prefetch submission DB check for ${username}:`, error);
            }

            // If already submitted, skip further check
            if (existingSubmission) {
                return {
                    name: username,
                    value: '✅ Completed (cached)',
                    inline: true
                };
            }

            const submissions = await getUserSubmissions(username);
            const todaysSubmission = submissions.find(sub =>
                sub.titleSlug === dailySlug && sub.statusDisplay === 'Accepted'
            );

            if (todaysSubmission) {
                try {
                    const submissionTime = parseSubmissionTime(todaysSubmission);
                    await DailySubmission.create({
                        guildId: client.guilds.cache.first().id, // fallback guild
                        userId,
                        leetcodeUsername: username,
                        date: today,
                        questionTitle: problem.title,
                        questionSlug: dailySlug,
                        difficulty: problem.difficulty,
                        submissionTime
                    });
                } catch (error) {
                    logger.error(`Error recording submission for ${username}:`, error);
                }
            }

            return {
                name: username,
                value: todaysSubmission ? '✅ Completed' : '❌ Not completed',
                inline: true
            };
        }));

        const statusEmbed = {
            title: 'Daily LeetCode Challenge Status',
            fields: [problemField, ...userStatusFields],
            color: 0x00ff00,
            timestamp: new Date()
        };

        return { embeds: [statusEmbed] };
    } catch (err) {
        logger.error('Error during enhanced check:', err);
        return { content: 'Error checking challenge status.' };
    }
}

// Helper function to parse runtime strings like "1293 ms" into numeric milliseconds
function parseDuration(durationString) {
    if (!durationString) return Infinity;

    const match = durationString.match(/(\d+(?:\.\d+)?)\s*ms/i);
    if (match) {
        return parseFloat(match[1]);
    }

    logger.warn(`Could not parse duration: ${durationString}`);
    return Infinity;
}

// Helper function to parse memory strings like "19.6 MB" into numeric megabytes
function parseMemory(memoryString) {
    if (!memoryString) return Infinity;

    const match = memoryString.match(/(\d+(?:\.\d+)?)\s*MB/i);
    if (match) {
        return parseFloat(match[1]);
    }

    logger.warn(`Could not parse memory: ${memoryString}`);
    return Infinity;
}

// Get best accepted submission for today's daily challenge
async function getBestDailySubmission(username, dailySlug) {
    try {
        const submissions = await getUserSubmissions(username);

        // Filter for accepted submissions matching today's daily challenge
        const acceptedSubmissions = submissions.filter(sub =>
            sub.titleSlug === dailySlug &&
            sub.statusDisplay === 'Accepted'
        );

        if (acceptedSubmissions.length === 0) {
            return null;
        }

        // Sort by runtime (primary), then memory (secondary)
        const sorted = acceptedSubmissions.sort((a, b) => {
            const runtimeA = parseDuration(a.runtime);
            const runtimeB = parseDuration(b.runtime);

            if (runtimeA !== runtimeB) {
                return runtimeA - runtimeB;
            }

            // If runtime is tied, compare memory
            const memoryA = parseMemory(a.memory);
            const memoryB = parseMemory(b.memory);
            return memoryA - memoryB;
        });

        return sorted[0];
    } catch (error) {
        logger.error(`Error fetching best submission for ${username}:`, error);
        return null;
    }
}

module.exports = {
    getDailySlug,
    getUserSubmissions,
    getUserCalendar,
    checkUser,
    enhancedCheck,
    getBestDailySubmission,
    parseDuration,
    parseMemory
};