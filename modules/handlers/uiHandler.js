const logger = require('../core/logger');
const Guild = require('../models/Guild');
const BroadcastLog = require('../models/BroadcastLog');
const {
    buildLeaderboardRows,
    buildLeaderboardEmbed,
    buildLeaderboardComponents
} = require('../utils/leaderboardUtils');
const { buildBroadcastLogsPage } = require('../utils/broadcastUtils');
const { getAllGuildConfigs } = require('../core/configManager');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');

async function handleLeaderboardPagination(interaction, getGuildUsers) {
    const [lb, guildId, ownerId, metric, period, pageStr] = interaction.customId.split(':');
    const page = parseInt(pageStr, 10);

    if (interaction.user.id !== ownerId) {
        await safeReply(interaction, { content: 'Only the user who requested the leaderboard can use these buttons.', flags: 64 });
        return;
    }

    try {
        const guildConfig = await Guild.findOne({ guildId });
        const guildUsers = await getGuildUsers(guildId);

        const { rows, totalUsers } = await buildLeaderboardRows(
            guildId,
            guildUsers,
            guildConfig,
            metric,
            period
        );

        const totalPages = Math.ceil(rows.length / 10);
        const start = (page - 1) * 10;
        const pageRows = rows.slice(start, start + 10);

        const embed = buildLeaderboardEmbed(interaction.guild, metric, period, pageRows, page, totalPages, totalUsers);
        const components = buildLeaderboardComponents(guildId, ownerId, metric, period, page, totalPages);

        await interaction.update({ embeds: [embed], components });
    } catch (error) {
        logger.error('Error in handleLeaderboardPagination:', error);
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
