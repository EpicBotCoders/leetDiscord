const logger = require('../core/logger');
const { runDailySummaryReport } = require('../core/scheduledTasks');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');

/**
 * Handles /forcesummary command.
 * Manually triggers the end-of-day summary report.
 * Restricted to Bot Owner only.
 */
async function handleForceSummary(interaction) {
    if (interaction.user.id !== process.env.BOT_OWNER_ID) {
        await safeReply(interaction, { content: '❌ You are not authorized to use this command.', flags: 64 });
        return;
    }

    await safeDeferReply(interaction, true);

    try {
        logger.info(`Owner ${interaction.user.tag} manually triggered runDailySummaryReport`);
        await runDailySummaryReport(interaction.client);
        await safeReply(interaction, '✅ Final daily summary report has been triggered successfully.');
    } catch (error) {
        logger.error('Error in handleForceSummary:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

module.exports = {
    handleForceSummary
};
