const logger = require('../core/logger');
const Guild = require('../models/Guild');
const BroadcastLog = require('../models/BroadcastLog');
const {
    buildLeaderboardRows,
    buildLeaderboardEmbed,
    buildLeaderboardComponents
} = require('../utils/leaderboardUtils');
const { buildBroadcastLogsPage } = require('../utils/broadcastUtils');
const { getAllGuildConfigs, getGuildConfig, getGuildUsers } = require('../core/configManager');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');
const { MessageFlags } = require('discord.js');

async function handleLeaderboardPagination(interaction) {
    try {
        const parts = interaction.customId.split(':');
        // lb:guildId:ownerId:metric:period:page
        if (parts.length !== 6) {
            await interaction.reply({ content: 'Invalid leaderboard state.', flags: MessageFlags.Ephemeral });
            return;
        }

        const [, guildId, ownerId, metric, period, pageStr] = parts;

        if (guildId !== interaction.guildId) {
            await interaction.reply({ content: 'This leaderboard belongs to another server.', flags: MessageFlags.Ephemeral });
            return;
        }

        if (interaction.user.id !== ownerId) {
            await interaction.reply({ content: 'Only the user who requested this leaderboard can change pages.', flags: MessageFlags.Ephemeral });
            return;
        }

        const currentPage = parseInt(pageStr, 10) || 1;

        const guildUsers = await getGuildUsers(interaction.guildId);
        const guildConfig = await getGuildConfig(interaction.guildId);

        const { rows, totalUsers } = await buildLeaderboardRows(
            interaction.guildId,
            guildUsers,
            guildConfig,
            metric,
            period
        );

        if (rows.length === 0) {
            await interaction.update({ content: 'No leaderboard data available for this period yet.', components: [], embeds: [] });
            return;
        }

        const pageSize = 10;
        const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
        const page = Math.min(Math.max(1, currentPage), totalPages);
        const startIndex = (page - 1) * pageSize;
        const pagedRows = rows.slice(startIndex, startIndex + pageSize);

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
            ownerId,
            metric,
            period,
            page,
            totalPages
        );

        await interaction.update({ embeds: [embed], components });
    } catch (error) {
        logger.error('Error in handleLeaderboardPagination:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({ content: 'Error updating leaderboard.', flags: MessageFlags.Ephemeral });
        }
    }
}

async function handleBroadcastLogsPagination(interaction) {
    if (interaction.user.id !== process.env.BOT_OWNER_ID) {
        await safeReply(interaction, { content: 'You are not authorized.', flags: 64 });
        return;
    }

    const page = parseInt(interaction.customId.split(':')[1], 10);

    try {
        const allLogs = await BroadcastLog.find().sort({ sentAt: -1 }).lean();
        const { embed, components } = buildBroadcastLogsPage(allLogs, page);
        await interaction.update({ embeds: [embed], components });
    } catch (error) {
        logger.error('Error in handleBroadcastLogsPagination:', error);
    }
}

async function handleWelcomeBackRestore(interaction, removeGuild) {
    if (!interaction.memberPermissions.has('ManageGuild') && !interaction.memberPermissions.has('Administrator')) {
        await safeReply(interaction, { content: 'You need Manage Server or Administrator permissions to perform this action.', flags: 64 });
        return;
    }

    try {
        const guildId = interaction.guildId;

        if (interaction.customId === 'guild_restore_keep') {
            await Guild.findOneAndUpdate(
                { guildId },
                { $set: { isActive: true, channelValid: true } }
            );
            await interaction.update({
                content: '✅ **Configuration Restored**\nI have reactivated your previous configuration.',
                embeds: [],
                components: []
            });
            logger.info(`Guild ${guildId} chose to keep configuration`);
        } else if (interaction.customId === 'guild_restore_reset') {
            await removeGuild(guildId);
            await interaction.update({
                content: '🗑️ **Data Reset Successfully**\nYour previous data has been deleted. Use `/setchannel` to configure me.',
                embeds: [],
                components: []
            });
            logger.info(`Guild ${guildId} chose to reset configuration`);
        }
    } catch (error) {
        logger.error(`Error in handleWelcomeBackRestore for ${interaction.guildId}:`, error);
    }
}

async function handleBroadcastSubmit(interaction) {
    const type = interaction.customId.split('_')[1];
    const messageContent = interaction.fields.getTextInputValue('messageInput');

    let embedColor;
    let embedTitle;

    switch (type) {
        case 'info': embedColor = 0x3498db; embedTitle = '📢 Information'; break;
        case 'warn': embedColor = 0xf1c40f; embedTitle = '⚠️ Warning'; break;
        case 'alert': embedColor = 0xe74c3c; embedTitle = '🚨 Alert'; break;
        default: embedColor = 0x95a5a6; embedTitle = 'Broadcast';
    }

    const embed = {
        color: embedColor,
        title: embedTitle,
        description: messageContent,
        footer: { text: 'System Broadcast • Use /togglebroadcast to unsubscribe' },
        timestamp: new Date()
    };

    await safeDeferReply(interaction, true);

    try {
        const guilds = await getAllGuildConfigs();
        let successCount = 0;
        let failCount = 0;
        const failedGuilds = [];

        for (const guildConfig of guilds) {
            if (!guildConfig.channelId || guildConfig.broadcastEnabled === false) continue;

            try {
                const guild = await interaction.client.guilds.fetch(guildConfig.guildId).catch(() => null);
                if (!guild) {
                    failCount++;
                    failedGuilds.push({ guildId: guildConfig.guildId, reason: 'Bot is no longer in this guild' });
                    continue;
                }

                const channel = await guild.channels.fetch(guildConfig.channelId).catch(() => null);
                if (channel) {
                    await channel.send({ embeds: [embed] });
                    successCount++;
                } else {
                    failCount++;
                    failedGuilds.push({ guildId: guildConfig.guildId, reason: 'Announcement channel not found' });
                }
            } catch (error) {
                logger.warn(`Failed to send broadcast to guild ${guildConfig.guildId}:`, error.message);
                failCount++;
                failedGuilds.push({ guildId: guildConfig.guildId, reason: error.message });
            }
        }

        await BroadcastLog.create({
            senderId: interaction.user.id,
            senderUsername: interaction.user.username,
            type,
            message: messageContent,
            successCount,
            failCount,
            failedGuilds,
            sentAt: new Date()
        });

        await safeReply(interaction, `Broadcast sent successfully to ${successCount} guilds. Failed for ${failCount} guilds.`);
    } catch (error) {
        logger.error('Error in broadcast command:', error);
        await safeReply(interaction, 'An error occurred while sending the broadcast.');
    }
}

module.exports = {
    handleLeaderboardPagination,
    handleBroadcastLogsPagination,
    handleWelcomeBackRestore,
    handleBroadcastSubmit
};
