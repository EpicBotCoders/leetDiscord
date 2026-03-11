const { MessageFlags } = require('discord.js');
const UserProfile = require('../models/UserProfile');
const logger = require('../core/logger');
const { getUserProfile, getUserBadges, getUserCalendar } = require('../services/apiUtils');
const { generateBadgeChart, generateCalendarChart } = require('../utils/chartGenerator');
const { formatUserProfileEmbed } = require('../utils/embeds');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');
const { getGuildUsers } = require('../core/configManager');

/**
 * Handles the `/profile` command.
 * Fetches a user's LeetCode profile and badge data, stores it in the database,
 * and displays a formatted embed with optional badge chart.
 *
 * If no username is provided, the command attempts to resolve the
 * caller's linked LeetCode username from the guild configuration.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {(guildId: string) => Promise<Record<string,string>>} getGuildUsers
 * @returns {Promise<void>}
 */
async function handleProfile(interaction, getGuildUsers) {
    await safeDeferReply(interaction);
    let username = interaction.options.getString('username');

    if (!username) {
        const guildUsers = await getGuildUsers(interaction.guildId);
        for (const [lc, discordId] of Object.entries(guildUsers)) {
            if (discordId === interaction.user.id) {
                username = lc;
                break;
            }
        }
    }

    if (!username) {
        await safeReply(interaction, 'You are not registered in this server. Please use `/adduser` or specify a username.');
        return;
    }

    try {
        const [profileData, badgesData] = await Promise.all([
            getUserProfile(username),
            getUserBadges(username)
        ]);

        if (!profileData || !profileData.profile) {
            await safeReply(interaction, `❌ Could not find LeetCode profile for **${username}**.`);
            return;
        }

        const { profile, submitStats } = profileData;
        const { badges } = badgesData;

        const statsObj = {};
        if (submitStats && submitStats.acSubmissionNum) {
            submitStats.acSubmissionNum.forEach(s => {
                statsObj[s.difficulty.toLowerCase()] = { count: s.count, submissions: s.submissions };
            });
        }

        await UserProfile.findOneAndUpdate(
            { username },
            {
                username,
                displayName: profile.realName,
                avatar: profile.userAvatar,
                ranking: profile.ranking,
                reputation: profile.reputation,
                skillTags: profile.skillTags,
                aboutMe: profile.aboutMe,
                stats: statsObj,
                badges,
                lastUpdated: new Date()
            },
            { upsert: true, new: true }
        );

        const embed = formatUserProfileEmbed(profileData, badgesData);
        const badgeAttachment = await generateBadgeChart(username, badges);

        if (badgeAttachment) {
            embed.image = { url: 'attachment://badges.png' };
            await safeReply(interaction, { embeds: [embed], files: [badgeAttachment] });
        } else {
            await safeReply(interaction, { embeds: [embed] });
        }
    } catch (error) {
        logger.error(`Error handling profile for ${username}:`, error);
        await safeReply(interaction, '❌ Failed to fetch LeetCode profile data. Please try again later.');
    }
}

/**
 * Handles the `/adduser` command.
 * Registers a LeetCode username to the current guild and optionally
 * links it to a Discord user.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {(guildId: string, username: string, discordId?: string|null) => Promise<string>} addUser
 * @returns {Promise<void>}
 */
async function handleAddUser(interaction, addUser) {
    const username = interaction.options.getString('username');
    const userOption = interaction.options.getMember('discord_user');
    const discordId = userOption ? userOption.id : null;

    await safeDeferReply(interaction);

    try {
        const result = await addUser(interaction.guildId, username, discordId);
        await safeReply(interaction, result);
    } catch (error) {
        logger.error('Error in handleAddUser:', error);
        await safeReply(interaction, `Error adding user: ${error.message}`);
    }
}

/**
 * Handles the `/removeuser` command.
 * Removes a tracked LeetCode username from the guild configuration.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {(guildId: string, username: string) => Promise<string>} removeUser
 * @returns {Promise<void>}
 */
