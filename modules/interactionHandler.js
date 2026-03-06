const { MessageFlags } = require('discord.js');
const logger = require('./core/logger');
const { hasAdminAccess } = require('./core/auth');
const { getAllGuildConfigs, addUser, removeUser, removeGuild, getGuildUsers } = require('./core/configManager');
const { performDailyCheck } = require('./core/scheduledTasks');
const { setCachedAdminRole } = require('./core/auth');

// Import Specialized Handlers
const { handleAutocomplete } = require('./handlers/autocompleteHandler');
const { handleProfile, handleAddUser, handleRemoveUser, handleListUsers, handleLeetStats, handleCalendar } = require('./handlers/membershipHandlers');
const { handleSetChannel, handleSetAdmin, handleToggleBroadcast, handleLeaderboard, handleForceCheck, handleToggleContestReminder, handleManageCron, handleConfig } = require('./handlers/adminHandlers');
const { handleBroadcast, handleBroadcastLogs } = require('./handlers/broadcastHandlers');
const { handleHealthchecks } = require('./handlers/hcHandlers');
const { handleInvite, handleBotInfo, handleStatus, handleContest, handleDaily, handleHallOfFame, handleTelegram, handleHelp } = require('./handlers/miscHandlers');
const { handleLeaderboardPagination, handleBroadcastLogsPagination, handleWelcomeBackRestore, handleBroadcastSubmit } = require('./handlers/uiHandler');

// Export formatLeetCodeContestEmbed for index.js if needed (though it should be in utils)
const { formatLeetCodeContestEmbed } = require('./utils/embeds');

async function initializeAutocompleteCache() {
    // This could just pre-warm the caches in autocompleteHandler if desired
    logger.info('Initializing autocomplete cache...');
    try {
        const guilds = await getAllGuildConfigs();
        logger.info(`Initialized autocomplete cache for ${guilds.length} guild(s)`);
    } catch (error) {
        logger.error('Error initializing autocomplete cache:', error);
    }
}

async function handleInteraction(interaction) {
    if (interaction.isChatInputCommand()) {
        const { commandName } = interaction;

        try {
            switch (commandName) {
                case 'setchannel': await handleSetChannel(interaction); break;
                case 'setadminrole': await handleSetAdmin(interaction, setCachedAdminRole); break;
                case 'adduser': await handleAddUser(interaction, addUser); break;
                case 'removeuser': await handleRemoveUser(interaction, removeUser); break;
                case 'check':
                case 'forcecheck': await handleForceCheck(interaction, performDailyCheck); break;
                case 'leaderboard': await handleLeaderboard(interaction, getGuildUsers); break;
                case 'invite': await handleInvite(interaction); break;
                case 'status': await handleStatus(interaction); break;
                case 'contest': await handleContest(interaction); break;
                case 'help': await handleHelp(interaction); break;
                case 'botinfo': await handleBotInfo(interaction); break;
                case 'broadcast': await handleBroadcast(interaction); break;
                case 'broadcastlogs': await handleBroadcastLogs(interaction); break;
                case 'togglebroadcast': await handleToggleBroadcast(interaction, hasAdminAccess); break;
                case 'profile': await handleProfile(interaction, getGuildUsers); break;
                case 'daily': await handleDaily(interaction, getGuildUsers); break;
                case 'hc': await handleHealthchecks(interaction); break;
                case 'togglecontestreminder': await handleToggleContestReminder(interaction, hasAdminAccess); break;
                case 'listusers': await handleListUsers(interaction, getGuildUsers); break;
                case 'managecron': await handleManageCron(interaction); break;
                case 'leetstats': await handleLeetStats(interaction, getGuildUsers); break;
                case 'config': await handleConfig(interaction); break;
                case 'calendar': await handleCalendar(interaction); break;
                case 'halloffame': await handleHallOfFame(interaction); break;
                case 'telegram': await handleTelegram(interaction, hasAdminAccess); break;
                default:
                    await interaction.reply({ content: 'Unknown command.', flags: MessageFlags.Ephemeral });
            }
        } catch (error) {
            if (error.code === 40060) {
                logger.warn(`Interaction ${interaction.id} already acknowledged for command ${commandName}. Skipping error response.`);
                return;
            } else if (error.code === 10062) {
                logger.warn(`Interaction ${interaction.id} unknown/expired for command ${commandName}. Skipping error response.`);
                return;
            }
            logger.error(`Error handling command ${commandName}:`, error);
            const msg = { content: '❌ An error occurred while processing this command.', flags: MessageFlags.Ephemeral };
            try {
                if (interaction.deferred || interaction.replied) {
                    await interaction.editReply(msg);
                } else {
                    await interaction.reply(msg);
                }
            } catch (replyError) {
                if (replyError.code === 40060) {
                    logger.warn(`Failed to send error response for ${commandName} because interaction was already acknowledged.`);
                } else if (replyError.code === 10062) {
                    logger.warn(`Failed to send error response for ${commandName} because interaction is unknown/expired.`);
                } else {
                    logger.error(`Error while sending error response for ${commandName}:`, replyError);
                }
            }
        }

    } else if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);

    } else if (interaction.isButton()) {
        const customId = interaction.customId;

        try {
            if (customId.startsWith('lb:')) {
                await handleLeaderboardPagination(interaction, getGuildUsers);
            } else if (customId.startsWith('blpg:')) {
                await handleBroadcastLogsPagination(interaction);
            } else if (customId.startsWith('guild_restore_')) {
                await handleWelcomeBackRestore(interaction, removeGuild);
            }
        } catch (error) {
            logger.error(`Error handling button ${customId}:`, error);
        }

    } else if (interaction.isModalSubmit()) {
        const customId = interaction.customId;

        try {
            if (customId.startsWith('broadcast_')) {
                await handleBroadcastSubmit(interaction);
            }
        } catch (error) {
            logger.error(`Error handling modal submit ${customId}:`, error);
        }
    }
}

module.exports = {
    handleInteraction,
    initializeAutocompleteCache,
    formatLeetCodeContestEmbed
};