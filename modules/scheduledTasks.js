const cron = require('node-cron');
const { fetchUserSubmissions } = require('./apiUtils');
const logger = require('./logger');
const Guild = require('./models/Guild');

const activeCronJobs = new Map();

async function initializeScheduledTasks(client) {
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

            for (const [username, discordId] of Object.entries(users)) {
                try {
                    const submissions = await fetchUserSubmissions(username);
                    if (submissions && submissions.length > 0) {
                        const latestSubmission = submissions[0];
                        const mention = discordId ? `<@${discordId}>` : username;
                        const message = `${mention} submitted "${latestSubmission.title}" - ${latestSubmission.difficulty}`;
                        await channel.send(message);
                    }
                } catch (error) {
                    logger.error(`Error fetching submissions for ${username}:`, error);
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
                scheduleDailyCheck(global.client, guildId, guild.channelId, job.schedule);
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