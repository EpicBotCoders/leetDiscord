const cron = require('node-cron');
const SystemConfig = require('./models/SystemConfig');
const Guild = require('./models/Guild');
const logger = require('./logger');
const mongoose = require('mongoose');
const packageJson = require('../package.json');

const STATS_GUILD_ID = process.env.STATS_GUILD_ID;
const STATS_CHANNEL_ID = process.env.STATS_CHANNEL_ID;
const MESSAGE_ID_KEY = 'stats_panel_message_id';

let activeCronJob = null;

/**
 * Initialize the stats panel with periodic updates
 */
async function initializeStatsPanel(client) {
    try {
        const schedule = process.env.STATS_UPDATE_INTERVAL || '0 * * * *'; // Default: every hour
        logger.info(`Initializing stats panel with schedule: ${schedule}`);

        // Clear existing job if it exists
        if (activeCronJob) {
            activeCronJob.stop();
            activeCronJob = null;
        }

        // Schedule the stats panel update
        activeCronJob = cron.schedule(schedule, async () => {
            await updateStatsPanel(client);
        }, {
            timezone: 'UTC'
        });

        // Post initial stats panel
        await updateStatsPanel(client);

        logger.info('Stats panel initialized successfully');
    } catch (error) {
        logger.error('Error initializing stats panel:', error);
    }
}

/**
 * Update the stats panel message with current bot metrics
 */
async function updateStatsPanel(client) {
    try {
        logger.info('Updating stats panel...');

        // Fetch the target guild and channel
        const guild = await client.guilds.fetch(STATS_GUILD_ID);
        if (!guild) {
            logger.error(`Stats guild ${STATS_GUILD_ID} not found`);
            return;
        }

        const channel = await guild.channels.fetch(STATS_CHANNEL_ID);
        if (!channel) {
            logger.error(`Stats channel ${STATS_CHANNEL_ID} not found`);
            return;
        }

        // Calculate metrics
        const metrics = await calculateMetrics(client);

        // Build the embed
        const embed = buildStatsEmbed(metrics);

        // Get stored message ID
        const configDoc = await SystemConfig.findOne({ key: MESSAGE_ID_KEY });
        const storedMessageId = configDoc?.value;

        let message = null;

        // Try to edit existing message
        if (storedMessageId) {
            try {
                message = await channel.messages.fetch(storedMessageId);
                await message.edit({ embeds: [embed] });
                logger.info(`Updated stats panel message ${storedMessageId}`);
            } catch (fetchError) {
                logger.warn(`Failed to fetch/edit message ${storedMessageId}, will create new one:`, fetchError.message);
                message = null;
            }
        }

        // If no existing message or edit failed, send a new one
        if (!message) {
            message = await channel.send({ embeds: [embed] });
            logger.info(`Created new stats panel message ${message.id}`);

            // Store the new message ID
            await SystemConfig.findOneAndUpdate(
                { key: MESSAGE_ID_KEY },
                {
                    key: MESSAGE_ID_KEY,
                    value: message.id,
                    lastUpdated: new Date()
                },
                { upsert: true }
            );
        }

        logger.info('Stats panel update complete');
    } catch (error) {
        logger.error('Error updating stats panel:', error);
    }
}

/**
 * Calculate bot metrics
 */
async function calculateMetrics(client) {
    try {
        // Total configured guilds
        const totalGuilds = await Guild.countDocuments({});

        // Total active users (sum of users tracked across all guilds)
        const guilds = await Guild.find({});
        let totalUsers = 0;
        for (const guild of guilds) {
            if (guild.users) {
                totalUsers += guild.users.size;
            }
        }

        // Bot uptime (formatted)
        const uptimeMs = client.uptime || 0;
        const uptime = formatUptime(uptimeMs);

        // Version from package.json
        const version = packageJson.version;

        // Bot status (based on DB connection)
        let status = '🟢 Online';
        if (mongoose.connection.readyState !== 1) {
            status = '🟡 Degraded';
        }

        return {
            totalGuilds,
            totalUsers,
            uptime,
            version,
            status
        };
    } catch (error) {
        logger.error('Error calculating metrics:', error);
        return {
            totalGuilds: 0,
            totalUsers: 0,
            uptime: 'Unknown',
            version: packageJson.version,
            status: '🔴 Error'
        };
    }
}

/**
 * Build the stats embed
 */
function buildStatsEmbed(metrics) {
    return {
        color: 0x00d9ff,
        title: '📊 Bot Status & Usage Statistics',
        fields: [
            {
                name: '🌐 Status',
                value: metrics.status,
                inline: true
            },
            {
                name: '📦 Version',
                value: `v${metrics.version}`,
                inline: true
            },
            {
                name: '⏱️ Uptime',
                value: metrics.uptime,
                inline: true
            },
            {
                name: '🏛️ Configured Guilds',
                value: metrics.totalGuilds.toString(),
                inline: true
            },
            {
                name: '👥 Active Users',
                value: metrics.totalUsers.toString(),
                inline: true
            }
        ],
        footer: {
            text: 'Updates automatically every hour'
        },
        timestamp: new Date()
    };
}

/**
 * Format uptime in a human-readable format
 */
function formatUptime(ms) {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
        return `${days}d ${hours % 24}h ${minutes % 60}m`;
    } else if (hours > 0) {
        return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
        return `${minutes}m ${seconds % 60}s`;
    } else {
        return `${seconds}s`;
    }
}

/**
 * Stop the stats panel cron job
 */
function stopStatsPanel() {
    if (activeCronJob) {
        activeCronJob.stop();
        activeCronJob = null;
        logger.info('Stats panel cron job stopped');
    }
}

module.exports = {
    initializeStatsPanel,
    updateStatsPanel,
    stopStatsPanel
};
