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
    const color = isBiweekly ? 0x7B68EE : 0xFFA116; // purple for biweekly, orange for weekly

    // Heading changes based on position in the list
    const label = total > 1
        ? (index === 0 ? '🔜 Next Up' : `📅 Also Upcoming (${index + 1} of ${total})`)
        : '🔜 Next Up';

    return {
        color,
        title: `📝 ${contest.title}`,
        description:
            `**${label}** — LeetCode Contest\n\n` +
            `**Starts:** <t:${contest.startTime}:F> (<t:${contest.startTime}:R>)\n` +
            `**Duration:** ${durationStr}\n` +
            `**[Register / View Details](https://leetcode.com/contest/${contest.titleSlug})**`,
        fields: [
            {
                name: '⏰ Start Time',
                value: `<t:${contest.startTime}:F>`,
                inline: true
            },
            {
                name: '⌛ Duration',
                value: durationStr,
                inline: true
            },
            {
                name: '🔗 Contest Page',
                value: `[leetcode.com/contest/${contest.titleSlug}](https://leetcode.com/contest/${contest.titleSlug})`,
                inline: true
            }
        ],
        timestamp: new Date(),
        footer: {
            text: `LeetCode Contest Reminder${total > 1 ? ` • ${index + 1} of ${total}` : ''}`
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

    const solvedStr = `**Total:** ${statsMap['All'] || 0}\n` +
        `🟢 **Easy:** ${statsMap['Easy'] || 0}\n` +
        `🟡 **Medium:** ${statsMap['Medium'] || 0}\n` +
        `🔴 **Hard:** ${statsMap['Hard'] || 0}`;

    const profileFields = [
        {
            name: solvedStr.includes('Total') ? '🏆 Problems Solved' : '🏆 Stats',
            value: solvedStr,
            inline: true
        },
        {
            name: '📊 Rank',
            value: `**#${profile.ranking?.toLocaleString() || 'N/A'}**`,
            inline: true
        }
    ];

    if (profile.reputation !== undefined) {
        profileFields.push({
            name: '✨ Reputation',
            value: `**${profile.reputation.toLocaleString()}**`,
            inline: true
        });
    }

    // Process badges (limit to 5 for the embed to avoid clutter)
    let badgesStr = 'No badges earned yet.';
    if (badges && badges.length > 0) {
        // Sort by creation date (newest first)
        const sortedBadges = [...badges].sort((a, b) => new Date(b.creationDate) - new Date(a.creationDate));
        const recentBadges = sortedBadges.slice(0, 5);
        badgesStr = recentBadges.map(b => `${b.displayName} (${b.creationDate})`).join('\n');

        if (badges.length > 5) {
            badgesStr += `\n*...and ${badges.length - 5} more*`;
        }
    }

    return {
        color: 0xFFA116,
        title: `👤 ${profile.realName || username}'s LeetCode Profile`,
        url: `https://leetcode.com/${username}`,
        thumbnail: {
            url: profile.userAvatar || 'https://assets.leetcode.com/users/avatars/avatar_1680959035.png'
        },
        description: profile.aboutMe || 'No bio available.',
        fields: [
            ...profileFields,
            {
                name: `🏅 Recent Badges (${badges?.length || 0})`,
                value: badgesStr,
                inline: false
            }
        ],
        timestamp: new Date(),
        footer: {
            text: `LeetCode Profile • ${username}`
        }
    };
}

module.exports = { formatLeetCodeContestEmbed, formatUserProfileEmbed };
