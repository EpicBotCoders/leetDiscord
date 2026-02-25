const { getLeetCodeContests } = require('./apiUtils');
const { formatLeetCodeContestEmbed } = require('./interactionHandler');
// Schedule contest reminder for all opted-in guilds (every Friday 16:00 UTC)
function scheduleContestReminderJob(client) {
    const schedule = '0 16 * * 5'; // Friday 16:00 UTC
    const jobKey = 'contest-reminder';
    if (activeCronJobs.has(jobKey)) {
        activeCronJobs.get(jobKey).stop();
        activeCronJobs.delete(jobKey);
    }
    logger.info('Scheduling LeetCode contest reminder job for Fridays at 16:00 UTC');
    const job = cron.schedule(schedule, async () => {
        logger.info('Running LeetCode contest reminder broadcast');
        try {
            const data = await getLeetCodeContests();
            if (!data || !data.topTwoContests || data.topTwoContests.length === 0) {
                logger.warn('No upcoming LeetCode contests found for reminder broadcast.');
                return;
            }
            // Collect all upcoming contests, sorted by start time
            const now = Math.floor(Date.now() / 1000);
            const upcomingContests = data.topTwoContests
                .filter(c => c.startTime > now)
                .sort((a, b) => a.startTime - b.startTime);
            if (upcomingContests.length === 0) {
                logger.warn('No upcoming LeetCode contests found for reminder broadcast.');
                return;
            }
            const embeds = upcomingContests.map((contest, i) =>
                formatLeetCodeContestEmbed(contest, i, upcomingContests.length)
            );
            const guilds = await Guild.find({ contestReminderEnabled: true });
            for (const guild of guilds) {
                try {
                    const channel = await client.channels.fetch(guild.channelId).catch(() => null);
                    if (!channel) {
                        logger.warn(`Contest reminder: Channel ${guild.channelId} not found for guild ${guild.guildId}`);
                        continue;
                    }
                    const botMember = await channel.guild.members.fetchMe();
                    const permissions = channel.permissionsFor(botMember);
                    if (!permissions?.has(PermissionsBitField.Flags.SendMessages)) {
                        logger.warn(`Contest reminder: No permission to send messages in channel ${channel.id} for guild ${guild.guildId}`);
                        continue;
                    }
                    await channel.send({ embeds });
                    logger.info(`Sent contest reminder (${upcomingContests.length} contest(s)) to guild ${guild.guildId}`);
                } catch (err) {
                    logger.error(`Error sending contest reminder to guild ${guild.guildId}:`, err);
                }
            }
        } catch (error) {
            logger.error('Error in contest reminder broadcast:', error);
        }
    }, { timezone: 'UTC' });
    activeCronJobs.set(jobKey, job);
}
const cron = require('node-cron');
const { getUserSubmissions, getDailySlug, getBestDailySubmission } = require('./apiUtils');
const { updateUserStats, getGuildConfig } = require('./configManager');
const { sendTelegramMessage } = require('./telegramBot');
const { generateSubmissionChart } = require('./chartGenerator');
const { initializeStatsPanel } = require('./statsPanel');
const { initializeServerLeaderboard } = require('./serverLeaderboard');
const { PermissionsBitField } = require('discord.js');
const axios = require('axios');
const logger = require('./logger');
const Guild = require('./models/Guild');
const DailySubmission = require('./models/DailySubmission');
const { sortSubmissionsByPerformance, buildRankedFields } = require('./leaderboardUtils');

// Helper function to safely parse submission timestamp
function parseSubmissionTime(submission) {
    if (!submission.timestamp) {
        logger.warn('No timestamp in submission:', submission);
        return new Date(); // Fallback to current time if no timestamp
    }

    // Try parsing as unix timestamp (seconds or milliseconds)
    const timestamp = parseInt(submission.timestamp);
    if (!isNaN(timestamp)) {
        // Check if it's in seconds (Unix timestamp) or milliseconds
        const date = timestamp > 9999999999 ? new Date(timestamp) : new Date(timestamp * 1000);
        if (date.toString() !== 'Invalid Date') {
            return date;
        }
    }

    // Try parsing as ISO string
    const isoDate = new Date(submission.timestamp);
    if (isoDate.toString() !== 'Invalid Date') {
        return isoDate;
    }

    logger.warn(`Invalid timestamp format: ${submission.timestamp}, using current time`);
    return new Date(); // Fallback to current time if parsing fails
}

const activeCronJobs = new Map();
let discordClient = null;

