const Guild = require('./models/Guild');
const logger = require('./logger');
require('dotenv').config();

const guildCache = new Map();
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

async function loadConfig() {
    // Only token is kept in memory, everything else is in MongoDB
    return { token: process.env.DISCORD_TOKEN };
}

async function getGuildConfig(guildId) {
    if (guildCache.has(guildId)) {
        const cachedEntry = guildCache.get(guildId);
        if (Date.now() - cachedEntry.timestamp < CACHE_TTL_MS) {
            logger.debug(`[Cache HIT] Guild: ${guildId}`); // Requirement 1
            return cachedEntry.data;
        } else {
            logger.debug(`[getGuildConfig] Cache expired for guild: ${guildId}`);
            guildCache.delete(guildId); // Expired
            logger.debug(`[Cache DEL] Guild: ${guildId} (due to expiration)`); // Requirement 1 (variant)
        }
    }

    logger.debug(`[Cache MISS] Guild: ${guildId}`); // Requirement 1
    const guildFromDB = await Guild.findOne({ guildId });
    if (guildFromDB) {
        guildCache.set(guildId, { data: guildFromDB, timestamp: Date.now() });
        logger.debug(`[Cache SET] Guild: ${guildId}`); // Requirement 1
    }
    return guildFromDB;
}

async function initializeGuildConfig(guildId, channelId) {
    let guild = await getGuildConfig(guildId); // Use cached getter
    if (!guild) {
        guild = await Guild.create({
            guildId,
            channelId,
            users: {}, // Ensure users is initialized as a Map or an object that can be converted to a Map
            cronJobs: [
                { schedule: "0 10 * * *", task: "runCheck" },
                { schedule: "0 18 * * *", task: "runCheck" }
            ]
        });
        // Cache the newly created guild
        guildCache.set(guildId, { data: guild, timestamp: Date.now() });
    } else {
        // If found, and if channelId is different, update it.
        // This part is tricky: initializeGuildConfig might imply update.
        // For now, assume if it exists, it's "initialized".
        // If an update is implied, then cache invalidation is needed.
        // Based on current usage, it's more of a getOrCreate.
        // Let's ensure it's in cache if found.
        if (!guildCache.has(guildId)) {
            guildCache.set(guildId, { data: guild, timestamp: Date.now() });
        }
    }
    return guild;
}

