const cron = require('node-cron');
const SystemConfig = require('./models/SystemConfig');
const Guild = require('./models/Guild');
const DailySubmission = require('./models/DailySubmission');
const logger = require('./logger');

const LEADERBOARD_CHANNEL_ID = process.env.LEADERBOARD_CHANNEL_ID;
const STATS_GUILD_ID = process.env.STATS_GUILD_ID;
const MESSAGE_ID_KEY = 'server_leaderboard_message_id';
const TOP_GUILDS_LIMIT = parseInt(process.env.LEADERBOARD_TOP_GUILDS || '10', 10);

let activeCronJob = null;

/**
 * Initialize the server leaderboard with periodic updates
 */
async function initializeServerLeaderboard(client) {
    try {
        const schedule = '0 * * * *'; // Every hour at minute 0
        logger.info(`Initializing server leaderboard with schedule: ${schedule}`);

        // Clear existing job if it exists
        if (activeCronJob) {
            activeCronJob.stop();
            activeCronJob = null;
        }

        // Schedule the leaderboard update
        activeCronJob = cron.schedule(schedule, async () => {
            await updateServerLeaderboard(client);
        }, {
            timezone: 'UTC'
        });

        // Post initial leaderboard
        await updateServerLeaderboard(client);

        logger.info('Server leaderboard initialized successfully');
    } catch (error) {
        logger.error('Error initializing server leaderboard:', error);
    }
}

/**
 * Update the global leaderboard message with current stats
 */
