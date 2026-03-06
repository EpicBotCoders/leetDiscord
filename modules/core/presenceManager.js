const { ActivityType, PresenceUpdateStatus } = require('discord.js');
const packageJson = require('../../package.json');
const Guild = require('../models/Guild');
const logger = require('./logger');

let activityIndex = 0;
let presenceInterval = null;

/**
 * Get dynamic activities for the bot
 */
async function getActivities(client) {
    const totalGuilds = await Guild.countDocuments({ isActive: { $ne: false } });
    const version = packageJson.version || '2.0.0';

    return [
        {
            name: `v${version} | ${totalGuilds} servers`,
            type: ActivityType.Playing
        },
        {
            name: '/help for commands',
            type: ActivityType.Listening
        },
        {
            name: 'Featured: /check',
            type: ActivityType.Watching
        },
        {
            name: 'Featured: /stats',
            type: ActivityType.Watching
        }
    ];
}

/**
 * Update the bot's presence
 */
async function updatePresence(client) {
    try {
        if (!client.user) return;

        const activities = await getActivities(client);
        const activity = activities[activityIndex];

        client.user.setPresence({
            activities: [activity],
            status: PresenceUpdateStatus.Online
        });

        // Rotate index
        activityIndex = (activityIndex + 1) % activities.length;
    } catch (error) {
        logger.error('Error updating presence:', error);
    }
}

/**
 * Initialize periodic presence updates
 */
function initializePresence(client) {
    try {
        const intervalMs = parseInt(process.env.PRESENCE_UPDATE_INTERVAL) || 600000; // Default 10 mins

        // Initial update
        updatePresence(client);

        // Schedule periodic updates
        if (presenceInterval) clearInterval(presenceInterval);
        presenceInterval = setInterval(() => updatePresence(client), intervalMs);

        logger.info(`Presence manager initialized with ${intervalMs}ms interval`);
    } catch (error) {
        logger.error('Error initializing presence manager:', error);
    }
}

/**
 * Stop presence updates
 */
function stopPresence() {
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
        logger.info('Presence manager stopped');
    }
}

/**
 * Reset internal state (for testing)
 */
function resetState() {
    activityIndex = 0;
    if (presenceInterval) {
        clearInterval(presenceInterval);
        presenceInterval = null;
    }
}

module.exports = {
    initializePresence,
    updatePresence,
    stopPresence,
    resetState
};
