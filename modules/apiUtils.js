const axios = require('axios');
const logger = require('./logger');

// Fetch today’s daily challenge slug
async function getDailySlug() {
    try {
        logger.info('Fetching daily challenge slug.');
        const res = await axios.get('https://leetcode-api-pied.vercel.app/daily');
        return res.data.question.titleSlug;
    } catch (error) {
        logger.error('Error fetching daily challenge slug:', error);
        throw error;
    }
}

// Fetch recent submissions for a user (limit 20)
async function getUserSubmissions(username) {
    try {
        logger.info(`Fetching submissions for user: ${username}`);
        const res = await axios.get(`https://leetcode-api-pied.vercel.app/user/${username}/submissions?limit=20`);
        return res.data; // array of { titleSlug, statusDisplay, ... }
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

// Enhanced check function with more problem details
async function enhancedCheck(users, client, channelId) {
    logger.info('Starting enhanced check for users:', users);
    try {
        const dailyData = await getDailySlug();
        const problemDetails = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${dailyData}`);
        const problem = problemDetails.data;

        const topicTags = problem.topicTags ? problem.topicTags.map(tag => tag.name).join(', ') : 'N/A';
        const stats = problem.stats ? JSON.parse(problem.stats) : { acRate: 'N/A' };

        // Create problem info field
        const problemField = {
            name: 'Problem Info',
            value: `**${problem.title || 'Unknown Problem'}** (${problem.difficulty || 'N/A'})\n` +
                   `Topics: ${topicTags}\n` +
                   `Acceptance Rate: ${stats.acRate}\n` +
                   `[View Problem](${problem.url || 'N/A'})`
        };
        
        // Create individual fields for each user status
        const userStatusFields = await Promise.all(users.map(async username => {
            const solved = await checkUser(username, dailyData);
            return {
                name: username,
                value: solved ? '✅ Completed' : '❌ Not completed',
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

module.exports = { getDailySlug, getUserSubmissions, checkUser, enhancedCheck };