async function initializeScheduledTasks(client) {
    discordClient = client;  // Store the client instance
    try {
        // Get all guilds from MongoDB
        const guilds = await Guild.find({});

        for (const guild of guilds) {
            // Initialize cron jobs for each guild
            guild.cronJobs.forEach(job => {
                if (job.task === 'runCheck') {
                    scheduleDailyCheck(client, guild.guildId, guild.channelId, job.schedule);
                }
            });
        }
        logger.info('Scheduled tasks initialized successfully');

        // Schedule contest reminder job
        scheduleContestReminderJob(client);

        // Initialize silent daily check
        await scheduleSilentDailyCheck(client);

        // Initialize stats panel
        await initializeStatsPanel(client);

        // Initialize server leaderboard
        await initializeServerLeaderboard(client);
    } catch (error) {
        logger.error('Error initializing scheduled tasks:', error);
    }
}

async function scheduleDailyCheck(client, guildId, channelId, schedule) {
    const jobKey = `${guildId}-${schedule}`;

    // Clear existing job if it exists
    if (activeCronJobs.has(jobKey)) {
        activeCronJobs.get(jobKey).stop();
        activeCronJobs.delete(jobKey);
    }

    const job = cron.schedule(schedule, async () => {
        await performDailyCheck(client, guildId, channelId);
    }, {
        timezone: 'Asia/Kolkata'
    });

    activeCronJobs.set(jobKey, job);
}

async function performDailyCheck(client, guildId, channelId) {
    try {
        const guild = await Guild.findOne({ guildId });
        if (!guild) {
            logger.error(`Guild ${guildId} not found in database`);
            return;
        }

        const channel = await client.channels.fetch(guild.channelId);
        if (!channel) {
            logger.error(`Channel ${guild.channelId} not found for guild ${guildId}`);
            return;
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
            return;
        }

        const users = Object.fromEntries(guild.users);
        if (Object.keys(users).length === 0) {
            return;
        }

        // Get today's daily challenge slug and problem details
        const dailySlug = await getDailySlug();
        if (!dailySlug) {
            logger.error('Failed to fetch daily challenge slug');
            return;
        }

        // Fetch problem details to get difficulty
        const problemDetails = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${dailySlug}`);
        const problem = problemDetails.data;
        if (!problem || !problem.difficulty) {
            logger.error('Failed to fetch problem details or missing difficulty');
            return;
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

                    const TelegramUser = require('./models/TelegramUser');

                    // ... imports

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

async function updateGuildCronJobs(guildId) {
    try {
        const guild = await Guild.findOne({ guildId });
        if (!guild) {
            logger.error(`Guild ${guildId} not found when updating cron jobs`);
            return;
        }

        // Clear all existing jobs for this guild
        const guildJobKeys = Array.from(activeCronJobs.keys())
            .filter(key => key.startsWith(guildId));

        guildJobKeys.forEach(key => {
            activeCronJobs.get(key).stop();
            activeCronJobs.delete(key);
        });

        // Set up new jobs based on current configuration
        guild.cronJobs.forEach(job => {
            if (job.task === 'runCheck') {
                scheduleDailyCheck(discordClient, guildId, guild.channelId, job.schedule);  // Use stored client instance
            }
        });
    } catch (error) {
        logger.error('Error updating guild cron jobs:', error);
    }
}

function stopAllCronJobs() {
    logger.info('Stopping all cron jobs...');
    let stoppedCount = 0;

    activeCronJobs.forEach((job, key) => {
        try {
            job.stop();
            stoppedCount++;
        } catch (error) {
            logger.error(`Error stopping cron job ${key}:`, error);
        }
    });

    activeCronJobs.clear();
    logger.info(`Stopped ${stoppedCount} cron job(s)`);
}


async function scheduleSilentDailyCheck(client) {
    const schedule = process.env.SILENT_CHECK_SCHEDULE || '55 23 * * *';
    const jobKey = 'silent-daily-check';

    // Clear existing job if it exists
    if (activeCronJobs.has(jobKey)) {
        activeCronJobs.get(jobKey).stop();
        activeCronJobs.delete(jobKey);
    }

    logger.info(`Scheduling silent daily check with schedule: ${schedule} (UTC)`);

    const job = cron.schedule(schedule, async () => {
        logger.info('Starting silent daily check...');
        await performSilentCheck(client);
        logger.info('Silent daily check completed.');
    }, {
        timezone: 'UTC'
    });

    activeCronJobs.set(jobKey, job);
}

async function performSilentCheck(client) {
    try {
        // Get today's daily challenge slug
        const dailySlug = await getDailySlug();
        if (!dailySlug) {
            logger.error('Failed to fetch daily challenge slug for silent check');
            return;
        }

        // Fetch problem details to get difficulty
        const problemDetails = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${dailySlug}`);
        const problem = problemDetails.data;
        if (!problem || !problem.difficulty) {
            logger.error('Failed to fetch problem details or missing difficulty for silent check');
            return;
        }

        const today = new Date();
        today.setUTCHours(0, 0, 0, 0);

        // Get all guilds from MongoDB
        const guilds = await Guild.find({});

        for (const guild of guilds) {
            const users = Object.fromEntries(guild.users);
            if (Object.keys(users).length === 0) continue;

            // Collect submissions for this guild
            const submissionsData = [];

            for (const [username, discordId] of Object.entries(users)) {
                try {
                    // Update calendar stats for this user
                    try {
                        await updateUserStats(guild.guildId, username);
                        logger.debug(`Silent check: Updated calendar stats for ${username} in guild ${guild.guildId}`);
                    } catch (statsError) {
                        logger.warn(`Could not update calendar stats for ${username} during silent check:`, statsError.message);
                    }

                    const submissions = await getUserSubmissions(username);

                    if (submissions && submissions.length > 0) {
                        // Check if user has completed today's challenge
                        const todaysSubmission = submissions.find(sub =>
                            sub.titleSlug === dailySlug &&
                            sub.statusDisplay === 'Accepted'
                        );

                        if (todaysSubmission) {
                            // Atomic upsert — safe against concurrent writes from other code paths
                            const submissionTime = parseSubmissionTime(todaysSubmission);
                            const result = await DailySubmission.findOneAndUpdate(
                                {
                                    guildId: guild.guildId,
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
                                { upsert: true, new: true, rawResult: true }
                            );
                            if (result.lastErrorObject?.upserted) {
                                logger.info(`Silent check: Recorded submission for ${username} in guild ${guild.guildId}`);
                            }

                            // Fetch best submission for report
                            const bestSubmission = await getBestDailySubmission(username, dailySlug);
                            if (bestSubmission) {
                                submissionsData.push({
                                    username,
                                    discordId,
                                    submission: bestSubmission
                                });
                            }
                        }
                    }
                } catch (userError) {
                    logger.error(`Error processing user ${username} during silent check:`, userError);
                }
            }

            // Post submission report if there are any submissions
            if (submissionsData.length > 0) {
                try {
                    await postSubmissionReport(client, guild, problem, submissionsData);
                } catch (reportError) {
                    logger.error(`Error posting submission report for guild ${guild.guildId}:`, reportError);
                }
            }
        }
    } catch (error) {
        logger.error('Error in silent daily check:', error);
    }
}

