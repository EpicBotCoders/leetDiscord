const Guild = require('./models/Guild');
const logger = require('./logger');
require('dotenv').config();

async function loadConfig() {
    // Only token is kept in memory, everything else is in MongoDB
    return { token: process.env.DISCORD_TOKEN };
}

async function getGuildConfig(guildId) {
    return await Guild.findOne({ guildId });
}

async function initializeGuildConfig(guildId, channelId) {
    let guild = await Guild.findOne({ guildId });
    if (!guild) {
        guild = await Guild.create({
            guildId,
            channelId,
            users: {},
            cronJobs: [
                { schedule: "0 10 * * *", task: "runCheck" },
                { schedule: "0 18 * * *", task: "runCheck" }
            ]
        });
    }
    return guild;
}

async function addUser(guildId, username, discordId = null) {
    logger.debug(`[addUser] Starting to add user. Guild: ${guildId}, Username: ${username}, DiscordID: ${discordId}`);
    
    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        logger.error(`[addUser] Guild ${guildId} not found in database`);
        throw new Error('Guild not configured');
    }

    logger.debug(`[addUser] Found guild. Current users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
    
    // Check if user exists directly in the Map
    if (guild.users.has(username)) {
        logger.debug(`[addUser] User ${username} already exists in guild ${guildId}`);
        return `${username} is already being tracked in this server.`;
    }

    guild.users.set(username, discordId || 'null');
    await guild.markModified('users');
    await guild.save();
    
    logger.debug(`[addUser] Saved guild. New users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
    return `Added ${username} to tracking list for this server.`;
}

async function removeUser(guildId, username) {
    logger.debug(`[removeUser] Starting to remove user. Guild: ${guildId}, Username: ${username}`);
    
    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        logger.error(`[removeUser] Guild ${guildId} not found in database`);
        return `Guild not configured.`;
    }

    logger.debug(`[removeUser] Found guild. Current users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
    
    // Check if user exists directly in the Map
    if (!guild.users.has(username)) {
        logger.debug(`[removeUser] User ${username} not found in guild ${guildId}`);
        return `${username} is not in the tracking list for this server.`;
    }

    guild.users.delete(username);
    await guild.markModified('users');
    await guild.save();
    
    logger.debug(`[removeUser] Saved guild. Updated users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
    return `Removed ${username} from tracking list for this server.`;
}

async function getGuildUsers(guildId) {
    logger.debug(`[getGuildUsers] Getting users for guild: ${guildId}`);
    
    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        logger.debug(`[getGuildUsers] Guild ${guildId} not found in database`);
        return {};
    }
    
    const users = Object.fromEntries(guild.users);
    logger.debug(`[getGuildUsers] Raw users data: ${JSON.stringify(users)}`);
    
    const processedUsers = Object.entries(users).reduce((acc, [key, value]) => {
        acc[key] = value === 'null' ? null : value;
        return acc;
    }, {});
    
    logger.debug(`[getGuildUsers] Processed users data: ${JSON.stringify(processedUsers)}`);
    return processedUsers;
}

async function updateGuildChannel(guildId, channelId) {
    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        throw new Error('Guild not configured');
    }
    
    guild.channelId = channelId;
    await guild.save();
    return `Updated announcement channel for this server.`;
}

async function addCronJob(guildId, hours, minutes) {
    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        throw new Error('Guild not configured');
    }

    const schedule = `${minutes} ${hours} * * *`;
    const existingJob = guild.cronJobs.find(
        job => job.schedule === schedule && job.task === 'runCheck'
    );

    if (existingJob) {
        return `A check is already scheduled for ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    guild.cronJobs.push({
        schedule,
        task: 'runCheck'
    });

    await guild.save();
    return `Added new check time at ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

async function removeCronJob(guildId, hours, minutes) {
    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        throw new Error('Guild not configured');
    }

    const schedule = `${minutes} ${hours} * * *`;
    const initialLength = guild.cronJobs.length;
    
    guild.cronJobs = guild.cronJobs.filter(
        job => !(job.schedule === schedule && job.task === 'runCheck')
    );

    if (guild.cronJobs.length === initialLength) {
        return `No check scheduled for ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    await guild.save();
    return `Removed check time at ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

async function listCronJobs(guildId) {
    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        throw new Error('Guild not configured');
    }

    return guild.cronJobs
        .filter(job => job.task === 'runCheck')
        .map(job => {
            const [minutes, hours] = job.schedule.split(' ');
            return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
        })
        .sort();
}

module.exports = { 
    loadConfig,
    initializeGuildConfig,
    addUser, 
    removeUser,
    getGuildUsers,
    getGuildConfig,
    updateGuildChannel,
    addCronJob,
    removeCronJob,
    listCronJobs
};