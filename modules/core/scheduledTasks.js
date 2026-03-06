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
async function performDailyCheck(client, guildId, channelId) {
    try {
        const guild = await Guild.findOne({ guildId });
        if (!guild) {
            logger.error(`Guild ${guildId} not found in database`);
            return 'Guild not found in database.';
        }

        const channel = await client.channels.fetch(guild.channelId).catch(() => null);
        if (!channel) {
            logger.error(`Channel ${guild.channelId} not found or inaccessible for guild ${guildId} — marking channelValid=false`);
            try {
                await Guild.findOneAndUpdate({ guildId }, { $set: { channelValid: false } });
            } catch (updateErr) {
                logger.error(`Failed to mark channelValid=false for guild ${guildId}:`, updateErr);
            }
            // Attempt to DM guild owner
            try {
                const discordGuild = client.guilds.cache.get(guildId);
                if (discordGuild) {
                    const owner = await discordGuild.fetchOwner().catch(() => null);
                    if (owner) {
                        await owner.send(
                            `⚠️ The announcement channel configured for your server **${discordGuild.name}** no longer exists or is inaccessible.\n` +
                            `Please use \`/setchannel\` to set a new channel so I can resume posting updates!`
                        ).catch(() => { });
                    }
                }
            } catch (dmErr) {
                logger.error(`Failed to DM owner about missing channel for guild ${guildId}:`, dmErr);
            }
            return 'Configured announcement channel is inaccessible. Please use `/setchannel`.';
        }

        // Check if bot has permission to send messages in this channel
        const botMember = await channel.guild.members.fetchMe();
        const permissions = channel.permissionsFor(botMember);

        if (!permissions?.has(PermissionsBitField.Flags.SendMessages)) {
            logger.error(`Bot lacks permission to send messages in channel ${channel.name} (${channel.id}) in guild ${guild.name} (${guildId})`);
            // Try to notify guild owner about permission issue
            try {
                const guildOwner = await channel.guild.fetchOwner();
                await guildOwner.send(
                    'I don\'t have permission to send messages in #' + channel.name + ' in ' + guild.name + '. ' +
                    'Please grant me the \'Send Messages\' permission in that channel or set a different channel using /setchannel.'
                );
            } catch (dmError) {
                logger.error('Failed to notify guild owner about permissions:', dmError);
            }
            return 'Bot lacks `Send Messages` permission in the configured channel.';
        }

        const users = Object.fromEntries(guild.users);
        if (Object.keys(users).length === 0) {
            return 'No users are currently being tracked in this server.';
        }

        // Get today's daily challenge slug and problem details
        const dailySlug = await getDailySlug();
        if (!dailySlug) {
            logger.error('Failed to fetch daily challenge slug');
            return 'Failed to fetch the daily challenge from LeetCode API.';
        }

        // Fetch problem details to get difficulty
        const problemDetails = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${dailySlug}`);
        const problem = problemDetails.data;
        if (!problem || !problem.difficulty) {
            logger.error('Failed to fetch problem details or missing difficulty');
            return 'Failed to fetch problem details from API.';
        }

        const incompleteUsers = [];
        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        for (const [username, discordId] of Object.entries(users)) {
            try {
                // Update calendar stats for this user
                try {
                    await updateUserStats(guildId, username);
                    logger.debug(`Updated calendar stats for ${username} in guild ${guildId}`);
                } catch (statsError) {
                    logger.warn(`Could not update calendar stats for ${username}:`, statsError.message);
                }

                const submissions = await getUserSubmissions(username);
                let hasCompleted = false;

                if (submissions && submissions.length > 0) {
                    // Check if user has completed today's challenge
                    const todaysSubmission = submissions.find(sub =>
                        sub.titleSlug === dailySlug &&
                        sub.statusDisplay === 'Accepted'
                    );

                    if (todaysSubmission) {
                        hasCompleted = true;
                        // Atomic upsert — safe against concurrent writes from other code paths
                        const submissionTime = parseSubmissionTime(todaysSubmission);
                        await DailySubmission.findOneAndUpdate(
                            {
                                guildId,
                                leetcodeUsername: username,
                                questionSlug: dailySlug,
                                date: today
                            },
                            {
                                $setOnInsert: {
                                    userId: discordId || username,
                                    questionTitle: problem.title,
                                    difficulty: problem.difficulty,
                                    submissionTime
                                }
                            },
                            { upsert: true, new: true }
                        );
                    }
                }

                if (!hasCompleted) {
                    // Mention user in Discord
                    const mention = discordId ? `<@${discordId}>` : username;
                    incompleteUsers.push(mention);

                    const TelegramUser = require('../models/TelegramUser');

                    // Send Telegram Notification
                    try {
                        // Look up global TelegramUser
                        const telegramUser = await TelegramUser.findOne({ leetcodeUsername: username });

                        if (telegramUser && telegramUser.telegramChatId && telegramUser.isEnabled) {
                            const guildName = channel.guild ? channel.guild.name : 'LeetCode Bot';
                            const message = `⚠️ Reminder from **${guildName}**:\n\nYou haven't completed today's LeetCode Daily Challenge yet!\n\nProblem: ${problem.title}\nDifficulty: ${problem.difficulty}\nLink: https://leetcode.com/problems/${dailySlug}/`;
                            await sendTelegramMessage(telegramUser.telegramChatId, message);
                            logger.info(`Sent Telegram reminder to ${username} (ChatID: ${telegramUser.telegramChatId})`);
                        } else {
                            logger.debug(`[TelegramDebug] No enabled Telegram user found for ${username}`);
                        }
                    } catch (tgError) {
                        logger.error(`Error sending Telegram reminder to ${username}:`, tgError);
                    }
                }
            } catch (error) {
                logger.error(`Error fetching submissions for ${username}:`, error);
            }
        }

        // Send a single message mentioning all users who haven't completed the challenge
        if (incompleteUsers.length > 0) {
            try {
                const message = `⚠️ ${incompleteUsers.join(', ')}\nDon't forget to complete today's LeetCode Daily Challenge!`;
                await channel.send(message);
                return `Check complete. Notification sent to ${incompleteUsers.length} user(s).`;
            } catch (sendError) {
                if (sendError.code === 50001 || sendError.code === 50013) { // Missing Access or Missing Permissions
                    logger.error(`Permission error when sending message in channel ${channel.name} (${channel.id}):`, sendError);
                    // Try to notify guild owner
                    try {
                        const guildOwner = await channel.guild.fetchOwner();
                        await guildOwner.send(
                            'I encountered a permission error when trying to send messages in #' + channel.name + ' in ' + guild.name + '. ' +
                            'Please check my permissions and make sure I can:\n' +
                            '- View the channel\n' +
                            '- Send messages\n' +
                            '- Mention users (if you want me to ping people)'
                        );
                    } catch (dmError) {
                        logger.error('Failed to notify guild owner about permissions:', dmError);
                    }
                    return 'Check failed: Permission error sending message.';
                } else {
                    logger.error(`Error sending message in channel ${channel.name} (${channel.id}):`, sendError);
                    return 'Check failed: Error sending message.';
                }
            }
        } else {
            return 'Check complete. All tracked users have completed the daily challenge!';
        }
    } catch (error) {
        logger.error('Error in scheduled task:', error);
        return 'Check failed: Internal error.';
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