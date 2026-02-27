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

module.exports = { formatLeetCodeContestEmbed };
