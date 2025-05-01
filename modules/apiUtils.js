const axios = require('axios');

// Fetch today’s daily challenge slug
async function getDailySlug() {
    const res = await axios.get('https://leetcode-api-pied.vercel.app/daily');
    return res.data.question.titleSlug;
}

// Fetch recent submissions for a user (limit 20)
async function getUserSubmissions(username) {
    const res = await axios.get(`https://leetcode-api-pied.vercel.app/user/${username}/submissions?limit=20`);
    return res.data; // array of { titleSlug, statusDisplay, ... }
}

// Check whether user solved today’s slug
async function checkUser(username, slug) {
    const subs = await getUserSubmissions(username);
    return subs.some(s => s.titleSlug === slug && s.statusDisplay === 'Accepted');
}

// Enhanced check function with more problem details
async function enhancedCheck(users, client, channelId) {
    try {
        const dailyData = await axios.get('https://leetcode-api-pied.vercel.app/daily');
        const problem = dailyData.data.question;
        const slug = problem.titleSlug;

        // Get detailed problem info
        const detailedProblemResponse = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${slug}`);
        const detailedProblem = detailedProblemResponse.data;

        const results = await Promise.all(users.map(u => checkUser(u, slug)));

        // Get topic tags from detailed problem info
        const topics = detailedProblem.topicTags && Array.isArray(detailedProblem.topicTags)
            ? detailedProblem.topicTags.map(t => t.name).join(', ')
            : 'Not specified';

        // Parse stats if available
        let stats = {};
        try {
            stats = JSON.parse(detailedProblem.stats);
        } catch (e) {
            stats = { acRate: 'Unknown' };
        }

        const statusEmbed = {
            title: `Daily LeetCode Challenge Status`,
            description: `**Problem**: ${detailedProblem.title || 'Unknown'}\n` +
                        `**Difficulty**: ${detailedProblem.difficulty || 'Unknown'}\n` +
                        `**Topics**: ${topics}\n` +
                        `**Acceptance Rate**: ${stats.acRate || 'Unknown'}\n` +
                        `**Total Submissions**: ${stats.totalSubmission || 'Unknown'}\n\n` +
                        `**User Status**:`,
            fields: users.map((u, i) => ({
                name: u,
                value: results[i] ? '✅ Completed' : '❌ Not completed',
                inline: true
            })),
            color: 0x00ff00,
            timestamp: new Date(),
            url: detailedProblem.url || `https://leetcode.com/problems/${slug}`
        };

        return { embeds: [statusEmbed] };
    } catch (err) {
        console.error('Error during enhanced check', err);
        return { content: 'Error checking challenge status.' };
    }
}

module.exports = { getDailySlug, getUserSubmissions, checkUser, enhancedCheck };