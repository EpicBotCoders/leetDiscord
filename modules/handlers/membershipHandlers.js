const UserProfile = require('../models/UserProfile');
const logger = require('../core/logger');
const { getUserProfile, getUserBadges, getUserCalendar } = require('../services/apiUtils');
const { generateBadgeChart, generateCalendarChart } = require('../utils/chartGenerator');
const { formatUserProfileEmbed } = require('../utils/embeds');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');

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

async function handleCalendar(interaction, getGuildUsers) {
    await safeDeferReply(interaction);
    const range = interaction.options.getString('range') || 'current_month';
    const usernameParam = interaction.options.getString('username');

    try {
        let targetUsername = usernameParam;
        if (!targetUsername) {
            const guildUsers = await getGuildUsers(interaction.guildId);
            for (const [username, discordId] of Object.entries(guildUsers)) {
                if (discordId === interaction.user.id) {
                    targetUsername = username;
                    break;
                }
            }
        }

        if (!targetUsername) {
            await safeReply(interaction, 'Target user not found or you are not registered.');
            return;
        }

        const calendarData = await getUserCalendar(targetUsername);

        let rangeDays = 30;
        if (range === '7') rangeDays = 7;
        else if (range === '90') rangeDays = 90;
        else if (range === 'current_month') {
            rangeDays = 'current_month';
        } else {
            rangeDays = parseInt(range);
        }

        const attachment = await generateCalendarChart(targetUsername, calendarData, rangeDays);
        if (attachment) {
            await safeReply(interaction, { files: [attachment] });
        } else {
            await safeReply(interaction, '❌ Failed to generate calendar chart.');
        }
    } catch (error) {
        logger.error('Error in handleCalendar:', error);
        await safeReply(interaction, '❌ An error occurred while generating the calendar.');
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
