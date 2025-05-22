const cron = require('node-cron');
const { getUserSubmissions, getDailySlug, getProblemDetails, parseSubmissionTime } = require('./apiUtils');
const { PermissionsBitField } = require('discord.js');
const logger = require('./logger');
const Guild = require('./models/Guild');
const DailySubmission = require('./models/DailySubmission');

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
            const problem = await getProblemDetails(dailySlug);
            if (!problem || !problem.title || !problem.difficulty) { // Ensure problem.title is also checked as it's used later
                logger.error(`Failed to fetch problem details, or problem details are incomplete for slug: ${dailySlug}`);
                return;
            }

            const incompleteUsers = [];
            const today = new Date();
            today.setUTCHours(0, 0, 0, 0); // Use UTC for consistency
            const tomorrow = new Date(today);
            tomorrow.setUTCDate(today.getUTCDate() + 1);

            // Batch fetch existing submissions
            const leetcodeUsernames = Object.keys(users);
            let submissionsMap = new Map();
            if (leetcodeUsernames.length > 0) {
                try {
                    const existingSubmissions = await DailySubmission.find({
                        guildId: guildId,
                        leetcodeUsername: { $in: leetcodeUsernames },
                        questionSlug: dailySlug,
                        date: { $gte: today, $lt: tomorrow }
                    });
                    existingSubmissions.forEach(sub => submissionsMap.set(sub.leetcodeUsername, sub));
                    logger.info(`Fetched ${submissionsMap.size} existing submissions for guild ${guildId} for slug ${dailySlug}.`);
                } catch (dbError) {
                    logger.error(`Error batch fetching submissions for guild ${guildId}:`, dbError);
                    // Continue, but submissions might be re-recorded or checks might be less efficient
                }
            }

            for (const [username, discordId] of Object.entries(users)) {
                try {
                    // Check if already recorded in DB from pre-fetched map
                    const existingSubmission = submissionsMap.get(username);
                    if (existingSubmission) {
                        logger.info(`User ${username} (guild ${guildId}) already has a recorded submission for ${dailySlug}. Skipping.`);
                        continue; // Already recorded, skip to next user
                    }

                    // Fetch user's submissions from LeetCode API
                    const userApiSubmissions = await getUserSubmissions(username);
                    const todaysLeetCodeSubmission = userApiSubmissions.find(sub =>
                        sub.titleSlug === dailySlug &&
                        sub.statusDisplay === 'Accepted'
                    );

                    if (todaysLeetCodeSubmission) {
                        // If completed on LeetCode and not in our DB for today, record it
                        const submissionTime = parseSubmissionTime(todaysLeetCodeSubmission); // Use imported function
                        await DailySubmission.create({
                            guildId,
                            userId: discordId || username, // Use Discord ID if available
                            leetcodeUsername: username,
                            date: today, // Use UTC date
                            questionTitle: problem.title,
                            questionSlug: dailySlug,
                            difficulty: problem.difficulty,
                            submissionTime
                        });
                        logger.info(`Recorded new submission for ${username} (guild ${guildId}) for ${dailySlug}.`);
                    } else {
                        // Not completed on LeetCode
                        const mention = discordId ? `<@${discordId}>` : username;
                        incompleteUsers.push(mention);
                    }
                } catch (error) {
                    logger.error(`Error processing user ${username} (guild ${guildId}) for slug ${dailySlug}:`, error);
                }
            }

            // Send a single message mentioning all users who haven't completed the challenge
            if (incompleteUsers.length > 0) {
                try {
                    const message = `⚠️ ${incompleteUsers.join(', ')}\nDon't forget to complete today's LeetCode Daily Challenge!`;
                    await channel.send(message);
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
                    } else {
                        logger.error(`Error sending message in channel ${channel.name} (${channel.id}):`, sendError);
                    }
                }
            }
        } catch (error) {
            logger.error('Error in scheduled task:', error);
        }
    });

    activeCronJobs.set(jobKey, job);
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

module.exports = {
    initializeScheduledTasks,
    scheduleDailyCheck,
    updateGuildCronJobs
};