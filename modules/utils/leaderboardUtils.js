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
 * Computes a date range based on a given period (daily, weekly, monthly, all_time)
 */
function computeDateRange(period) {
    const now = new Date();
    let start, end;

    switch (period) {
        case 'daily':
            start = new Date(now);
            start.setUTCHours(0, 0, 0, 0);
            end = new Date(now);
            end.setUTCHours(23, 59, 59, 999);
            break;
        case 'monthly':
            start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
            end = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999));
            break;
        case 'weekly':
            const day = now.getUTCDay();
            const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1); // Monday
            start = new Date(now.getTime());
            start.setUTCDate(diff);
            start.setUTCHours(0, 0, 0, 0);
            end = new Date(start.getTime());
            end.setUTCDate(start.getUTCDate() + 6);
            end.setUTCHours(23, 59, 59, 999);
            break;
        case 'all_time':
        default:
            start = new Date(0); // Epoch
            end = new Date(now.getTime() + 86400000); // 1 day from now
    }

    return { start, end };
}

/**
 * Builds leaderboard rows for a specific server and metric
 */
async function buildLeaderboardRows(guildId, guildUsers, guildConfig, metric, period) {
    const usernames = Object.keys(guildUsers);
    const totalUsers = usernames.length;

    if (metric === 'streak') {
        const rows = usernames.map(username => {
            const stats = guildConfig.userStats?.get(username);
            return {
                username,
                discordId: guildUsers[username],
                value: stats?.streak || 0
            };
        }).filter(row => row.value > 0);

        rows.sort((a, b) => b.value - a.value || a.username.localeCompare(b.username));
        return { rows, totalUsers };
    }

    const { start, end } = computeDateRange(period);

    const match = { guildId };
    if (start && end) {
        match.date = { $gte: start, $lt: end };
    }

    const pipeline = [
        { $match: match },
        {
            $group: {
                _id: { userId: '$userId', username: '$leetcodeUsername' },
                problemsSolved: { $sum: 1 },
                activeDates: { $addToSet: '$date' }
            }
        },
        {
            $project: {
                _id: 0,
                userId: '$_id.userId',
                username: '$_id.username',
                problemsSolved: 1,
                activeDays: { $size: '$activeDates' }
            }
        }
    ];

    const aggResults = await DailySubmission.aggregate(pipeline);

    const rows = aggResults.map(doc => {
        const username = doc.username;
        const discordId = guildUsers[username] || null;
        let value = 0;

        if (metric === 'problems_solved') {
            value = doc.problemsSolved || 0;
        } else if (metric === 'active_days') {
            value = doc.activeDays || 0;
        }

        return {
            username,
            discordId,
            value
        };
    }).filter(row => row.value > 0);

    rows.sort((a, b) => b.value - a.value || a.username.localeCompare(b.username));

    return { rows, totalUsers };
}

function buildLeaderboardEmbed(guild, metric, period, rows, page, totalPages, totalUsers) {
    const metricLabels = {
        streak: 'Current Streak',
        problems_solved: 'Problems Solved',
        active_days: 'Active Days'
    };

    const periodLabels = {
        daily: 'Daily',
        weekly: 'Weekly',
        monthly: 'Monthly',
        all_time: 'All Time'
    };

    const fields = rows.map((row, index) => {
        const globalIndex = (page - 1) * 10 + index;
        const medals = ['🥇', '🥈', '🥉'];
        const medal = globalIndex < 3 ? medals[globalIndex] : '';
        const mention = row.discordId ? `<@${row.discordId}>` : row.username;

        let valueLine;
        if (metric === 'streak') {
            valueLine = `${row.value} day${row.value === 1 ? '' : 's'}`;
        } else if (metric === 'problems_solved') {
            valueLine = `${row.value} problem${row.value === 1 ? '' : 's'}`;
        } else {
            valueLine = `${row.value} day${row.value === 1 ? '' : 's'}`;
        }

        return {
            name: `**${globalIndex + 1}. ${row.username}** ${medal}`,
            value: `👤 ${mention}\n${metricLabels[metric]}: **${valueLine}**`,
            inline: true
        };
    });

    const embed = {
        color: 0x00d9ff,
        title: `🏆 Leaderboard – ${metricLabels[metric]} – ${periodLabels[period]}`,
        description: `Ranking for ${guild?.name || 'this server'}`,
        fields,
        footer: {
            text: `Tracked users: ${totalUsers} • Page ${page} / ${totalPages}` + (metric === 'streak' ? ' • Streaks are all-time values' : '')
        },
        timestamp: new Date()
    };

    return embed;
}

function buildLeaderboardComponents(guildId, ownerId, metric, period, page, totalPages) {
    if (totalPages <= 1) {
        return [];
    }

    const components = [];

    const row = new ActionRowBuilder();

    const prevPage = Math.max(1, page - 1);
    const nextPage = Math.min(totalPages, page + 1);

    const prevButton = new ButtonBuilder()
        .setCustomId(`lb:${guildId}:${ownerId}:${metric}:${period}:${prevPage}`)
        .setLabel('Previous')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 1);

    const nextButton = new ButtonBuilder()
        .setCustomId(`lb:${guildId}:${ownerId}:${metric}:${period}:${nextPage}`)
        .setLabel('Next')
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === totalPages);

    row.addComponents(prevButton, nextButton);
    components.push(row);

    return components;
}

module.exports = {
    sortSubmissionsByPerformance,
    buildRankedFields,
    computeDateRange,
    buildLeaderboardRows,
    buildLeaderboardEmbed,
    buildLeaderboardComponents
};
