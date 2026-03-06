const DailySubmission = require('../models/DailySubmission');
const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { parseDuration, parseMemory } = require('../services/apiUtils');

/**
 * Sorts submissions by primary (runtime) and secondary (memory) performance
 */
function sortSubmissionsByPerformance(submissionsData) {
    return submissionsData.sort((a, b) => {
        if (!a.submission || !b.submission) return 0;

        const runtimeA = parseDuration(a.submission.runtime);
        const runtimeB = parseDuration(b.submission.runtime);

        if (runtimeA !== runtimeB) {
            return runtimeA - runtimeB;
        }

        const memoryA = parseMemory(a.submission.memory);
        const memoryB = parseMemory(b.submission.memory);
        return memoryA - memoryB;
    });
}

/**
 * Builds ranked fields for a Discord embed based on performance sorting
 */
function buildRankedFields(results, formatter = null) {
    if (results.length === 0) return [];

    const sorted = sortSubmissionsByPerformance([...results]);
    const medals = ['🥇', '🥈', '🥉'];

    return sorted.map((res, index) => {
        const medal = medals[index] || '🎖️';
        const runtime = res.submission?.runtime || 'N/A';
        const memory = res.submission?.memory || 'N/A';
        const username = res.leetcodeUsername || res.username || 'Unknown';
        const discordId = res.discordId;

        const userDisplay = discordId ? `<@${discordId}>` : `**${username}**`;

        let valueContent;
        if (formatter) {
            valueContent = formatter(res);
        } else if (res.submission) {
            const lang = res.submission.langName ? ` [${res.submission.langName}]` : '';
            const link = res.submission.url ? ` | [View Submission](https://leetcode.com${res.submission.url})` : '';
            valueContent = `Runtime: \`${runtime}\` | Memory: \`${memory}\`${lang}${link}`;
        } else {
            valueContent = `Runtime: \`N/A\` | Memory: \`N/A\``;
        }

        return {
            name: `${medal} ${index + 1}. ${username}`,
            value: `${userDisplay}\n${valueContent}`,
            inline: false
        };
    });
}

/**
 * Computes a date range based on a given period (all_time, monthly, weekly)
 */
function computeDateRange(period) {
    const now = new Date();
    let startDate;

    switch (period) {
        case 'monthly':
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
            break;
        case 'weekly':
            const day = now.getUTCDay();
            const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
            startDate = new Date(now.setDate(diff));
            startDate.setUTCHours(0, 0, 0, 0);
            break;
        case 'all_time':
        default:
            startDate = new Date(0); // Epoch
    }

    return { $gte: startDate };
}

/**
 * Builds leaderboard rows for a specific server and metric
 */
async function buildLeaderboardRows(guildId, guildUsers, guildConfig, metric, period) {
    const dateRange = computeDateRange(period);
    const users = Object.keys(guildUsers);

    if (users.length === 0) return { rows: [], totalUsers: 0 };

    const rows = await Promise.all(users.map(async (username) => {
        const stats = await DailySubmission.aggregate([
            {
                $match: {
                    guildId,
                    leetcodeUsername: username,
                    date: dateRange
                }
            },
            {
                $group: {
                    _id: null,
                    count: { $sum: 1 },
                    avgRuntime: { $avg: { $toDouble: { $trim: { input: { $replaceAll: { input: "$runtime", find: " ms", replacement: "" } } } } } }
                }
            }
        ]);

        const userStats = stats[0] || { count: 0, avgRuntime: 0 };
        return {
            username,
            value: metric === 'streak' ? userStats.count : (userStats.avgRuntime || 0).toFixed(2) + ' ms',
            numericValue: metric === 'streak' ? userStats.count : (userStats.avgRuntime || Infinity)
        };
    }));

    // Sort rows
    rows.sort((a, b) => {
        if (metric === 'streak') return b.numericValue - a.numericValue;
        return a.numericValue - b.numericValue;
    });

    return { rows, totalUsers: users.length };
}

function buildLeaderboardEmbed(guild, metric, period, pageRows, page, totalPages, totalUsers) {
    const metricTitle = metric === 'streak' ? 'Solved Count' : 'Avg Runtime';
    const periodTitle = period === 'all_time' ? 'All Time' : (period === 'monthly' ? 'This Month' : 'This Week');

    const description = pageRows.map((row, i) => {
        const rank = (page - 1) * 10 + i + 1;
        const medal = rank === 1 ? '🥇' : (rank === 2 ? '🥈' : (rank === 3 ? '🥉' : '🔹'));
        return `**${rank}.** ${medal} **${row.username}** — ${row.value}`;
    }).join('\n');

    return {
        title: `🏆 ${guild.name} Leaderboard`,
        description: `**Metric:** ${metricTitle} | **Period:** ${periodTitle}\n\n${description || 'No data found.'}`,
        color: 0xf1c40f,
        footer: { text: `Page ${page}/${totalPages} • Total Tracked: ${totalUsers}` },
        timestamp: new Date()
    };
}

function buildLeaderboardComponents(guildId, ownerId, metric, period, page, totalPages) {
    if (totalPages <= 1) return [];

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`lb:${guildId}:${ownerId}:${metric}:${period}:${page - 1}`)
            .setLabel('Previous')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === 1),
        new ButtonBuilder()
            .setCustomId(`lb:${guildId}:${ownerId}:${metric}:${period}:${page + 1}`)
            .setLabel('Next')
            .setStyle(ButtonStyle.Secondary)
            .setDisabled(page === totalPages)
    );

    return [row];
}

module.exports = {
    sortSubmissionsByPerformance,
    buildRankedFields,
    computeDateRange,
    buildLeaderboardRows,
    buildLeaderboardEmbed,
    buildLeaderboardComponents
};
