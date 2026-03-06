const logger = require('../core/logger');

/**
 * Safely defers an interaction response, handling cases where it might already be acknowledged.
 * @param {import('discord.js').Interaction} interaction 
 * @param {boolean} ephemeral 
 */
async function safeDeferReply(interaction, ephemeral = false) {
    if (interaction.deferred || interaction.replied) return;
    try {
        await interaction.deferReply({ flags: ephemeral ? 64 : undefined });
    } catch (error) {
        if (error.code === 40060) {
            logger.warn(`Interaction ${interaction.id} already acknowledged.`);
        } else if (error.code === 10062) {
            logger.warn(`Interaction ${interaction.id} unknown/expired before deferReply.`);
        } else {
            throw error;
        }
    }
}

/**
 * Safely edits an interaction reply or sends a new one if not deferred/replied.
 * @param {import('discord.js').Interaction} interaction 
 * @param {string|import('discord.js').InteractionReplyOptions} content 
 */
async function safeReply(interaction, content) {
    const isEphemeral = typeof content === 'object' && content.flags === 64;

    try {
        if (interaction.deferred || interaction.replied) {
            await interaction.editReply(content);
        } else {
            if (typeof content === 'string') {
                await interaction.reply({ content, flags: isEphemeral ? 64 : undefined });
            } else {
                await interaction.reply(content);
            }
        }
    } catch (error) {
        if (error.code === 40060) {
            logger.warn(`Failed to reply to interaction ${interaction.id}: already acknowledged.`);
        } else if (error.code === 10062) {
            logger.warn(`Failed to reply to interaction ${interaction.id}: unknown/expired interaction.`);
        } else {
            logger.error(`Error replying to interaction ${interaction.id}:`, error);
        }
    }
}


module.exports = {
    safeDeferReply,
    safeReply
};