async function handleRemoveUser(interaction, removeUser) {
    const username = interaction.options.getString('username');
    await safeDeferReply(interaction);

    try {
        const result = await removeUser(interaction.guildId, username);
        await safeReply(interaction, result);
    } catch (error) {
        logger.error('Error in handleRemoveUser:', error);
        await safeReply(interaction, `Error removing user: ${error.message}`);
    }
}

/**
 * Handles the `/listusers` command.
 * Displays all LeetCode usernames currently tracked in the guild
 * along with their linked Discord accounts.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {(guildId: string) => Promise<Record<string,string>>} getGuildUsers
 * @returns {Promise<void>}
 */
async function handleListUsers(interaction, getGuildUsers) {
    await safeDeferReply(interaction, true);
    try {
        const users = await getGuildUsers(interaction.guildId);
        if (Object.keys(users).length === 0) {
            await safeReply(interaction, 'No users are being tracked in this server.');
            return;
        }

        let userList = '**Tracked Users:**\n';
        for (const [username, discordId] of Object.entries(users)) {
            userList += `- **${username}** (${discordId ? `<@${discordId}>` : 'No Discord link'})\n`;
        }

        await safeReply(interaction, { content: userList });
    } catch (error) {
        logger.error('Error in handleListUsers:', error);
        await safeReply(interaction, '❌ Failed to list users.');
    }
}

/**
 * Handles the `/leetstats` command.
 * Shows LeetCode activity statistics such as streak and total active days.
 *
 * If `show_all` is true, statistics for all tracked users are shown.
 * Otherwise the command resolves the caller's linked username.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @param {(guildId: string) => Promise<Record<string,string>>} getGuildUsers
 * @returns {Promise<void>}
 */
async function handleLeetStats(interaction, getGuildUsers) {
    await safeDeferReply(interaction);
    const showAll = interaction.options.getBoolean('show_all') || false;

    try {
        const guildUsers = await getGuildUsers(interaction.guildId);
        if (Object.keys(guildUsers).length === 0) {
            await safeReply(interaction, 'No users are being tracked in this server.');
            return;
        }

        if (showAll) {
            let statsMsg = '**Server LeetCode Stats:**\n';
            for (const username of Object.keys(guildUsers)) {
                try {
                    const data = await getUserCalendar(username);
                    statsMsg += `- **${username}**: Streak: ${data.streak || 0}, Active Days: ${data.totalActiveDays || 0}\n`;
                } catch (e) {
                    statsMsg += `- **${username}**: (Error fetching stats)\n`;
                }
            }
            await safeReply(interaction, statsMsg);
        } else {
            let targetUsername = null;
            for (const [username, discordId] of Object.entries(guildUsers)) {
                if (discordId === interaction.user.id) {
                    targetUsername = username;
                    break;
                }
            }

            if (!targetUsername) {
                await safeReply(interaction, 'You are not registered in this server. Use `/adduser` or use `show_all: true`.');
                return;
            }

            const data = await getUserCalendar(targetUsername);
            const embed = {
                color: 0x00d9ff,
                title: `📊 LeetCode Stats: ${targetUsername}`,
                fields: [
                    { name: '🔥 Current Streak', value: `${data.streak || 0} days`, inline: true },
                    { name: '✅ Total Active Days', value: `${data.totalActiveDays || 0}`, inline: true },
                    { name: '📅 Active Years', value: data.activeYears?.join(', ') || 'N/A', inline: false }
                ],
                timestamp: new Date()
            };
            await safeReply(interaction, { embeds: [embed] });
        }
    } catch (error) {
        logger.error('Error in handleLeetStats:', error);
        await safeReply(interaction, '❌ Failed to fetch stats.');
    }
}

