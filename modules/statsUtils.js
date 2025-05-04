const DailySubmission = require('./models/DailySubmission');

/**
 * Calculate streaks for a user based on their daily submissions.
 * @param {String} userId - The ID of the user.
 * @param {String} guildId - The ID of the guild.
 * @returns {Promise<Number>} - The current streak count.
 */
async function calculateStreak(userId, guildId) {
    const submissions = await DailySubmission.find({
        userId,
        guildId,
        completed: true
    }).sort({ date: -1 });

    let streak = 0;
    let currentDate = new Date();

    for (const submission of submissions) {
        const submissionDate = new Date(submission.date);
        if (
            currentDate.toDateString() === submissionDate.toDateString() ||
            currentDate.toDateString() === new Date(submissionDate.setDate(submissionDate.getDate() + 1)).toDateString()
        ) {
            streak++;
            currentDate = submission.date;
        } else {
            break;
        }
    }

    return streak;
}

/**
 * Calculate weekly or monthly completion rates for a user.
 * @param {String} userId - The ID of the user.
 * @param {String} guildId - The ID of the guild.
 * @param {String} period - 'weekly' or 'monthly'.
 * @returns {Promise<Object>} - Completion rates.
 */
async function calculateCompletionRates(userId, guildId, period) {
    const now = new Date();
    const startDate = new Date(
        period === 'weekly' ? now.setDate(now.getDate() - 7) : now.setMonth(now.getMonth() - 1)
    );

    const submissions = await DailySubmission.find({
        userId,
        guildId,
        date: { $gte: startDate },
        completed: true
    });

    return {
        total: submissions.length,
        period
    };
}

/**
 * Generate a leaderboard for a guild based on streaks.
 * @param {String} guildId - The ID of the guild.
 * @returns {Promise<Array>} - Leaderboard data.
 */
async function generateLeaderboard(guildId) {
    const users = await DailySubmission.aggregate([
        { $match: { guildId, completed: true } },
        { $group: { _id: '$userId', streak: { $sum: 1 } } },
        { $sort: { streak: -1 } },
        { $limit: 10 }
    ]);

    return users.map((user, index) => ({
        rank: index + 1,
        userId: user._id,
        streak: user.streak
    }));
}

module.exports = {
    calculateStreak,
    calculateCompletionRates,
    generateLeaderboard
};