async function addUser(guildId, username, discordId = null) {
    logger.debug(`[addUser] Starting to add user. Guild: ${guildId}, Username: ${username}, DiscordID: ${discordId}`);
    
    let guild = await getGuildConfig(guildId); // Use cached getter
    if (!guild) {
        logger.error(`[addUser] Guild ${guildId} not found. It might not be initialized.`);
        // Attempt to initialize it, or throw error. For now, let's throw.
        throw new Error(`Guild ${guildId} not configured. Please run /setchannel first.`);
    }

    logger.debug(`[addUser] Found guild. Current users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
    
    if (guild.users.has(username)) {
        logger.debug(`[addUser] User ${username} already exists in guild ${guildId}`);
        return `${username} is already being tracked in this server.`;
    }

    guild.users.set(username, discordId || 'null');
    await guild.markModified('users'); 
    await guild.save();
    guildCache.delete(guildId); // Invalidate cache
    logger.debug(`[Cache DEL] Guild: ${guildId} (after addUser)`); // Requirement 1
    
    logger.debug(`[addUser] Saved guild. New users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
    return `Added ${username} to tracking list for this server.`;
}

async function removeUser(guildId, username) {
    logger.debug(`[removeUser] Starting to remove user. Guild: ${guildId}, Username: ${username}`);
    
    let guild = await getGuildConfig(guildId); // Use cached getter
    if (!guild) {
        logger.error(`[removeUser] Guild ${guildId} not found.`);
        return `Guild not configured. Please run /setchannel first.`;
    }

    logger.debug(`[removeUser] Found guild. Current users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
    
    if (!guild.users.has(username)) {
        logger.debug(`[removeUser] User ${username} not found in guild ${guildId}`);
        return `${username} is not in the tracking list for this server.`;
    }

    guild.users.delete(username);
    await guild.markModified('users');
    await guild.save();
    guildCache.delete(guildId); // Invalidate cache
    logger.debug(`[Cache DEL] Guild: ${guildId} (after removeUser)`); // Requirement 1
    
    logger.debug(`[removeUser] Saved guild. Updated users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
    return `Removed ${username} from tracking list for this server.`;
}

async function getGuildUsers(guildId) {
    logger.debug(`[getGuildUsers] Getting users for guild: ${guildId}`);
    
    const guild = await getGuildConfig(guildId); // Use cached getter
    if (!guild || !guild.users) { // Check guild.users existence
        logger.debug(`[getGuildUsers] Guild ${guildId} not found or has no users map.`);
        return {};
    }
    
    // Ensure guild.users is treated as a Map if it's not already
    const usersMap = guild.users instanceof Map ? guild.users : new Map(Object.entries(guild.users || {}));
    const users = Object.fromEntries(usersMap);

    logger.debug(`[getGuildUsers] Raw users data from (potentially cached) guild: ${JSON.stringify(users)}`);
    
    const processedUsers = Object.entries(users).reduce((acc, [key, value]) => {
        acc[key] = value === 'null' ? null : value;
        return acc;
    }, {});
    
    logger.debug(`[getGuildUsers] Processed users data: ${JSON.stringify(processedUsers)}`);
    return processedUsers;
}

async function updateGuildChannel(guildId, channelId) {
    let guild = await getGuildConfig(guildId); // Use cached getter
    if (!guild) {
        // This case should ideally be handled by an initialization step first
        // For robustness, one might choose to create it here, or throw.
        // Based on current command structure, /setchannel calls initializeGuildConfig first
        // which handles creation. If it's still not found, something is wrong.
        logger.error(`[updateGuildChannel] Guild ${guildId} not found. Cannot update channel.`);
        throw new Error('Guild not configured. Please run /setchannel to initialize.');
    }
    
    guild.channelId = channelId;
    await guild.save();
    guildCache.delete(guildId); // Invalidate cache
    logger.debug(`[Cache DEL] Guild: ${guildId} (after updateGuildChannel)`); // Requirement 1
    return `Updated announcement channel for this server.`;
}

async function addCronJob(guildId, hours, minutes) {
    let guild = await getGuildConfig(guildId); // Use cached getter
    if (!guild) {
        logger.error(`[addCronJob] Guild ${guildId} not found.`);
        throw new Error('Guild not configured. Please run /setchannel first.');
    }

    const schedule = `${minutes} ${hours} * * *`;
    // Ensure guild.cronJobs is an array
    guild.cronJobs = Array.isArray(guild.cronJobs) ? guild.cronJobs : [];
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
    guildCache.delete(guildId); // Invalidate cache
    logger.debug(`[Cache DEL] Guild: ${guildId} (after addCronJob)`); // Requirement 1
    return `Added new check time at ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

async function removeCronJob(guildId, hours, minutes) {
    let guild = await getGuildConfig(guildId); // Use cached getter
    if (!guild) {
        logger.error(`[removeCronJob] Guild ${guildId} not found.`);
        throw new Error('Guild not configured. Please run /setchannel first.');
    }

    const schedule = `${minutes} ${hours} * * *`;
    // Ensure guild.cronJobs is an array
    guild.cronJobs = Array.isArray(guild.cronJobs) ? guild.cronJobs : [];
    const initialLength = guild.cronJobs.length;
    
    guild.cronJobs = guild.cronJobs.filter(
        job => !(job.schedule === schedule && job.task === 'runCheck')
    );

    if (guild.cronJobs.length === initialLength) {
        return `No check scheduled for ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    await guild.save();
    guildCache.delete(guildId); // Invalidate cache
    logger.debug(`[Cache DEL] Guild: ${guildId} (after removeCronJob)`); // Requirement 1
    return `Removed check time at ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

async function listCronJobs(guildId) {
    const guild = await getGuildConfig(guildId); // Use cached getter
    if (!guild || !Array.isArray(guild.cronJobs)) { // Check guild.cronJobs existence and type
        logger.debug(`[listCronJobs] Guild ${guildId} not found or cronJobs is not an array.`);
        // Depending on strictness, either throw error or return empty list
        return []; // Return empty list if no config or no jobs
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