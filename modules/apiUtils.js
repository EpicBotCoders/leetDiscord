const axios = require('axios');
const logger = require('./logger');
const DailySubmission = require('./models/DailySubmission');

// In-memory cache store
const cache = {
    dailySlug: { value: null, expiry: 0 },
    problemDetails: new Map(),
    userSubmissions: new Map()
};

const TTL = {
    userSubmissions: 60 * 1000        // 1 minute
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
async function enhancedCheck(users, client, guildId, channelId) {
    logger.info(`Starting enhanced check for ${users.length} users in guild: ${guildId}`);
    logger.debug("Cache state:", cache);
    try {
        const dailySlug = await getDailySlug();
        if (!dailySlug) {
            return { content: 'Error fetching daily problem slug. Please try again later.' };
        }
        const problem = await getProblemDetails(dailySlug);
        if (!problem) {
            return { content: 'Error fetching problem details. Please try again later.' };
        }

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
        today.setUTCHours(0, 0, 0, 0); // Use UTC for consistency
        const tomorrow = new Date(today);
        tomorrow.setUTCDate(today.getUTCDate() + 1);

        // Batch fetch existing submissions
        let existingSubmissionsMap = new Map();
        try {
            const submissions = await DailySubmission.find({
                guildId: guildId,
                leetcodeUsername: { $in: users },
                questionSlug: dailySlug,
                date: { $gte: today, $lt: tomorrow }
            });
            submissions.forEach(sub => existingSubmissionsMap.set(sub.leetcodeUsername, sub));
            logger.info(`Fetched ${existingSubmissionsMap.size} existing submissions for today.`);
        } catch (error) {
            logger.error('Error fetching existing submissions:', error);
            // Continue without pre-fetched submissions if there's an error
        }

        const userStatusFields = await Promise.all(users.map(async username => {
            // Step 1: Check if already submitted in DB (using pre-fetched map)
            let userId = username; // Default to leetcode username if Discord ID not found
            const existingSubmission = existingSubmissionsMap.get(username);

            if (existingSubmission) {
                return {
                    name: username,
                    value: '✅ Completed (recorded)',
                    inline: true
                };
            }

            // Attempt to resolve Discord user ID
            // This part remains tricky as we might not have the full guild object easily
            // For now, let's prioritize leetcodeUsername and use guildId for DB operations.
            // The original code fetched member by 'username' which is not a valid UserResolvable for fetch.
            // It should be by ID if available, or rely on a mapping if one exists.
            // We'll assume 'users' contains LeetCode usernames. If a Discord ID is needed,
            // it should ideally be resolved before calling enhancedCheck or stored alongside the username.
            // For now, we'll simplify and use leetcodeUsername as primary key for submissions,
            // and store guildId correctly.
            // If a Discord user ID is available (e.g., from a config map), it could be used for `userId`.
            // The previous code was trying to get guild from channelId then member from guild.
            // We now have guildId directly. If we need the member object:
            let member = null;
            if (client && guildId) {
                try {
                    const guild = await client.guilds.fetch(guildId);
                    // Attempt to find user by username - this is unreliable.
                    // A better approach would be to have a mapping of LeetCode username to Discord ID.
                    // For now, we'll keep userId as leetcodeUsername unless a direct mapping is available.
                } catch (fetchError) {
                    logger.warn(`Could not fetch guild ${guildId} for member lookup: ${fetchError.message}`);
                }
            }
            // If member object was found, userId = member.id; otherwise, userId remains username.

            const submissions = await getUserSubmissions(username); // Fetches from LeetCode API
            const todaysSubmission = submissions.find(sub =>
                sub.titleSlug === dailySlug && sub.statusDisplay === 'Accepted'
            );

            if (todaysSubmission) {
                try {
                    const submissionTime = parseSubmissionTime(todaysSubmission);
                    // Create new submission record
                    await DailySubmission.create({
                        guildId: guildId, // Use the correct guildId
                        userId: userId, // This might be LeetCode username or Discord ID
                        leetcodeUsername: username,
                        date: today, // Use UTC date
                        questionTitle: problem.title || 'Unknown Title',
                        questionSlug: dailySlug,
                        difficulty: problem.difficulty || 'N/A',
                        submissionTime
                    });
                    logger.info(`Recorded new submission for ${username} in guild ${guildId}`);
                } catch (error) {
                    logger.error(`Error recording submission for ${username} in guild ${guildId}:`, error);
                }
            }

            return {
                name: username,
                value: todaysSubmission ? '✅ Completed (new)' : '❌ Not completed',
                inline: true
            };
        }));

        const statusEmbed = {
            title: 'Daily LeetCode Challenge Status',
            fields: [problemField, ...userStatusFields.filter(Boolean)], // Filter out nulls if any errors occur
            color: 0x00ff00, // Green
            timestamp: new Date()
        };

        return { embeds: [statusEmbed] };
    } catch (err) {
        logger.error(`Error during enhanced check for guild ${guildId}:`, err);
        return { content: 'An error occurred while checking challenge status. Please try again later.' };
    }
}

module.exports = { getDailySlug, getProblemDetails, getUserSubmissions, checkUser, enhancedCheck, parseSubmissionTime };