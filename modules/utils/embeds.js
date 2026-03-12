// Utility to format LeetCode contest data into a Discord embed.
// This is separated into its own module to avoid circular dependencies.

/**
 * Formats a LeetCode contest into a Discord embed object.
 * @param {Object} contest - The contest data from LeetCode API
 * @param {number} index - 0-based position among the list being rendered
 * @param {number} total - Total count of contests in the list
 * @returns {Object} Discord embed object
 */
function formatLeetCodeContestEmbed(contest, index = 0, total = 1) {
    const durationHours = Math.floor(contest.duration / 3600);
    const durationMinutes = Math.floor((contest.duration % 3600) / 60);
    const durationStr = durationMinutes > 0
        ? `${durationHours}h ${durationMinutes}m`
        : `${durationHours}h`;

    // Give weekly and biweekly contests distinct colours
    const isBiweekly = contest.title.toLowerCase().includes('biweekly');
    const color = isBiweekly ? 0x9D4EDD : 0xFF6B35; // vibrant purple for biweekly, vibrant orange for weekly

    // Heading changes based on position in the list
    const position = total > 1
        ? (index === 0 ? '🏆 Next Challenge' : `#${index + 1} Upcoming`)
        : '🏆 Next Challenge';

    // Create a visual progress indicator
    const progressBar = '█'.repeat(index + 1) + '░'.repeat(Math.max(0, total - index - 1));

    return {
        color,
        title: `⚡ ${contest.title.toUpperCase()}`,
        description:
            `**${position}**\n\n` +
            (total > 1 ? `\`[${progressBar}]\` Contest ${index + 1} of ${total}\n\n` : '') +
            `🎯 Get ready to compete and solve challenging problems!`,
        fields: [
            {
                name: '⏰ Contest Starts',
                value: `<t:${contest.startTime}:F>\n<t:${contest.startTime}:R>`,
                inline: true
            },
            {
                name: '⌛ Duration',
                value: `**${durationStr}**`,
                inline: true
            },
            {
                name: '🔥 Difficulty',
                value: isBiweekly ? '★★★ Advanced' : '★★ Intermediate',
                inline: true
            },
            {
                name: '📌 Register Now',
                value: `[Join the Contest](https://leetcode.com/contest/${contest.titleSlug}) — Don't miss out!`,
                inline: false
            }
        ],
        timestamp: new Date(),
        footer: {
            text: `LeetCode Contests${total > 1 ? ` • ${index + 1}/${total}` : ''} | Make your mark! ⭐`
        }
    };
}

/**
 * Formats LeetCode user profile and badges into a Discord embed.
 * @param {Object} profileData - The profile data from /user/{username}
 * @param {Object} badgesData - The badges data from /user/{username}/badges
 * @returns {Object} Discord embed object
 */
function formatUserProfileEmbed(profileData, badgesData) {
    const { username, profile, submitStats } = profileData;
    const { badges } = badgesData;

    // Map submit stats for easy access
    const statsMap = {};
    if (submitStats && submitStats.acSubmissionNum) {
        submitStats.acSubmissionNum.forEach(stat => {
            statsMap[stat.difficulty] = stat.count;
        });
    }

    // Create visual progress bars for problem categories
    const createProgressBar = (current, total = 3000) => {
        const percentage = Math.min((current / total) * 100, 100);
        const filled = Math.round(percentage / 5);
        return `\`[${'█'.repeat(filled)}${'░'.repeat(20 - filled)}]\` ${percentage.toFixed(0)}%`;
    };

    const totalSolved = statsMap['All'] || 0;
    const easyCount = statsMap['Easy'] || 0;
    const mediumCount = statsMap['Medium'] || 0;
    const hardCount = statsMap['Hard'] || 0;

    const solvedStr = `🟢 **Easy:** ${easyCount} ${createProgressBar(easyCount, 500)}\n` +
        `🟡 **Medium:** ${mediumCount} ${createProgressBar(mediumCount, 1000)}\n` +
        `🔴 **Hard:** ${hardCount} ${createProgressBar(hardCount, 500)}\n\n` +
        `⭐ **Total Solved:** **${totalSolved}** problems`;

    const profileFields = [
        {
            name: '⚡ Problem Completion Stats',
            value: solvedStr,
            inline: false
        },
        {
            name: '🎯 Global Rank',
            value: `**#${profile.ranking?.toLocaleString() || 'N/A'}** 🚀`,
            inline: true
        }
    ];

    if (profile.reputation !== undefined) {
        profileFields.push({
            name: '💎 Reputation',
            value: `**${profile.reputation.toLocaleString()}**`,
            inline: true
        });
    }

    // Process badges (limit to 6 for the embed)
    let badgesStr = '✨ No badges earned yet. Time to start collecting!';
    if (badges && badges.length > 0) {
        // Sort by creation date (newest first)
        const sortedBadges = [...badges].sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));
        const recentBadges = sortedBadges.slice(0, 6);
        badgesStr = recentBadges.map(b => {
            const ts = Math.floor(new Date(b.creationDate).getTime() / 1000);
            return `🏅 **${b.displayName}** • <t:${ts}:d>`;
        }).join('\n');

        if (badges.length > 6) {
            badgesStr += `\n\n*... and ${badges.length - 6} more amazing badges! 🎖️*`;
        }
    }

    return {
        color: 0xFF6B35,
        title: `✨ ${profile.realName || username}'s LeetCode Profile`,
        url: `https://leetcode.com/${username}`,
        thumbnail: {
            url: profile.userAvatar || 'https://assets.leetcode.com/users/avatars/avatar_1680959035.png'
        },
        description: profile.aboutMe || '🎮 *Ready to conquer LeetCode challenges!*',
        fields: [
            ...profileFields,
            {
                name: `🏆 Achievement Collection (${badges?.length || 0} badges)`,
                value: badgesStr,
                inline: false
            }
        ],
        timestamp: new Date(),
        footer: {
            text: `LeetCode Champion • ${username} | Keep grinding! 💪`
        }
    };
}

module.exports = { formatLeetCodeContestEmbed, formatUserProfileEmbed };
