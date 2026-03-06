const DailySubmission = require('../models/DailySubmission');
const Guild = require('../models/Guild');

/**
 * Parse difficulty filter from query parameter
 * @param {string} difficultyParam - comma-separated difficulties (e.g., "Easy,Medium,Hard") or "All"
 * @returns {string[]} - array of difficulty values to filter by
 */
function parseDifficultyFilter(difficultyParam) {
    if (!difficultyParam || difficultyParam === 'All') {
        return ['Easy', 'Medium', 'Hard'];
    }

    const difficulties = difficultyParam.split(',').map(d => d.trim());
    return difficulties.filter(d => ['Easy', 'Medium', 'Hard'].includes(d));
}

/**
 * Calculate streak information for a user
 * A streak is consecutive days with at least one submission
 * @param {string} guildId - Guild ID
 * @param {string} userId - User ID
 * @param {string[]} difficulties - Array of difficulty levels to include
 * @returns {Promise<Object>} - Streak data: { current, best, lastSubmissionDate }
 */
async function calculateStreaks(guildId, leetcodeUsername, difficulties = ['Easy', 'Medium', 'Hard']) {
    try {
        const submissions = await DailySubmission.find({
            guildId,
            leetcodeUsername,
            difficulty: { $in: difficulties }
        }).sort({ date: 1 });

        if (submissions.length === 0) {
            return { current: 0, best: 0, lastSubmissionDate: null };
        }

        // Get unique dates (one per day max)
        const uniqueDates = new Set();
        submissions.forEach(sub => {
            const dateStr = new Date(sub.date).toISOString().split('T')[0];
            uniqueDates.add(dateStr);
        });

        const sortedDates = Array.from(uniqueDates).sort();

        let currentStreak = 0;
        let bestStreak = 0;
        let tempStreak = 1;

        // Calculate consecutive day streaks
        for (let i = 1; i < sortedDates.length; i++) {
            const prevDate = new Date(sortedDates[i - 1]);
            const currDate = new Date(sortedDates[i]);
            const diffTime = currDate - prevDate;
            const diffDays = diffTime / (1000 * 60 * 60 * 24);

            if (diffDays === 1) {
                tempStreak++;
            } else {
                bestStreak = Math.max(bestStreak, tempStreak);
                tempStreak = 1;
            }
        }
        bestStreak = Math.max(bestStreak, tempStreak);

        // Calculate current streak from the most recent submission
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        currentStreak = 0;
        for (let i = sortedDates.length - 1; i >= 0; i--) {
            const checkDate = new Date(sortedDates[i]);
            const daysDiff = Math.floor((today - checkDate) / (1000 * 60 * 60 * 24));

            if (daysDiff === currentStreak) {
                currentStreak++;
            } else {
                break;
            }
        }

        const lastSubmissionDate = submissions[submissions.length - 1].date;

        return { current: currentStreak, best: bestStreak, lastSubmissionDate };
    } catch (error) {
        console.error('Error calculating streaks:', error);
        return { current: 0, best: 0, lastSubmissionDate: null };
    }
}

/**
 * Get top performers ranked by problem count
 * @param {string} guildId - Guild ID
 * @param {string[]} difficulties - Array of difficulty levels to include
 * @param {number} limit - Number of top performers to return
 * @returns {Promise<Array>} - Array of top performers with stats
 */
async function getTopPerformers(guildId, difficulties = ['Easy', 'Medium', 'Hard'], limit = 15) {
    try {
        const guild = await Guild.findOne({ guildId });
        if (!guild) return [];

        const submissions = await DailySubmission.find({
            guildId,
            difficulty: { $in: difficulties }
        });

        // guild.users: Map<leetcodeUsername, discordId>
        // Group submissions by leetcodeUsername (reliable canonical field)
        const userStats = new Map();
        submissions.forEach(sub => {
            const key = sub.leetcodeUsername;
            if (!userStats.has(key)) {
                const discordId = guild.users.get(key) || null;
                userStats.set(key, {
                    userId: discordId,        // Discord snowflake (for mentions)
                    username: key,            // LeetCode username (display name)
                    totalProblems: 0,
                    problemsByDifficulty: { Easy: 0, Medium: 0, Hard: 0 },
                    lastSubmissionDate: null
                });
            }

            const stats = userStats.get(key);
            stats.totalProblems++;
            stats.problemsByDifficulty[sub.difficulty]++;

            if (!stats.lastSubmissionDate || sub.submissionTime > stats.lastSubmissionDate) {
                stats.lastSubmissionDate = sub.submissionTime;
            }
        });

        // Calculate success rate (percentage of unique problems solved)
        const performers = Array.from(userStats.values()).map(stat => ({
            ...stat,
            successRate: Math.round((stat.totalProblems / submissions.length) * 100 * 10) / 10
        }));

        // Sort by total problems descending
        performers.sort((a, b) => b.totalProblems - a.totalProblems);

        return performers.slice(0, limit);
    } catch (error) {
        console.error('Error getting top performers:', error);
        return [];
    }
}