async function updateServerLeaderboard(client) {
    try {
        logger.info('Updating server leaderboard...');

        if (!STATS_GUILD_ID || !LEADERBOARD_CHANNEL_ID) {
            logger.error('STATS_GUILD_ID or LEADERBOARD_CHANNEL_ID is not set in environment variables');
            return;
        }

        // Fetch the specific guild using STATS_GUILD_ID
        const targetGuild = await client.guilds.fetch(STATS_GUILD_ID).catch(() => null);
        if (!targetGuild) {
            logger.error(`Server leaderboard guild ${STATS_GUILD_ID} not found`);
            return;
        }

        // Fetch the specific channel within that guild
        const targetChannel = await targetGuild.channels.fetch(LEADERBOARD_CHANNEL_ID).catch(() => null);
        if (!targetChannel) {
            logger.error(`Server leaderboard channel ${LEADERBOARD_CHANNEL_ID} not found in guild ${STATS_GUILD_ID}`);
            return;
        }

        // Build list of guild IDs the bot is currently in
        const guildIds = Array.from(client.guilds.cache.keys());

        // Calculate global metrics across all guilds the bot is in
        const metrics = await calculateGlobalMetrics(guildIds);

        // Build the embed (includes per-server breakdown)
        const embed = buildLeaderboardEmbed(metrics, targetGuild, client);

        // Get stored message ID
        const configDoc = await SystemConfig.findOne({ key: MESSAGE_ID_KEY });
        const storedMessageId = configDoc?.value;

        let message = null;

        // Try to edit existing message
        if (storedMessageId) {
            try {
                message = await targetChannel.messages.fetch(storedMessageId);
                await message.edit({ embeds: [embed] });
                logger.info(`Updated server leaderboard message ${storedMessageId}`);
            } catch (fetchError) {
                logger.warn(`Failed to fetch/edit message ${storedMessageId}, will create new one:`, fetchError.message);
                message = null;
            }
        }

        // If no existing message or edit failed, send a new one
        if (!message) {
            message = await targetChannel.send({ embeds: [embed] });
            logger.info(`Created new server leaderboard message ${message.id}`);

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

        logger.info('Server leaderboard update complete');
    } catch (error) {
        logger.error('Error updating server leaderboard:', error);
    }
}

/**
 * Calculate global metrics across all guilds the bot is in
 */
async function calculateGlobalMetrics(guildIds) {
    try {
        // Get guild configs only for guilds the bot is actually in
        const guilds = await Guild.find({ guildId: { $in: guildIds } });

        // Total users across all guilds using the bot
        let totalUsers = 0;
        const perGuildUserCounts = new Map(); // guildId -> users
        for (const guild of guilds) {
            let count = 0;
            if (guild.users) {
                count = guild.users.size || 0;
            }
            perGuildUserCounts.set(guild.guildId, count);
            totalUsers += count;
        }

        // Total submissions made by all users across all guilds,
        // and per-guild submissions using aggregation
        const submissionAgg = await DailySubmission.aggregate([
            { $match: { guildId: { $in: guildIds } } },
            {
                $group: {
                    _id: '$guildId',
                    submissions: { $sum: 1 }
                }
            }
        ]);

        let totalSubmissions = 0;
        const perGuildSubmissions = new Map(); // guildId -> submissions
        for (const row of submissionAgg) {
            const gid = row._id;
            const count = row.submissions || 0;
            perGuildSubmissions.set(gid, count);
            totalSubmissions += count;
        }

        // Build per-guild metrics array
        const guildMetrics = guilds.map(g => {
            const gid = g.guildId;
            return {
                guildId: gid,
                totalUsers: perGuildUserCounts.get(gid) || 0,
                totalSubmissions: perGuildSubmissions.get(gid) || 0
            };
        });

        return {
            totalUsers,
            totalSubmissions,
            totalGuilds: guilds.length,
            guildMetrics
        };
    } catch (error) {
        logger.error('Error calculating global metrics:', error);
        return {
            totalUsers: 0,
            totalSubmissions: 0,
            totalGuilds: 0,
            guildMetrics: []
        };
    }
}

/**
 * Build the leaderboard embed (global + per-server breakdown)
 */
function buildLeaderboardEmbed(metrics, statsGuild, client) {
    const fields = [
        {
            name: '🌐 Tracked Servers',
            value: `**${metrics.totalGuilds}** servers`,
            inline: true
        },
        {
            name: '👥 Total Users',
            value: `**${metrics.totalUsers}** users are using the bot`,
            inline: true
        },
        {
            name: '📊 Total Submissions',
            value: `**${metrics.totalSubmissions}** submissions made by all users combined`,
            inline: true
        }
    ];

    // Per-server top list (sorted by submissions, then users)
    if (metrics.guildMetrics && metrics.guildMetrics.length > 0) {
        const sorted = [...metrics.guildMetrics].sort((a, b) => {
            if (b.totalSubmissions !== a.totalSubmissions) {
                return b.totalSubmissions - a.totalSubmissions;
            }
            if (b.totalUsers !== a.totalUsers) {
                return b.totalUsers - a.totalUsers;
            }
            return a.guildId.localeCompare(b.guildId);
        });

        const top = sorted.slice(0, TOP_GUILDS_LIMIT);

        const lines = top.map((g, index) => {
            const rank = index + 1;
            const discordGuild = client.guilds.cache.get(g.guildId);
            const name = discordGuild?.name || g.guildId;
            return `**#${rank}** ${name}\n└ 👥 ${g.totalUsers} users • 📊 ${g.totalSubmissions} submissions`;
        });

        if (lines.length > 0) {
            fields.push({
                name: `🏅 Top ${lines.length} Servers (by submissions)`,
                value: lines.join('\n'),
                inline: false
            });
        }
    }

    return {
        color: 0x00d9ff,
        title: '🏆 Global Leaderboard Summary',
        description: `Overall statistics across all servers using the bot\n(Posted in **${statsGuild.name}**)`,
        fields,
        footer: {
            text: 'Updates automatically every hour'
        },
        timestamp: new Date()
    };
}

/**
 * Stop the server leaderboard cron job
 */
function stopServerLeaderboard() {
    if (activeCronJob) {
        activeCronJob.stop();
        activeCronJob = null;
        logger.info('Server leaderboard cron job stopped');
    }
}

module.exports = {
    initializeServerLeaderboard,
    updateServerLeaderboard,
    stopServerLeaderboard
};