/**
 * Handles the `/calendar` command.
 * Generates a visual activity chart based on a user's LeetCode submission calendar.
 *
 * Supported ranges:
 * - current_month
 * - last 7 days
 * - last 30 days
 * - last 90 days
 *
 * The command resolves the target user either from the provided
 * username option or from the caller's linked account.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleCalendar(interaction) {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const rangeOption = interaction.options.getString('range') || 'current_month';

        let range;
        let rangeLabel;
        let daysLabel;

        if (rangeOption === 'current_month') {
            const now = new Date();
            range = 'current_month';
            const monthName = now.toLocaleDateString('en-US', { month: 'long', timeZone: 'UTC' });
            rangeLabel = `${monthName} ${now.getUTCFullYear()}`;
            daysLabel = 'This Month';
        } else {
            range = [7, 30, 90].includes(parseInt(rangeOption, 10)) ? parseInt(rangeOption, 10) : 7;
            rangeLabel = `Last ${range} days`;
            daysLabel = `${range}d`;
        }

        const usernameOption = interaction.options.getString('username');
        const guildUsers = await getGuildUsers(interaction.guildId);

        if (Object.keys(guildUsers).length === 0) {
            await interaction.editReply('No users are being tracked in this server. Use `/adduser` to start tracking!');
            return;
        }

        let targetUsername = null;
        let targetDiscordId = null;

        if (usernameOption) {
            if (!guildUsers[usernameOption]) {
                await interaction.editReply(`❌ User **${usernameOption}** is not tracked in this server.`);
                return;
            }
            targetUsername = usernameOption;
            targetDiscordId = guildUsers[usernameOption];
        } else {
            const entry = Object.entries(guildUsers).find(([leetcode, discordId]) => discordId === interaction.user.id);
            if (!entry) {
                await interaction.editReply('❌ You are not registered in this server. Use `/adduser` to start tracking your LeetCode progress!');
                return;
            }
            targetUsername = entry[0];
            targetDiscordId = entry[1];
        }

        const calendarData = await getUserCalendar(targetUsername);
        if (!calendarData) {
            await interaction.editReply('❌ Could not fetch your LeetCode calendar. Please try again later.');
            return;
        }

        const chartAttachment = await generateCalendarChart(targetUsername, calendarData, range);

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        let start, end, totalDays;

        if (range === 'current_month') {
            start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
            end = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + 1, 0));
            end.setUTCHours(23, 59, 59, 999);
            totalDays = end.getUTCDate();
        } else {
            start = new Date(today);
            start.setDate(today.getDate() - (range - 1));
            end = new Date(today.getTime() + 86399000);
            totalDays = range;
        }

        const mention = targetDiscordId ? `<@${targetDiscordId}>` : targetUsername;

        const submissionCalendar = calendarData?.submissionCalendar || calendarData?.calendar || {};
        let activeDaysInRange = 0;

        const startTimeTs = Math.floor(start.getTime() / 1000);
        const endTimeTs = Math.floor(end.getTime() / 1000);

        for (const [key, count] of Object.entries(submissionCalendar)) {
            const ts = parseInt(key, 10);
            if (ts >= startTimeTs && ts <= endTimeTs && count > 0) {
                activeDaysInRange++;
            }
        }

        const fields = [
            { name: '🔥 Current Streak', value: `**${calendarData.streak || 0}** days`, inline: true },
            { name: `📅 Active Days (${daysLabel})`, value: `**${activeDaysInRange}** / ${totalDays}`, inline: true },
            { name: '📆 Total Active', value: `**${calendarData.totalActiveDays || 0}**`, inline: true }
        ];

        const embed = {
            color: 0x5865F2,
            title: `🗓️ Activity Calendar for ${targetUsername}`,
            description: `Showing LeetCode activity for **${rangeLabel}** (${start.toISOString().slice(0, 10)} → ${end.toISOString().slice(0, 10)}) for ${mention}`,
            fields,
            image: { url: 'attachment://calendar-chart.png' },
            footer: { text: 'Chart colors: Green (Active Day), Gray (No Activity)' },
            timestamp: new Date()
        };

        const response = { embeds: [embed] };
        if (chartAttachment) response.files = [chartAttachment];

        await interaction.editReply(response);
    } catch (error) {
        logger.error('Error in handleCalendar:', error);
        await interaction.editReply('❌ An error occurred while fetching calendar data. Please try again later.');
    }
}

module.exports = {
    handleProfile,
    handleAddUser,
    handleRemoveUser,
    handleListUsers,
    handleLeetStats,
    handleCalendar
};