/**
 * Get users with longest streaks
 * @param {string} guildId - Guild ID
 * @param {string[]} difficulties - Array of difficulty levels to include
 * @param {number} limit - Number of users to return
 * @returns {Promise<Array>} - Array of users sorted by current streak
 */
async function getLongestStreaks(guildId, difficulties = ['Easy', 'Medium', 'Hard'], limit = 10) {
    try {
        const guild = await Guild.findOne({ guildId });
        if (!guild) return [];

        const streakData = [];

        // guild.users: Map<leetcodeUsername, discordId>
        for (const [leetcodeUsername, discordId] of guild.users) {
            const streaks = await calculateStreaks(guildId, leetcodeUsername, difficulties);
            streakData.push({
                userId: discordId,         // Discord snowflake (for mentions)
                username: leetcodeUsername, // LeetCode username (display name)
                currentStreak: streaks.current,
                bestStreak: streaks.best,
                lastSubmissionDate: streaks.lastSubmissionDate
            });
        }

        // Sort by current streak descending
        streakData.sort((a, b) => b.currentStreak - a.currentStreak);

        return streakData.slice(0, limit);
    } catch (error) {
        console.error('Error getting longest streaks:', error);
        return [];
    }
}

/**
 * Get recently solved problems
 * @param {string} guildId - Guild ID
 * @param {string[]} difficulties - Array of difficulty levels to include
 * @param {number} hoursBack - Look back this many hours (default 48)
 * @param {number} limit - Number of problems to return
 * @returns {Promise<Array>} - Array of recent submissions
 */
async function getRecentProblems(guildId, difficulties = ['Easy', 'Medium', 'Hard'], hoursBack = 48, limit = 10) {
    try {
        const guild = await Guild.findOne({ guildId });
        if (!guild) return [];

        const timeThreshold = new Date(Date.now() - hoursBack * 60 * 60 * 1000);

        const recentSubmissions = await DailySubmission.find({
            guildId,
            difficulty: { $in: difficulties },
            submissionTime: { $gte: timeThreshold }
        })
            .sort({ submissionTime: -1 })
            .limit(limit);

        return recentSubmissions.map(sub => ({
            problemId: sub.questionSlug,
            problemTitle: sub.questionTitle,
            difficulty: sub.difficulty,
            solver: sub.leetcodeUsername,          // LeetCode username is reliable
            discordId: guild.users.get(sub.leetcodeUsername) || null, // Discord ID for mention
            userId: sub.leetcodeUsername,
            submissionTime: sub.submissionTime,
            isRecent: Date.now() - sub.submissionTime < 60 * 60 * 1000 // Less than 1 hour
        }));
    } catch (error) {
        console.error('Error getting recent problems:', error);
        return [];
    }
}

/**
 * Build complete Hall of Fame data for a guild
 * @param {string} guildId - Guild ID
 * @param {string} difficultyParam - comma-separated difficulties or "All"
 * @returns {Promise<Object>} - Complete hall of fame data
 */
async function buildHallOfFameData(guildId, difficultyParam = 'All') {
    try {
        const difficulties = parseDifficultyFilter(difficultyParam);

        const [topPerformers, longestStreaks, recentProblems] = await Promise.all([
            getTopPerformers(guildId, difficulties, 15),
            getLongestStreaks(guildId, difficulties, 10),
            getRecentProblems(guildId, difficulties, 48, 10)
        ]);

        // Calculate guild stats
        const submissions = await DailySubmission.find({
            guildId,
            difficulty: { $in: difficulties }
        });

        const guild = await Guild.findOne({ guildId });
        const uniqueUsers = new Set();
        topPerformers.forEach(p => uniqueUsers.add(p.userId));

        return {
            guildId,
            difficultyFilter: difficultyParam,
            stats: {
                totalProblems: submissions.length,
                totalSolvers: uniqueUsers.size,
                averageProblemsPerUser: uniqueUsers.size > 0
                    ? Math.round((submissions.length / uniqueUsers.size) * 10) / 10
                    : 0
            },
            topPerformers,
            longestStreaks,
            recentProblems,
            lastUpdated: new Date()
        };
    } catch (error) {
        console.error('Error building hall of fame data:', error);
        return {
            guildId,
            difficultyFilter: difficultyParam,
            stats: { totalProblems: 0, totalSolvers: 0, averageProblemsPerUser: 0 },
            topPerformers: [],
            longestStreaks: [],
            recentProblems: [],
            error: 'Failed to load hall of fame data',
            lastUpdated: new Date()
        };
    }
}

module.exports = {
    parseDifficultyFilter,
    calculateStreaks,
    getTopPerformers,
    getLongestStreaks,
    getRecentProblems,
    buildHallOfFameData
};
