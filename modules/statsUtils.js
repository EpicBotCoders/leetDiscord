const DailySubmission = require('../models/DailySubmission');
const logger = require('../logger');

/**
 * Aggregates data for the all-time leaderboard from the DailySubmission collection.
 * Counts the number of unique daily challenges completed by each user in a guild.
 *
 * @param {string} guildId - The ID of the guild to fetch leaderboard data for.
 * @param {number} [limit=10] - The maximum number of users to return on the leaderboard.
 * @returns {Promise<Array<{leetcodeUsername: string, uniqueCompletions: number}>>} 
 *          An array of objects, each containing leetcodeUsername and their count of unique completions,
 *          sorted in descending order. Returns an empty array on error.
 */
async function getLeaderboardData(guildId, limit = 10) {
    if (!guildId) {
        logger.error('[getLeaderboardData] guildId parameter is required.');
        return [];
    }

    try {
        logger.info(`[getLeaderboardData] Fetching leaderboard data for guild: ${guildId}, limit: ${limit}`);

        const leaderboard = await DailySubmission.aggregate([
            { 
                $match: { guildId: guildId } 
            },
            {
                $group: {
                    _id: "$leetcodeUsername", // Group by LeetCode username
                    uniqueQuestionSlugs: { $addToSet: "$questionSlug" } // Collect unique question slugs
                }
            },
            {
                $project: {
                    _id: 0, // Exclude the default _id field
                    leetcodeUsername: "$_id",
                    uniqueCompletions: { $size: "$uniqueQuestionSlugs" } // Count the number of unique slugs
                }
            },
            { 
                $sort: { uniqueCompletions: -1 } // Sort by completions, descending
            },
            { 
                $limit: limit 
            } // Limit to top N
        ]);

        logger.info(`[getLeaderboardData] Successfully fetched leaderboard data for guild: ${guildId}. Found ${leaderboard.length} users.`);
        return leaderboard;

    } catch (error) {
        logger.error(`[getLeaderboardData] Error fetching leaderboard data for guild ${guildId}:`, error);
        return []; // Return empty array on error as a fallback
    }
}

module.exports = {
    getLeaderboardData,
};
