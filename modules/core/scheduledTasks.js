const cron = require('node-cron');
const {
    getUserSubmissions,
    getDailySlug,
    getBestDailySubmission,
    getLeetCodeContests,
    parseDuration,
    parseMemory
} = require('../services/apiUtils');
const { updateUserStats, getGuildConfig } = require('./configManager');
const { sendTelegramMessage } = require('../services/telegramBot');
const { generateSubmissionChart } = require('../utils/chartGenerator');
const { initializeStatsPanel } = require('../utils/statsPanel');
const { initializeServerLeaderboard } = require('../utils/serverLeaderboard');
const { PermissionsBitField } = require('discord.js');
const axios = require('axios');
const logger = require('./logger');
const Guild = require('../models/Guild');
const DailySubmission = require('../models/DailySubmission');
const { formatLeetCodeContestEmbed } = require('../utils/embeds');
const { buildRankedFields } = require('../utils/leaderboardUtils');

const activeTasks = [];

// Helper function to safely parse submission timestamp
function parseSubmissionTime(submission) {
    if (!submission.timestamp) {
        logger.warn('No timestamp in submission:', submission);
        return new Date();
    }

    const timestamp = parseInt(submission.timestamp);
    if (!isNaN(timestamp)) {
        const date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
        if (date.toString() !== 'Invalid Date') {
            return date;
        }
    }

    const isoDate = new Date(submission.timestamp);
    if (isoDate.toString() !== 'Invalid Date') {
        return isoDate;
    }

    logger.warn(`Invalid timestamp format: ${submission.timestamp}, using current time`);
    return new Date();
}

/**
 * Perform a daily check for a specific guild or all guilds
 */
async function performDailyCheck(client, guildId = null) {
    try {
        const { ping } = require('../services/healthcheck');
        const guildConfig = await getGuildConfig(guildId);
        if (!guildConfig || !guildConfig.channelId) {
            logger.warn(`Guild ${guildId} not configured. Skipping daily check.`);
            return 'Guild not configured.';
        }

        const targetGuild = await client.guilds.fetch(guildId).catch(() => null);
        if (!targetGuild) {
            logger.warn(`Guild ${guildId} not found. Skipping daily check.`);
            return 'Guild not found.';
        }

        const channel = await targetGuild.channels.fetch(guildConfig.channelId).catch(() => null);
        if (!channel) {
            logger.warn(`Announcement channel for guild ${guildId} not found.`);
            return 'Announcement channel not found.';
        }

        // Check permissions
        const me = await targetGuild.members.fetchMe().catch(() => null);
        const permissions = channel.permissionsFor(me);
        if (!permissions || !permissions.has(PermissionsBitField.Flags.SendMessages)) {
            const errorMsg = `Bot lacks permission to send messages in channel ${channel.name} (${channel.id}) in guild ${targetGuild.name} (${guildId})`;
            logger.error(errorMsg, 'PERMISSIONS_ERROR');

            // Try to notify owner
            try {
                const owner = await targetGuild.fetchOwner();
                if (owner) {
                    await owner.send(`⚠️ **LeetDiscord Bot Alert**\nI lack permissions to send messages in the configured announcement channel (**#${channel.name}**) in your server **${targetGuild.name}**. Please ensure I have 'View Channel' and 'Send Messages' permissions.`);
                }
            } catch (ownerErr) {
                logger.warn(`Failed to notify owner of guild ${guildId} about missing permissions.`);
            }
            return errorMsg;
        }

        const dailySlug = await getDailySlug();
        if (!dailySlug) {
            logger.error('Could not fetch daily challenge slug.');
            return 'Failed to fetch daily challenge.';
        }

        const results = [];
        const guildUsers = guildConfig.users || new Map();

        for (const [userId, leetcodeUsername] of guildUsers) {
            try {
                const submission = await getBestDailySubmission(leetcodeUsername, dailySlug);
                if (submission) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const existing = await DailySubmission.findOne({
                        guildId,
                        userId,
                        questionSlug: dailySlug,
                        date: {
                            $gte: today,
                            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                        }
                    });

                    if (!existing) {
                        const submissionTime = parseSubmissionTime(submission);
                        await DailySubmission.create({
                            guildId,
                            userId,
                            leetcodeUsername,
                            date: today,
                            questionTitle: submission.title,
                            questionSlug: dailySlug,
                            difficulty: submission.difficulty,
                            submissionTime,
                            runtime: submission.runtime,
                            memory: submission.memory
                        });

                        await updateUserStats(guildId, userId, true);
                        results.push({ userId, leetcodeUsername, submission });

                        const telegramConn = await require('../models/TelegramUser').findOne({ discordId: userId });
                        if (telegramConn && telegramConn.telegramChatId) {
                            await sendTelegramMessage(telegramConn.telegramChatId, `✅ You completed today's LeetCode challenge: *${submission.title}*!`);
                        }
                    }
                } else {
                    await updateUserStats(guildId, userId, false);
                }
            } catch (err) {
                logger.error(`Error checking user ${leetcodeUsername}:`, err);
            }
        }

        if (results.length > 0) {
            const chart = await generateSubmissionChart(results);
            const rankedFields = buildRankedFields(results);

            const embed = {
                title: '✅ Daily Challenge Completed!',
                description: `The following users have completed today's challenge: **${dailySlug}**`,
                color: 0x00ff00,
                fields: rankedFields,
                timestamp: new Date()
            };

            if (chart) {
                await channel.send({ embeds: [embed], files: [chart] });
            } else {
                await channel.send({ embeds: [embed] });
            }
        } else {
            await channel.send('😔 No one completed today\'s challenge yet.');
        }

        ping('HEALTHCHECKS_URL');

        return `Check completed. ${results.length} users found.`;
    } catch (error) {
        logger.error(`Error in performDailyCheck for guild ${guildId}:`, error);
        return `Error: ${error.message}`;
    }
}