// Helper function to format and post submission report
async function postSubmissionReport(client, guild, problem, submissionsData) {
    try {
        const channel = await client.channels.fetch(guild.channelId);
        if (!channel) {
            logger.warn(`Channel ${guild.channelId} not found for guild ${guild.guildId}`);
            return;
        }

        // Check permissions
        const botMember = await channel.guild.members.fetchMe();
        const permissions = channel.permissionsFor(botMember);
        if (!permissions?.has(PermissionsBitField.Flags.SendMessages)) {
            logger.warn(`No permission to send messages in channel ${channel.id} for guild ${guild.guildId}`);
            return;
        }

        // Sort submissions by runtime, then memory and build embed fields with medals
        const sortedSubmissions = sortSubmissionsByPerformance(submissionsData);
        const fields = buildRankedFields(sortedSubmissions);

        const embed = {
            color: 0x00d9ff,
            title: `🏆 Daily Challenge Submissions`,
            description: `**${problem.title}**\n\n**Ranked by Runtime**`,
            fields: fields,
            image: {
                url: 'attachment://submission-chart.png'
            },
            footer: {
                text: `${submissionsData.length} user${submissionsData.length > 1 ? 's' : ''} completed today's challenge`
            },
            timestamp: new Date()
        };

        // Generate chart
        const chartAttachment = await generateSubmissionChart(sortedSubmissions);

        // Send message with embed and chart
        const messageOptions = { embeds: [embed] };
        if (chartAttachment) {
            messageOptions.files = [chartAttachment];
        }

        await channel.send(messageOptions);
        logger.info(`Posted submission report for guild ${guild.guildId} with ${submissionsData.length} submissions`);
    } catch (error) {
        logger.error('Error in postSubmissionReport:', error);
        throw error;
    }
}

module.exports = {
    initializeScheduledTasks,
    scheduleDailyCheck,
    updateGuildCronJobs,
    stopAllCronJobs,
    performDailyCheck,
    scheduleSilentDailyCheck,
    performSilentCheck
};