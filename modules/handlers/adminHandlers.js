const { MessageFlags } = require('discord.js');
const logger = require('../core/logger');
const {
    getGuildConfig,
    updateGuildChannel,
    setAdminRole,
    toggleBroadcast,
    addCronJob,
    removeCronJob,
    listCronJobs,
    getGuildUsers,
    getAdminRole,
    getBroadcastEnabled
} = require('../core/configManager');
const {
    buildLeaderboardRows,
    buildLeaderboardEmbed,
    buildLeaderboardComponents
} = require('../utils/leaderboardUtils');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');
const { hasAdminAccess } = require('../core/auth');
const TelegramUser = require('../models/TelegramUser');

async function handleSetChannel(interaction) {
    const channel = interaction.options.getChannel('channel');
    await safeDeferReply(interaction, true);

    try {
        const result = await updateGuildChannel(interaction.guildId, channel.id);
        await safeReply(interaction, `✅ ${result} <#${channel.id}>`);
    } catch (error) {
        logger.error('Error in handleSetChannel:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

async function handleSetAdmin(interaction, setCachedAdminRole) {
    const role = interaction.options.getRole('role');
    await safeDeferReply(interaction, true);

    try {
        const roleId = await setAdminRole(interaction.guildId, role.id);
        setCachedAdminRole(interaction.guildId, roleId);
        await safeReply(interaction, `✅ Admin role set to **${role.name}**. Users with this role can now manage the bot.`);
    } catch (error) {
        logger.error('Error in handleSetAdmin:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

async function handleToggleBroadcast(interaction, hasAdminAccess) {
    const guild = interaction.guild;
    if (!guild) {
        await safeReply(interaction, { content: 'This command can only be used in a server.', flags: 64 });
        return;
    }

    const guildOwner = await guild.fetchOwner();
    const isOwner = interaction.user.id === guildOwner.id;
    const isAdmin = await hasAdminAccess(interaction);

    if (!isOwner && !isAdmin) {
        await safeReply(interaction, {
            content: 'Only the server owner or users with the configured Admin role can toggle broadcasts.',
            flags: 64
        });
        return;
    }

    await safeDeferReply(interaction, true);

    try {
        const guildConfig = await getGuildConfig(interaction.guildId);
        if (!guildConfig) {
            await safeReply(interaction, 'This server is not configured yet. Please run `/setchannel` first.');
            return;
        }

        const newStatus = await toggleBroadcast(interaction.guildId);
        const statusText = newStatus ? 'enabled' : 'disabled';
        await safeReply(interaction, `System broadcasts are now **${statusText}** for this server.`);
    } catch (error) {
        logger.error('Error in handleToggleBroadcast:', error);
        await safeReply(interaction, 'An error occurred while toggling broadcasts.');
    }
}

async function handleLeaderboard(interaction) {
    const period = interaction.options.getString('period') || 'daily';
    const metric = interaction.options.getString('metric') || 'streak';
    const ephemeral = interaction.options.getBoolean('ephemeral') || false;

    await interaction.deferReply({ flags: ephemeral ? MessageFlags.Ephemeral : undefined });

    try {
        const guildUsers = await getGuildUsers(interaction.guildId);
        if (Object.keys(guildUsers).length === 0) {
            await interaction.editReply('No users are being tracked in this server. Use `/adduser` to start tracking!');
            return;
        }

        const guildConfig = await getGuildConfig(interaction.guildId);
        const page = 1;

        const { rows, totalUsers } = await buildLeaderboardRows(
            interaction.guildId,
            guildUsers,
            guildConfig,
            metric,
            period
        );

        if (rows.length === 0) {
            await interaction.editReply('No leaderboard data available for this period yet.');
            return;
        }

        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        const pagedRows = rows.slice(0, pageSize);

        const embed = buildLeaderboardEmbed(
            interaction.guild,
            metric,
            period,
            pagedRows,
            page,
            totalPages,
            totalUsers
        );

        const components = buildLeaderboardComponents(
            interaction.guildId,
            interaction.user.id,
            metric,
            period,
            page,
            totalPages
        );

        await interaction.editReply({ embeds: [embed], components });
    } catch (error) {
        logger.error('Error in handleLeaderboard:', error);
        await interaction.editReply('An error occurred while building the leaderboard.');
    }
}

async function handleForceCheck(interaction, performDailyCheck) {
    await safeDeferReply(interaction, true);

    try {
        const result = await performDailyCheck(interaction.client, interaction.guildId);
        await safeReply(interaction, result || 'Daily check completed.');
    } catch (error) {
        logger.error('Error in handleForceCheck:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

async function handleToggleContestReminder(interaction, hasAdminAccess) {
    const isAdmin = await hasAdminAccess(interaction);
    if (!isAdmin) {
        await safeReply(interaction, { content: '❌ Only administrators can use this command.', flags: 64 });
        return;
    }

    const value = interaction.options.getBoolean('enabled');
    const guildId = interaction.guildId;

    try {
        const Guild = require('../models/Guild');
        await Guild.findOneAndUpdate({ guildId }, { $set: { contestRemindersEnabled: value } });
        await safeReply(interaction, { content: `✅ Contest reminders have been **${value ? 'enabled' : 'disabled'}** for this server.`, flags: 64 });
    } catch (error) {
        logger.error(`Error in handleToggleContestReminder:`, error);
        await safeReply(interaction, { content: '❌ An error occurred while processing your request.', flags: 64 });
    }
}

async function handleManageCron(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await safeDeferReply(interaction, true);

    try {
        if (subcommand === 'add') {
            const hours = interaction.options.getInteger('hours');
            const minutes = interaction.options.getInteger('minutes');
            const result = await addCronJob(interaction.guildId, hours, minutes);

            if (result.startsWith('Added new check time')) {
                const { invalidateCronJobsCache } = require('./autocompleteHandler');
                invalidateCronJobsCache(interaction.guildId);

                const { stopAllCronJobs, initializeScheduledTasks } = require('../core/scheduledTasks');
                stopAllCronJobs();
                await initializeScheduledTasks(interaction.client);
            }

            await safeReply(interaction, result);
        } else if (subcommand === 'remove') {
            const timeStr = interaction.options.getString('time');
            const [hours, minutes] = timeStr.split(':');
            const result = await removeCronJob(interaction.guildId, parseInt(hours), parseInt(minutes));

            if (result.startsWith('Removed check time')) {
                const { invalidateCronJobsCache } = require('./autocompleteHandler');
                invalidateCronJobsCache(interaction.guildId);

                const { stopAllCronJobs, initializeScheduledTasks } = require('../core/scheduledTasks');
                stopAllCronJobs();
                await initializeScheduledTasks(interaction.client);
            }

            await safeReply(interaction, result);
        } else if (subcommand === 'list') {
            const jobs = await listCronJobs(interaction.guildId);
            if (jobs.length === 0) {
                await safeReply(interaction, 'No check times scheduled.');
                return;
            }
            const jobStrings = jobs.map(j => {
                const [min, hour] = j.split(' ');
                return `${hour.padStart(2, '0')}:${min.padStart(2, '0')} UTC`;
            });
            await safeReply(interaction, `**Scheduled Check Times:**\n${jobStrings.join(', ')}`);
        }
    } catch (error) {
        logger.error('Error in handleManageCron:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

async function handleConfig(interaction) {
    const isAdmin = await hasAdminAccess(interaction, getAdminRole);
    if (!isAdmin) {
        await interaction.reply({
            content: 'You need the configured Admin role (or Administrator permission) to view the configuration.',
            flags: MessageFlags.Ephemeral
        });
        return;
    }

    await interaction.deferReply({ flags: MessageFlags.Ephemeral });

    try {
        const guildConfig = await getGuildConfig(interaction.guildId);
        if (!guildConfig) {
            await interaction.editReply('This server is not configured yet. Please run `/setchannel` first.');
            return;
        }

        const guildUsers = await getGuildUsers(interaction.guildId);
        const trackedUsernames = Object.keys(guildUsers);

        const cronSchedules = await listCronJobs(interaction.guildId);
        const formattedCron = cronSchedules.length
            ? cronSchedules.map(schedule => {
                const [minutes, hours] = schedule.split(' ');
                return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')} UTC`;
            }).join('\n')
            : 'None configured';

        const totalTrackedUsers = trackedUsernames.length;
        const discordLinkedUsers = Object.values(guildUsers).filter(id => !!id).length;

        const telegramEnabledGlobally = !!process.env.TELEGRAM_BOT_TOKEN;

        let telegramEnabledCount = 0;
        if (telegramEnabledGlobally && totalTrackedUsers > 0) {
            telegramEnabledCount = await TelegramUser.countDocuments({
                leetcodeUsername: { $in: trackedUsernames },
                isEnabled: true,
                telegramChatId: { $ne: null }
            });
        }

        const adminRoleId = await getAdminRole(interaction.guildId);
        let adminRoleDisplay = 'Not configured (fallback: Discord Administrator)';
        if (adminRoleId) {
            const role = interaction.guild?.roles?.cache?.get(adminRoleId);
            adminRoleDisplay = role ? role.toString() : `<@&${adminRoleId}>`;
        }

        const broadcastEnabled = await getBroadcastEnabled(interaction.guildId);
        const broadcastStatus = broadcastEnabled ? '✅ **Enabled**' : '❌ **Disabled**';

        const announcementChannel = guildConfig.channelId
            ? `<#${guildConfig.channelId}>`
            : 'Not set (use `/setchannel`)';

        const embed = {
            color: 0x00d9ff,
            title: '⚙️ Server Configuration Overview',
            fields: [
                {
                    name: '📢 Announcement Channel',
                    value: announcementChannel,
                    inline: true
                },
                {
                    name: '⏰ Check Schedule',
                    value: formattedCron,
                    inline: true
                },
                {
                    name: '👥 Tracked Users',
                    value: `Total: **${totalTrackedUsers}**\nLinked to Discord: **${discordLinkedUsers}**`,
                    inline: true
                },
                {
                    name: '📲 Telegram Integration',
                    value: telegramEnabledGlobally
                        ? `Status: **Enabled** (token configured)\nUsers with notifications on: **${telegramEnabledCount}**`
                        : 'Status: **Disabled** (no Telegram bot token configured)',
                    inline: true
                },
                {
                    name: '🛡️ Admin Role',
                    value: adminRoleDisplay,
                    inline: true
                },
                {
                    name: '📡 System Broadcasts',
                    value: broadcastStatus,
                    inline: true
                }
            ],
            footer: {
                text: 'Use /setchannel, /managecron, /adduser, /telegram, and /togglebroadcast to update this configuration.'
            },
            timestamp: new Date()
        };

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error('Error in handleConfig:', error);
        await interaction.editReply('An error occurred while fetching the configuration.');
    }
}

module.exports = {
    handleSetChannel,
    handleSetAdmin,
    handleToggleBroadcast,
    handleLeaderboard,
    handleForceCheck,
    handleToggleContestReminder,
    handleManageCron,
    handleConfig
};