/**
 * Periodically check for submissions without sending messages
 */
async function performSilentCheck(client, guildId) {
    try {
        const { ping } = require('../services/healthcheck');
        ping('HC_PING_SILENT_CHECK');

        const guildConfig = await getGuildConfig(guildId);
        if (!guildConfig) return;

        const dailySlug = await getDailySlug();
        if (!dailySlug) return;

        const guildUsers = guildConfig.users || new Map();

        for (const [userId, leetcodeUsername] of guildUsers) {
            try {
                const submission = await getBestDailySubmission(leetcodeUsername, dailySlug);
                if (submission) {
                    const today = new Date();
                    today.setHours(0, 0, 0, 0);

                    const existing = await DailySubmission.findOne({
                        guildId,
                        userId,
                        questionSlug: dailySlug,
                        date: {
                            $gte: today,
                            $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
                        }
                    });

                    if (!existing) {
                        const submissionTime = parseSubmissionTime(submission);
                        await DailySubmission.create({
                            guildId,
                            userId,
                            leetcodeUsername,
                            date: today,
                            questionTitle: submission.title,
                            questionSlug: dailySlug,
                            difficulty: submission.difficulty,
                            submissionTime,
                            runtime: submission.runtime,
                            memory: submission.memory
                        });

                        await updateUserStats(guildId, userId, true);
                    }
                }
            } catch (err) {
                // ignore silent check errors
            }
        }
    } catch (error) {
        logger.error(`Error in performSilentCheck for guild ${guildId}:`, error);
    }
}

/**
 * Check for upcoming contests and notify guilds
 */
