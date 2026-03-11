const { ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../core/logger');
const BroadcastLog = require('../models/BroadcastLog');
const { buildBroadcastLogsPage } = require('../utils/broadcastUtils');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');

/**
 * Handles the `/broadcast` command.
 * Opens a modal allowing the bot owner to compose a broadcast message
 * that will later be sent to all configured guild channels.
 *
 * Only the bot owner (defined via BOT_OWNER_ID) is authorized to use this command.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleBroadcast(interaction) {
    if (interaction.user.id !== process.env.BOT_OWNER_ID) {
        await safeReply(interaction, { content: 'You are not authorized to use this command.', flags: 64 });
        return;
    }

    const type = interaction.options.getString('type') || 'info';

    const modal = new ModalBuilder()
        .setCustomId(`broadcast_${type}`)
        .setTitle(`Send ${type.toUpperCase()} Broadcast`);

    const messageInput = new TextInputBuilder()
        .setCustomId('messageInput')
        .setLabel('Message Content')
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter the broadcast message here...')
        .setRequired(true);

    const row = new ActionRowBuilder().addComponents(messageInput);
    modal.addComponents(row);

    await interaction.showModal(modal);
}

/**
 * Handles the `/broadcastlogs` command.
 * Fetches previously sent broadcast logs from the database and
 * displays them in a paginated embed.
 *
 * Only accessible to the bot owner.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleBroadcastLogs(interaction) {
    if (interaction.user.id !== process.env.BOT_OWNER_ID) {
        await safeReply(interaction, { content: 'You are not authorized to use this command.', flags: 64 });
        return;
    }

    await safeDeferReply(interaction, true);

    try {
        const allLogs = await BroadcastLog.find().sort({ sentAt: -1 }).lean();

        if (allLogs.length === 0) {
            await safeReply(interaction, 'No broadcast logs found.');
            return;
        }

        const { embed, components } = buildBroadcastLogsPage(allLogs, 1);
        await safeReply(interaction, { embeds: [embed], components });
    } catch (error) {
        logger.error('Error in handleBroadcastLogs:', error);
        await safeReply(interaction, 'An error occurred while fetching broadcast logs.');
    }
}

module.exports = {
    handleBroadcast,
    handleBroadcastLogs
};