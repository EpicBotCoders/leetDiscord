const Guild = require('./models/Guild');
const logger = require('./logger');
const { getUserCalendar } = require('./apiUtils');
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

    // Fetch calendar data for the user
    try {
        const calendarData = await getUserCalendar(username);
        logger.info(`[addUser] Fetched calendar data for ${username}: streak=${calendarData.streak}, totalActiveDays=${calendarData.totalActiveDays}`);

        // Store user and their stats
        guild.users.set(username, discordId || 'null');

        // Initialize userStats Map if needed
        if (!guild.userStats) {
            guild.userStats = new Map();
        }

        guild.userStats.set(username, {
            streak: calendarData.streak || 0,
            totalActiveDays: calendarData.totalActiveDays || 0,
            activeYears: calendarData.activeYears || [],
            lastUpdated: new Date()
        });

        await guild.markModified('users');
        await guild.markModified('userStats');
        await guild.save();

        logger.debug(`[addUser] Saved guild with calendar data. New users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
        return `Added ${username} to tracking list for this server. Current streak: ${calendarData.streak || 0} days.`;
    } catch (error) {
        logger.warn(`[addUser] Could not fetch calendar data for ${username}, adding user without stats:`, error.message);

        // Add user even if calendar data fetch fails
        guild.users.set(username, discordId || 'null');
        await guild.markModified('users');
        await guild.save();

        logger.debug(`[addUser] Saved guild. New users: ${JSON.stringify(Object.fromEntries(guild.users))}`);
        return `Added ${username} to tracking list for this server. (Could not fetch calendar data)`;
    }
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

async function updateUserStats(guildId, username) {
    logger.debug(`[updateUserStats] Updating stats for user: ${username} in guild: ${guildId}`);

    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        logger.error(`[updateUserStats] Guild ${guildId} not found in database`);
        throw new Error('Guild not configured');
    }

    // Check if user exists
    if (!guild.users.has(username)) {
        logger.debug(`[updateUserStats] User ${username} not found in guild ${guildId}`);
        return false;
    }

    try {
        const calendarData = await getUserCalendar(username);
        logger.info(`[updateUserStats] Updated calendar data for ${username}: streak=${calendarData.streak}, totalActiveDays=${calendarData.totalActiveDays}`);

        // Initialize userStats Map if needed
        if (!guild.userStats) {
            guild.userStats = new Map();
        }

        guild.userStats.set(username, {
            streak: calendarData.streak || 0,
            totalActiveDays: calendarData.totalActiveDays || 0,
            activeYears: calendarData.activeYears || [],
            lastUpdated: new Date()
        });

        await guild.markModified('userStats');
        await guild.save();

        return true;
    } catch (error) {
        logger.error(`[updateUserStats] Error updating stats for ${username}:`, error.message);
        return false;
    }
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
    listCronJobs,
    updateUserStats,
    setTelegramToken,
    linkTelegramChat,
    toggleTelegramUpdates,
    getTelegramUser
};

async function setTelegramToken(guildId, discordId, token) {
    const guild = await Guild.findOne({ guildId });
    if (!guild) throw new Error('Guild not found');

    // Find user by discordId
    let targetUsername = null;
    for (const [username, id] of Object.entries(Object.fromEntries(guild.users))) {
        if (id === discordId) {
            targetUsername = username;
            break;
        }
    }

    if (!targetUsername) throw new Error('User not found or not linked to Discord');

    const expires = new Date();
    expires.setMinutes(expires.getMinutes() + 15); // Token valid for 15 minutes

    // Get existing data to preserve enabled flag
    const existingData = guild.telegramUsers?.get(targetUsername) || {};

    // Use atomic update with $set - this is the most reliable way for Maps
    const updateKey = `telegramUsers.${targetUsername}`;
    await Guild.findOneAndUpdate(
        { guildId },
        {
            $set: {
                [updateKey]: {
                    chatId: existingData.chatId || null,
                    username: targetUsername,
                    enabled: existingData.enabled !== undefined ? existingData.enabled : true,
                    tempToken: token,
                    tokenExpires: expires
                }
            }
        },
        { new: true }
    );

    logger.debug(`[setTelegramToken] Generated token for ${targetUsername} in guild ${guildId}. Token: ${token}`);
    return targetUsername;
}

async function linkTelegramChat(token, chatId) {
    // Find guild and user with this token
    // Note: This is inefficient for large scale w/o index, but fine for small bot
    const guilds = await Guild.find({});
    logger.debug(`[linkTelegramChat] Scanning ${guilds.length} guilds for token: ${token}`);

    for (const guild of guilds) {
        logger.debug(`[linkTelegramChat] Checking guild ${guild.guildId}`);

        if (!guild.telegramUsers) {
            logger.debug(`[linkTelegramChat] Guild ${guild.guildId} has no telegramUsers`);
            continue;
        }

        logger.debug(`[linkTelegramChat] Guild ${guild.guildId} telegramUsers size: ${guild.telegramUsers.size}`);
        logger.debug(`[linkTelegramChat] Guild ${guild.guildId} telegramUsers entries: ${JSON.stringify(Array.from(guild.telegramUsers.entries()))}`);

        for (const [username, userData] of guild.telegramUsers.entries()) {
            logger.debug(`[linkTelegramChat] Checking user ${username}, stored token: ${userData.tempToken}`);

            if (userData.tempToken === token) {
                logger.info(`[linkTelegramChat] Found matching token for user ${username}`);

                if (new Date() > userData.tokenExpires) {
                    logger.warn(`[linkTelegramChat] Token expired for ${username}`);
                    return { success: false, message: 'Link token has expired. Please generate a new one.' };
                }

                // Use atomic update with $set
                const updateKey = `telegramUsers.${username}`;
                await Guild.findOneAndUpdate(
                    { guildId: guild.guildId },
                    {
                        $set: {
                            [updateKey]: {
                                chatId: chatId,
                                username: username,
                                enabled: userData.enabled !== undefined ? userData.enabled : true,
                                tempToken: null,
                                tokenExpires: null
                            }
                        }
                    },
                    { new: true }
                );

                logger.info(`[linkTelegramChat] Successfully linked ${username} to ChatID ${chatId}`);

                return { success: true, message: 'Successfully connected! You will now receive LeetCode notifications here.' };
            }
        }
    }

    logger.warn(`[linkTelegramChat] No matching token found for: ${token}`);
    return { success: false, message: 'Invalid token. Please check your link.' };
}

async function toggleTelegramUpdates(guildId, discordId) {
    const guild = await Guild.findOne({ guildId });
    if (!guild) throw new Error('Guild not found');

    let targetUsername = null;
    for (const [username, id] of Object.entries(Object.fromEntries(guild.users))) {
        if (id === discordId) {
            targetUsername = username;
            break;
        }
    }

    if (!targetUsername) return { success: false, message: 'You are not registered in this server.' };

    if (!guild.telegramUsers || !guild.telegramUsers.has(targetUsername)) {
        return { success: false, message: 'You have not connected a Telegram account yet.' };
    }

    const userData = guild.telegramUsers.get(targetUsername);
    const newEnabledState = !userData.enabled;

    // Use atomic update with $set
    const updateKey = `telegramUsers.${targetUsername}`;
    await Guild.findOneAndUpdate(
        { guildId },
        {
            $set: {
                [updateKey]: {
                    ...userData,
                    enabled: newEnabledState
                }
            }
        },
        { new: true }
    );

    return {
        success: true,
        message: `Telegram updates have been ${newEnabledState ? 'enabled' : 'disabled'}.`
    };
}

async function getTelegramUser(guildId, username) {
    const guild = await Guild.findOne({ guildId });
    if (!guild || !guild.telegramUsers) return null;
    return guild.telegramUsers.get(username);
}

async function getConnectionByChatId(chatId) {
    const guilds = await Guild.find({});
    for (const guild of guilds) {
        if (!guild.telegramUsers) continue;
        for (const [username, userData] of guild.telegramUsers.entries()) {
            if (userData.chatId === chatId.toString()) {
                const userStats = guild.userStats ? guild.userStats.get(username) : null;
                return {
                    guildId: guild.guildId,
                    channelId: guild.channelId,
                    totalUsers: guild.users ? guild.users.size : 0,
                    username,
                    userStats,
                    userData
                };
            }
        }
    }
    return null;
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
    listCronJobs,
    updateUserStats,
    setTelegramToken,
    linkTelegramChat,
    toggleTelegramUpdates,
    getTelegramUser,
    getConnectionByChatId
};