async function performContestReminder(client) {
    try {
        const { ping } = require('../services/healthcheck');
        ping('HC_PING_CONTEST_REMINDER');

        const contestData = await getLeetCodeContests();
        // API returns { topTwoContests: [...] } or an array directly
        const contestList = Array.isArray(contestData)
            ? contestData
            : (contestData.topTwoContests || []);

        const upcomingContest = contestList.find(c => {
            const startTime = c.startTime * 1000;
            const now = Date.now();
            const diff = startTime - now;
            return diff > 0 && diff <= 30 * 60 * 1000; // 30 minutes before
        });

        if (!upcomingContest) return;

        const guilds = await Guild.find({ contestRemindersEnabled: true });
        const { formatLeetCodeContestEmbed } = require('../utils/embeds');
        const embed = formatLeetCodeContestEmbed(upcomingContest);

        for (const guildConfig of guilds) {
            try {
                const guild = await client.guilds.fetch(guildConfig.guildId).catch(() => null);
                if (!guild) continue;

                const channel = await guild.channels.fetch(guildConfig.channelId).catch(() => null);
                if (channel) {
                    await channel.send({ content: '🔔 **Upcoming LeetCode Contest!**', embeds: [embed] });
                }
            } catch (err) {
                logger.warn(`Failed to send contest reminder to guild ${guildConfig.guildId}:`, err.message);
            }
        }
    } catch (error) {
        logger.error('Error in performContestReminder:', error);
    }
}

/**
 * Schedule a daily check for a guild
 */
function scheduleDailyCheck(client, guildId, schedule) {
    const task = cron.schedule(schedule, () => performDailyCheck(client, guildId));
    activeTasks.push(task);
    return task;
}

/**
 * Initialize all scheduled tasks for all active guilds
 */
async function initializeScheduledTasks(client) {
    try {
        const guilds = await Guild.find({ isActive: true });
        for (const guild of guilds) {
            if (guild.cronJobs && guild.cronJobs.length > 0) {
                guild.cronJobs.forEach(job => {
                    scheduleDailyCheck(client, guild.guildId, job.schedule);
                });
            }
        }

        // Silent check every hour to keep stats updated without spamming
        const silentTask = cron.schedule('0 * * * *', async () => {
            const activeGuilds = await Guild.find({ isActive: true });
            for (const guild of activeGuilds) {
                await performSilentCheck(client, guild.guildId);
            }
        });
        activeTasks.push(silentTask);

        // Contest reminder check every 15 minutes
        const contestTask = cron.schedule('*/15 * * * *', () => performContestReminder(client));
        activeTasks.push(contestTask);

        // Stats panel update every 5 minutes
        const statsTask = cron.schedule('*/5 * * * *', () => {
            const { initializeStatsPanel } = require('../utils/statsPanel');
            initializeStatsPanel(client);
        });
        activeTasks.push(statsTask);

        // Server leaderboard update every 10 minutes
        const lbTask = cron.schedule('*/10 * * * *', () => {
            const { initializeServerLeaderboard } = require('../utils/serverLeaderboard');
            initializeServerLeaderboard(client);
        });
        activeTasks.push(lbTask);

        logger.info(`Initialized all scheduled tasks (${activeTasks.length} tasks synced).`);
    } catch (error) {
        logger.error('Error initializing scheduled tasks:', error);
    }
}

/**
 * Stop all scheduled cron jobs
 */
function stopAllCronJobs() {
    logger.info(`Stopping ${activeTasks.length} cron jobs...`);
    activeTasks.forEach(task => task.stop());
    activeTasks.length = 0;
}

/**
 * Mark guilds as inactive if the bot is no longer in them
 */
async function validateGuilds(client) {
    const guilds = await Guild.find({ isActive: true });
    for (const guild of guilds) {
        try {
            const dGuild = await client.guilds.fetch(guild.guildId).catch(() => null);
            if (!dGuild) {
                logger.info(`Bot is no longer in guild ${guild.guildId}, marking inactive.`);
                guild.isActive = false;
                await guild.save();
            }
        } catch (err) {
            logger.error(`Error validating guild ${guild.guildId}:`, err);
        }
    }
}

module.exports = {
    scheduleDailyCheck,
    performDailyCheck,
    performSilentCheck,
    performContestReminder,
    initializeScheduledTasks,
    stopAllCronJobs,
    validateGuilds
};