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

async function getAllGuildConfigs() {
    return await Guild.find({});
}

async function setAdminRole(guildId, roleId) {
    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        throw new Error('Guild not configured');
    }

    guild.adminRoleId = roleId;
    await guild.save();
    return guild.adminRoleId;
}

async function getAdminRole(guildId) {
    const guild = await Guild.findOne({ guildId });
    if (!guild) {
        return null;
    }
    return guild.adminRoleId || null;
}

async function initializeGuildConfig(guildId, channelId) {
    let guild = await Guild.findOne({ guildId });
    if (!guild) {
        guild = await Guild.create({
            guildId,
            channelId,
            users: {},
            cronJobs: [
                { schedule: '0 10 * * *', task: 'runCheck' },
                { schedule: '0 18 * * *', task: 'runCheck' }
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
        return 'Guild not configured.';
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
    return 'Updated announcement channel for this server.';
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
        .map(job => job.schedule)
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

const TelegramUser = require('./models/TelegramUser');

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

    // Upsert TelegramUser
    await TelegramUser.findOneAndUpdate(
        { leetcodeUsername: targetUsername },
        {
            $set: {
                leetcodeUsername: targetUsername,
                userId: discordId,
                tempToken: token,
                tokenExpires: expires
            },
            $setOnInsert: {
                isEnabled: true
            }
        },
        { upsert: true, new: true }
    );

    logger.debug(`[setTelegramToken] Generated token for ${targetUsername}. Token: ${token}`);
    return targetUsername;
}

async function linkTelegramChat(token, chatId) {
    // Find user with this token
    const user = await TelegramUser.findOne({ tempToken: token });

    if (!user) {
        logger.warn(`[linkTelegramChat] No matching token found for: ${token}`);
        return { success: false, message: 'Invalid token. Please check your link.' };
    }

    if (new Date() > user.tokenExpires) {
        logger.warn(`[linkTelegramChat] Token expired for ${user.leetcodeUsername}`);
        return { success: false, message: 'Link token has expired. Please generate a new one.' };
    }

    // Check if already connected
    if (user.telegramChatId) {
        if (user.telegramChatId === chatId.toString()) {
            return { success: true, message: '✅ You are already connected!' };
        } else {
            return {
                success: false,
                message: '⚠️ This account is already linked to another Telegram chat. Please unlink it first or contact support.'
            };
        }
    }

    user.telegramChatId = chatId;
    user.tempToken = null;
    user.tokenExpires = null;
    await user.save();

    logger.info(`[linkTelegramChat] Successfully linked ${user.leetcodeUsername} to ChatID ${chatId}`);
    return { success: true, message: 'Successfully connected! You will now receive LeetCode notifications.' };
}

async function toggleTelegramUpdates(guildId, discordId) {
    // We still need guildId to verify they are in the server, but logic is global
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

    const user = await TelegramUser.findOne({ leetcodeUsername: targetUsername });

    if (!user || !user.telegramChatId) {
        return { success: false, message: 'You have not connected a Telegram account yet.' };
    }

    user.isEnabled = !user.isEnabled;
    await user.save();

    return {
        success: true,
        message: `Telegram updates have been ${user.isEnabled ? 'enabled' : 'disabled'} globally.`
    };
}

async function getTelegramUser(guildId, username) {
    // GuildId technically not needed for global lookup, but keeping signature for compatibility if needed
    return await TelegramUser.findOne({ leetcodeUsername: username });
}

async function getConnectionByChatId(chatId) {
    const user = await TelegramUser.findOne({ telegramChatId: chatId.toString() });
    if (!user) return null;

    // Find all guilds this user is tracked in
    const guilds = await Guild.find({});
    const connectedGuilds = [];

    for (const guild of guilds) {
        if (guild.users && guild.users.has(user.leetcodeUsername)) {
            // We usually don't store guild name in DB, only ID. 
            // In a real bot we'd fetch from Discord client, but configManager might not have client access easily.
            // We will return ID for now, or just count.
            connectedGuilds.push({
                guildId: guild.guildId,
                channelId: guild.channelId
            });
        }
    }

    return {
        username: user.leetcodeUsername,
        userId: user.userId,
        connectedGuilds: connectedGuilds,
        userData: user
    };
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
    getConnectionByChatId,
    getAllGuildConfigs,
    setAdminRole,
    getAdminRole
};