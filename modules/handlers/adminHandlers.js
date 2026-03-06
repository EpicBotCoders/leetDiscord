const logger = require('../core/logger');
const {
    getGuildConfig,
    updateGuildChannel,
    setAdminRole,
    toggleBroadcast,
    addCronJob,
    removeCronJob,
    listCronJobs
} = require('../core/configManager');
const {
    buildLeaderboardRows,
    buildLeaderboardEmbed,
    buildLeaderboardComponents
} = require('../utils/leaderboardUtils');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');

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

async function handleLeaderboard(interaction, getGuildUsers) {
    const metric = interaction.options.getString('metric') || 'streak';
    const period = interaction.options.getString('period') || 'all_time';

    await safeDeferReply(interaction);

    try {
        const guildConfig = await getGuildConfig(interaction.guildId);
        const guildUsers = await getGuildUsers(interaction.guildId);

        const { rows, totalUsers } = await buildLeaderboardRows(
            interaction.guildId,
            guildUsers,
            guildConfig,
            metric,
            period
        );

        if (rows.length === 0) {
            await safeReply(interaction, 'No data found for this leaderboard category.');
            return;
        }

        const totalPages = Math.ceil(rows.length / 10);
        const page1Rows = rows.slice(0, 10);
        const embed = buildLeaderboardEmbed(interaction.guild, metric, period, page1Rows, 1, totalPages, totalUsers);
        const components = buildLeaderboardComponents(interaction.guildId, interaction.user.id, metric, period, 1, totalPages);

        await safeReply(interaction, { embeds: [embed], components });
    } catch (error) {
        logger.error('Error in handleLeaderboard:', error);
        await safeReply(interaction, 'An error occurred while generating the leaderboard.');
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
            await safeReply(interaction, result);
        } else if (subcommand === 'remove') {
            const timeStr = interaction.options.getString('time');
            const [minutes, hours] = timeStr.split(' ');
            const result = await removeCronJob(interaction.guildId, parseInt(hours), parseInt(minutes));
            await safeReply(interaction, result);
        } else if (subcommand === 'list') {
            const jobs = await listCronJobs(interaction.guildId);
            if (jobs.length === 0) {
                await safeReply(interaction, 'No check times scheduled.');
                return;
            }
            const jobStrings = jobs.map(j => {
                const [min, hour] = j.split(' ');
                return `${hour.padStart(2, '0')}:${min.padStart(2, '0')}`;
            });
            await safeReply(interaction, `**Scheduled Check Times:**\n${jobStrings.join(', ')}`);
        }
    } catch (error) {
        logger.error('Error in handleManageCron:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

async function handleConfig(interaction) {
    await safeDeferReply(interaction, true);
    try {
        const config = await getGuildConfig(interaction.guildId);
        if (!config) {
            await safeReply(interaction, 'This server is not configured yet. Use `/setchannel` to begin.');
            return;
        }

        const embed = {
            color: 0x3498db,
            title: `⚙️ Bot Configuration: ${interaction.guild.name}`,
            fields: [
                { name: 'Channel', value: config.channelId ? `<#${config.channelId}>` : 'Not set', inline: true },
                { name: 'Admin Role', value: config.adminRoleId ? `<@&${config.adminRoleId}>` : 'Not set', inline: true },
                { name: 'Broadcasts', value: config.broadcastEnabled !== false ? '✅ Enabled' : '❌ Disabled', inline: true },
                {
                    name: 'Check Times', value: config.cronJobs.length > 0 ? config.cronJobs.map(j => {
                        const [m, h] = j.schedule.split(' ');
                        return `${h.padStart(2, '0')}:${m.padStart(2, '0')}`;
                    }).join(', ') : 'None', inline: false
                },
                { name: 'Contest Reminders', value: config.contestRemindersEnabled ? '✅ Enabled' : '❌ Disabled', inline: true }
            ],
            timestamp: new Date()
        };
        await safeReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error in handleConfig:', error);
        await safeReply(interaction, '❌ Failed to fetch configuration.');
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
