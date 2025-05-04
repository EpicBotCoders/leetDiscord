const cron = require('node-cron');
const { getUserSubmissions, getDailySlug } = require('./apiUtils');  // Add getDailySlug import
const logger = require('./logger');
const Guild = require('./models/Guild');

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

function scheduleDailyCheck(client, guildId, channelId, schedule) {
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

            const users = Object.fromEntries(guild.users);
            if (Object.keys(users).length === 0) {
                return;
            }

            // Get today's daily challenge slug
            const dailySlug = await getDailySlug();
            if (!dailySlug) {
                logger.error('Failed to fetch daily challenge slug');
                return;
            }

            const incompleteUsers = [];

            for (const [username, discordId] of Object.entries(users)) {
                try {
                    const submissions = await getUserSubmissions(username);
                    if (submissions && submissions.length > 0) {
                        // Check if user has completed today's challenge
                        const todaysSubmission = submissions.find(sub => 
                            sub.titleSlug === dailySlug && 
                            sub.statusDisplay === 'Accepted'
                        );

                        if (!todaysSubmission) {
                            const mention = discordId ? `<@${discordId}>` : username;
                            incompleteUsers.push(mention);
                        }
                    } else {
                        // If no submissions at all, add to incomplete users
                        const mention = discordId ? `<@${discordId}>` : username;
                        incompleteUsers.push(mention);
                    }
                } catch (error) {
                    logger.error(`Error fetching submissions for ${username}:`, error);
                }
            }

            // Send a single message mentioning all users who haven't completed the challenge
            if (incompleteUsers.length > 0) {
                const message = `⚠️ ${incompleteUsers.join(', ')}\nDon't forget to complete today's LeetCode Daily Challenge!`;
                await channel.send(message);
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