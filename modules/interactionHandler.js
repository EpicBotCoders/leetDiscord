const { addUser, removeUser, getGuildUsers, getGuildConfig, initializeGuildConfig, updateGuildChannel, addCronJob, removeCronJob, listCronJobs, setTelegramToken, toggleTelegramUpdates, getTelegramUser, getAllGuildConfigs } = require('./configManager');
const { commandDefinitions } = require('./commandRegistration');
const { enhancedCheck, getUserCalendar, getBestDailySubmission, getDailySlug } = require('./apiUtils');
const { updateGuildCronJobs, performDailyCheck } = require('./scheduledTasks');
const logger = require('./logger');
const { v4: uuidv4 } = require('uuid');
const { ChannelType, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require('discord.js');

// Cache for autocomplete data - updated only when members or cron jobs are added/removed
const usernameCache = new Map(); // Map<guildId, string[]> - array of usernames
const cronJobsCache = new Map(); // Map<guildId, string[]> - array of cron schedule strings

// Helper function to get cached usernames, fetching from DB if not cached
async function getCachedUsernames(guildId) {
    if (!usernameCache.has(guildId)) {
        logger.info(`No cached usernames for guild ${guildId}, fetching from DB`);
        const users = await getGuildUsers(guildId);
        const usernames = Object.keys(users);
        usernameCache.set(guildId, usernames);
    }
    logger.info(`Returning cached usernames for guild ${guildId}: ${usernameCache.get(guildId)}`);
    return usernameCache.get(guildId);
}

// Helper function to get cached cron jobs, fetching from DB if not cached
async function getCachedCronJobs(guildId) {
    logger.info(`Getting cached cron jobs for guild ${guildId}`);
    if (!cronJobsCache.has(guildId)) {
        logger.info(`No cached cron jobs for guild ${guildId}, fetching from DB`);
        const cronJobs = await listCronJobs(guildId);
        cronJobsCache.set(guildId, cronJobs);
    }
    logger.info(`Returning cached cron jobs for guild ${guildId}: ${cronJobsCache.get(guildId)}`);
    return cronJobsCache.get(guildId);
}

// Helper function to invalidate username cache for a guild
function invalidateUsernameCache(guildId) {
    logger.info(`Invalidating username cache for guild ${guildId}`);
    usernameCache.delete(guildId);
}

// Helper function to invalidate cron jobs cache for a guild
function invalidateCronJobsCache(guildId) {
    logger.info(`Invalidating cron jobs cache for guild ${guildId}`);
    cronJobsCache.delete(guildId);
}

// Initialize cache for all guilds on bot startup
async function initializeAutocompleteCache() {
    try {
        const guilds = await getAllGuildConfigs();
        
        for (const guild of guilds) {
            // Initialize username cache
            try {
                const users = await getGuildUsers(guild.guildId);
                const usernames = Object.keys(users);
                usernameCache.set(guild.guildId, usernames);
            } catch (error) {
                logger.warn(`Failed to initialize username cache for guild ${guild.guildId}:`, error);
            }
            
            // Initialize cron jobs cache
            try {
                const cronJobs = await listCronJobs(guild.guildId);
                cronJobsCache.set(guild.guildId, cronJobs);
            } catch (error) {
                logger.warn(`Failed to initialize cron jobs cache for guild ${guild.guildId}:`, error);
            }
        }
        
        logger.info(`Initialized autocomplete cache for ${guilds.length} guild(s)`);
    } catch (error) {
        logger.error('Error initializing autocomplete cache:', error);
    }
}

async function handleAutocomplete(interaction) {
    const { commandName, guildId } = interaction;

    if (!guildId) {
        await interaction.respond([]);
        return;
    }

    try {
        switch (commandName) {
            case 'removeuser':
            case 'daily':
                await handleUsernameAutocomplete(interaction);
                break;
            case 'managecron':
                await handleCronAutocomplete(interaction);
                break;
            default:
                await interaction.respond([]);
        }
    } catch (error) {
        logger.error(`Error handling autocomplete for ${commandName}:`, error);
        await interaction.respond([]);
    }
}

async function handleUsernameAutocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    try {
        const usernames = await getCachedUsernames(interaction.guildId);

        // Filter usernames based on user input
        const filtered = usernames
            .filter(username => username.toLowerCase().includes(focusedValue))
            .slice(0, 25) // Discord limits to 25 choices
            .map(username => ({
                name: username,
                value: username
            }));

        await interaction.respond(filtered);
    } catch (error) {
        logger.error('Error fetching usernames for autocomplete:', error);
        await interaction.respond([]);
    }
}

async function handleCronAutocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();

    // Only provide autocomplete for 'remove' subcommand
    if (subcommand !== 'remove') {
        await interaction.respond([]);
        return;
    }

    const focusedValue = interaction.options.getFocused();

    try {
        const cronJobs = await getCachedCronJobs(interaction.guildId);

        if (cronJobs.length === 0) {
            await interaction.respond([]);
            return;
        }

        // Parse existing cron schedules and format for display
        const times = cronJobs
            .map(job => {
                // Cron format: "minute hour * * *"
                const parts = job.split(' ');

                // Validate that we have at least minute and hour parts
                if (!parts[0] || !parts[1]) {
                    logger.warn(`Invalid cron job format: ${job}`);
                    return null;
                }

                const display = `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')} UTC`;
                return {
                    name: display,
                    value: `${parts[1]}:${parts[0]}` // Store as "hour:minute"
                };
            })
            .filter(time => time !== null); // Remove invalid entries

        // Filter based on user input
        const filtered = times
            .filter(time => time.name.toLowerCase().includes(focusedValue.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(filtered);
    } catch (error) {
        logger.error('Error fetching cron times for autocomplete:', error);
        await interaction.respond([]);
    }
}

async function handleInteraction(interaction) {
    logger.info(`Interaction received: ${interaction.commandName}`);

    // Handle autocomplete interactions
    if (interaction.isAutocomplete()) {
        await handleAutocomplete(interaction);
        return;
    }

    // Handle modal submits
    if (interaction.isModalSubmit()) {
        if (interaction.customId.startsWith('broadcast_')) {
            await handleBroadcastSubmit(interaction);
        }
        return;
    }

    if (!interaction.isCommand()) {
        logger.info('Interaction is not a command. Ignoring.');
        return;
    }

    const { commandName, guildId } = interaction;
    if (!guildId) {
        await interaction.reply('This command can only be used in a server.');
        return;
    }

    try {
        switch (commandName) {
            case 'check':
                await handleCheck(interaction);
                break;
            case 'adduser':
                await handleAddUser(interaction);
                break;
            case 'removeuser':
                await handleRemoveUser(interaction);
                break;
            case 'listusers':
                await handleListUsers(interaction);
                break;
            case 'setchannel':
                await handleSetChannel(interaction);
                break;
            case 'managecron':
                await handleManageCron(interaction);
                break;
            case 'leetstats':
                await handleLeetStats(interaction);
                break;
            case 'botinfo':
                await handleBotInfo(interaction);
                break;
            case 'help':
                await handleHelp(interaction);
                break;
            case 'telegram':
                await handleTelegram(interaction);
                break;
            case 'daily':
                await handleDaily(interaction);
                break;
            case 'forcecheck':
                await handleForceCheck(interaction);
                break;
            case 'broadcast':
                await handleBroadcast(interaction);
                break;
            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logger.error(`Error handling ${commandName}:`, error);

        // Handle specific error: Guild not configured
        if (error.message === 'Guild not configured') {
            const supportLink = process.env.DISCORD_SERVER_INVITE_LINK || 'https://discord.gg/4t5zg5SV69';
            const replyMessage = `This server is not configured yet. Please run \`/setchannel\` to set an announcement channel and initialize the bot.\nNeed help? Join our support server: ${supportLink}`;
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(replyMessage);
            } else {
                await interaction.reply(replyMessage);
            }
            return;
        }

        // Only reply if we haven't already
        if (!interaction.replied && !interaction.deferred) {
            const supportLink = process.env.DISCORD_SERVER_INVITE_LINK || 'https://discord.gg/4t5zg5SV69';
            await interaction.reply(`An error occurred while processing your command. If this persists, please report it in our support server: ${supportLink}`);
        }
    }
}
async function handleTelegram(interaction) {
    if (!interaction.guildId) {
        await interaction.reply('This command can only be used in a server.');
        return;
    }

    const subcommand = interaction.options.getSubcommand();

    if (subcommand === 'connect') {
        await interaction.deferReply({ ephemeral: true });

        try {
            // Check if user is registered and already connected
            const users = await getGuildUsers(interaction.guildId);
            let targetUsername = null;
            for (const [u, id] of Object.entries(users)) {
                if (id === interaction.user.id) {
                    targetUsername = u;
                    break;
                }
            }

            if (targetUsername) {
                const telegramUser = await getTelegramUser(interaction.guildId, targetUsername);
                if (telegramUser && telegramUser.telegramChatId) {
                    await interaction.editReply({
                        content: `✅ You are already connected to Telegram as **${targetUsername}**.\nTo check your status, use the \`/telegram status\` command.`,
                        ephemeral: true
                    });
                    return;
                }
            }

            const token = uuidv4();
            const username = await setTelegramToken(interaction.guildId, interaction.user.id, token);

            const botName = process.env.TELEGRAM_BOT_NAME || 'YourLeetCodeBot';
            const link = `https://t.me/${botName}?start=${token}`;

            await interaction.editReply({
                content: `Click this link to connect your Telegram account: ${link}\n\nThis link is valid for 15 minutes.`,
                ephemeral: true
            });
        } catch (error) {
            logger.error('Error generating Telegram link:', error);
            await interaction.editReply({
                content: `Error: ${error.message}. Warning: You must be registered with /adduser first.`,
                ephemeral: true
            });
        }
    } else if (subcommand === 'toggle') {
        await interaction.deferReply({ ephemeral: true });
        try {
            const result = await toggleTelegramUpdates(interaction.guildId, interaction.user.id);
            await interaction.editReply({ content: result.message, ephemeral: true });
        } catch (error) {
            logger.error('Error toggling Telegram updates:', error);
            await interaction.editReply({ content: 'An error occurred while toggling updates.', ephemeral: true });
        }
    } else if (subcommand === 'status') {
        await interaction.deferReply({ ephemeral: true });
        try {
            // We need to resolve username from discord ID first to get status
            // This is a bit round-about, maybe configManager should have a getTelegramUserByDiscordId
            // For now, using what we have: try toggle to get status? No, that changes it.
            // Let's rely on setTelegramToken logic to find username or just check configManager

            // Quick fix: reuse toggle logic without saving? No.
            // Better: Use getTelegramUser but we need username.
            // Let's iterate users to find username again (common pattern, maybe refactor later)
            const users = await getGuildUsers(interaction.guildId);
            let targetUsername = null;
            for (const [u, id] of Object.entries(users)) {
                if (id === interaction.user.id) {
                    targetUsername = u;
                    break;
                }
            }

            if (!targetUsername) {
                await interaction.editReply({ content: 'You are not registered in this server.', ephemeral: true });
                return;
            }

            const telegramUser = await getTelegramUser(interaction.guildId, targetUsername);
            if (telegramUser && telegramUser.telegramChatId) {
                await interaction.editReply({
                    content: `✅ **Telegram Connected Globally**\n\n👤 **LeetCode Account**: ${targetUsername}\n🔔 **Notifications**: ${telegramUser.isEnabled ? 'Enabled' : 'Disabled'}\n\nYour account is linked globally. You will receive notifications for this server and any other servers where you are tracked.`,
                    ephemeral: true
                });
            } else {
                await interaction.editReply({
                    content: '❌ **Telegram Not Connected**\n\nUse `/telegram connect` to link your account. This will link your account globally for all servers.',
                    ephemeral: true
                });
            }
        } catch (error) {
            logger.error('Error checking Telegram status:', error);
            await interaction.editReply({ content: 'An error occurred.', ephemeral: true });
        }
    }
}



async function handleCheck(interaction) {
    await interaction.deferReply();
    const users = Object.keys(await getGuildUsers(interaction.guildId));
    if (users.length === 0) {
        await interaction.editReply('No users are being tracked in this server.');
        return;
    }
    const checkResult = await enhancedCheck(users, interaction.client, interaction.channelId);
    await interaction.editReply(checkResult);
}

async function handleAddUser(interaction) {
    const username = interaction.options.getString('username');
    const targetUser = interaction.options.getUser('discord_user');
    const discordId = targetUser ? targetUser.id : null;

    // Check permissions - using correct permission flag 'ManageRoles'
    const hasPermission = interaction.member.permissions.has('ManageRoles') || interaction.member.permissions.has('Administrator');

    // If no permission, only allow adding self
    if (!hasPermission) {
        // If trying to add someone else's Discord account
        if (targetUser && targetUser.id !== interaction.user.id) {
            await interaction.reply('You can only add yourself to the tracking list. You need Manage Roles permission to add other users.');
            return;
        }
        // If no Discord user specified, ensure the leetcode username matches their Discord username
        if (!targetUser && username.toLowerCase() !== interaction.user.username.toLowerCase()) {
            await interaction.reply('You can only add yourself to the tracking list. Please use your Discord username as the LeetCode username or mention yourself.');
            return;
        }
    }

    logger.info(`Adding user: ${username} with Discord ID: ${discordId}`);
    const addResult = await addUser(interaction.guildId, username, discordId);
    
    // Invalidate cache if user was successfully added (check for success message prefix)
    // Success messages start with "Added", error message contains "already being tracked"
    if (addResult.startsWith('Added')) {
        invalidateUsernameCache(interaction.guildId);
    }
    
    await interaction.reply(addResult);
}

async function handleRemoveUser(interaction) {
    const username = interaction.options.getString('username');

    // Check permissions - using correct permission flag 'ManageRoles'
    const hasPermission = interaction.member.permissions.has('ManageRoles') || interaction.member.permissions.has('Administrator');

    // If no permission, verify they're removing themselves
    if (!hasPermission) {
        const guildUsers = await getGuildUsers(interaction.guildId);
        const userEntry = Object.entries(guildUsers).find(([leetcode]) => leetcode === username);

        if (!userEntry || userEntry[1] !== interaction.user.id) {
            await interaction.reply('You can only remove yourself from the tracking list. You need Manage Roles permission to remove other users.');
            return;
        }
    }

    logger.info(`Removing user: ${username}`);
    const removeResult = await removeUser(interaction.guildId, username);
    
    // Invalidate cache if user was successfully removed (check for success message prefix)
    // Success message starts with "Removed", error message contains "not in the tracking list"
    if (removeResult.startsWith('Removed')) {
        invalidateUsernameCache(interaction.guildId);
    }
    
    await interaction.reply(removeResult);
}

async function handleListUsers(interaction) {
    const users = await getGuildUsers(interaction.guildId);
    const userList = Object.entries(users)
        .map(([leetcode, discordId]) =>
            discordId ?
                `• ${leetcode} (<@${discordId}>)` :
                `• ${leetcode}`
        )
        .join('\n');

    await interaction.reply(
        userList ?
            `Currently tracking these users:\n${userList}` :
            'No users are being tracked in this server.'
    );
}

async function handleSetChannel(interaction) {
    if (!interaction.memberPermissions.has('ManageChannels')) {
        await interaction.reply('You need the Manage Channels permission to use this command.');
        return;
    }

    const channel = interaction.options.getChannel('channel');
    // Check if channel is a text-based channel (GuildText, GuildNews, etc.)
    const validChannelTypes = [ChannelType.GuildText, ChannelType.GuildNews, ChannelType.GuildAnnouncement];
    if (!channel || !validChannelTypes.includes(channel.type)) {
        await interaction.reply('Please specify a valid text channel.');
        return;
    }

    // Check if bot has permission to send messages in the channel
    const botPermissions = channel.permissionsFor(interaction.client.user);
    if (!botPermissions.has(['SendMessages', 'ViewChannel', 'EmbedLinks'])) {
        await interaction.reply('I don\'t have permission to send messages or embeds in that channel. Please check my permissions and try again.');
        return;
    }

    const existingConfig = await getGuildConfig(interaction.guildId);
    const isNewSetup = !existingConfig;

    await initializeGuildConfig(interaction.guildId, channel.id);
    await updateGuildChannel(interaction.guildId, channel.id);

    let description = 'I will send LeetCode activity updates in this channel.';

    const supportLink = process.env.DISCORD_SERVER_INVITE_LINK || 'https://discord.gg/4t5zg5SV69';

    if (isNewSetup) {
        description += '\n\n**⏰ Default Schedule Added**\n' +
            'Two daily checks have been scheduled at **10:00 UTC** and **18:00 UTC**.\n' +
            'To remove them, use `/managecron remove`.\n\n' +
            `Need help? [Join our Support Server](${supportLink})`;
    } else {
        description += `\n\nNeed help? [Join our Support Server](${supportLink})`;
    }

    // Send test embed to the channel
    const testEmbed = {
        color: 0x00ff00,
        title: '📢 Channel Setup Successful!',
        description: description,
        footer: {
            text: 'You can change this channel at any time using /setchannel'
        },
        timestamp: new Date()
    };

    try {
        await channel.send({ embeds: [testEmbed] });
        await interaction.reply(`Successfully set ${channel} as the announcement channel!`);
    } catch (error) {
        logger.error('Error sending test message:', error);
        await interaction.reply('Channel was set but I encountered an error while sending a test message. Please check my permissions.');
    }
}

async function handleManageCron(interaction) {
    if (!interaction.memberPermissions.has('ManageChannels')) {
        await interaction.reply('You need the Manage Channels permission to use this command.');
        return;
    }

    const subcommand = interaction.options.getSubcommand();
    let result;

    switch (subcommand) {
        case 'add': {
            const hours = interaction.options.getInteger('hours');
            const minutes = interaction.options.getInteger('minutes');
            result = await addCronJob(interaction.guildId, hours, minutes);
            
            // Invalidate cache if cron job was successfully added (check for success message prefix)
            // Success message starts with "Added new check time", error message contains "already scheduled"
            if (result.startsWith('Added new check time')) {
                invalidateCronJobsCache(interaction.guildId);
            }
            
            await interaction.reply(result);
            // Update cron jobs after adding
            await updateGuildCronJobs(interaction.guildId);
            break;
        }
        case 'remove': {
            const timeValue = interaction.options.getString('time');

            // Parse the time value (format: "hour:minute")
            const [hourStr, minuteStr] = timeValue.split(':');
            const hours = parseInt(hourStr, 10);
            const minutes = parseInt(minuteStr, 10);

            // Validate parsed values
            if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
                await interaction.reply('Invalid time format. Please select a valid time from the dropdown.');
                break;
            }

            result = await removeCronJob(interaction.guildId, hours, minutes);
            
            // Invalidate cache if cron job was successfully removed (check for success message prefix)
            // Success message starts with "Removed check time", error message contains "No check scheduled"
            if (result.startsWith('Removed check time')) {
                invalidateCronJobsCache(interaction.guildId);
            }
            
            await interaction.reply(result);
            // Update cron jobs after removing
            await updateGuildCronJobs(interaction.guildId);
            break;
        }
        case 'list': {
            const cronSchedules = await listCronJobs(interaction.guildId);
            if (cronSchedules.length === 0) {
                await interaction.reply('No scheduled check times configured.');
            } else {
                // Format cron schedules to readable time format
                const formattedTimes = cronSchedules.map(schedule => {
                    const [minutes, hours] = schedule.split(' ');
                    return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')} UTC`;
                });
                await interaction.reply(`Scheduled check times:\n${formattedTimes.join('\n')}`);
            }
            break;
        }
    }
}

async function handleLeetStats(interaction) {
    await interaction.deferReply();

    const showAll = interaction.options.getBoolean('show_all') || false;
    const guildUsers = await getGuildUsers(interaction.guildId);

    if (Object.keys(guildUsers).length === 0) {
        await interaction.editReply('No users are being tracked in this server. Use `/adduser` to start tracking!');
        return;
    }

    const guild = await getGuildConfig(interaction.guildId);

    if (showAll) {
        // Show stats for all registered members
        const statsFields = [];

        for (const [username, discordId] of Object.entries(guildUsers)) {
            const userStats = guild.userStats?.get(username);

            if (userStats) {
                const displayName = discordId ? `<@${discordId}>` : username;
                statsFields.push({
                    name: `${username}`,
                    value: `👤 ${displayName}\n` +
                        `🔥 Streak: **${userStats.streak}** days\n` +
                        `📅 Total Active Days: **${userStats.totalActiveDays}**\n` +
                        `📆 Active Years: ${userStats.activeYears.length > 0 ? userStats.activeYears.join(', ') : 'N/A'}\n` +
                        `🕐 Last Updated: ${userStats.lastUpdated ? new Date(userStats.lastUpdated).toLocaleDateString() : 'Never'}`,
                    inline: true
                });
            } else {
                const displayName = discordId ? `<@${discordId}>` : username;
                statsFields.push({
                    name: `${username}`,
                    value: `👤 ${displayName}\n📊 Stats not yet fetched`,
                    inline: true
                });
            }
        }

        const statsEmbed = {
            color: 0xFFA500,
            title: '📊 Server LeetCode Statistics',
            description: `Showing stats for all ${statsFields.length} tracked members`,
            fields: statsFields,
            footer: {
                text: 'Use /leetstats without options to see your personal stats'
            },
            timestamp: new Date()
        };

        await interaction.editReply({ embeds: [statsEmbed] });
    } else {
        // Show stats for the user running the command
        const userEntry = Object.entries(guildUsers).find(([leetcode, discordId]) =>
            discordId === interaction.user.id
        );

        if (!userEntry) {
            // User not registered - show server stats and reminder
            const totalUsers = Object.keys(guildUsers).length;
            let totalStreak = 0;
            let totalActiveDays = 0;
            let usersWithStats = 0;

            for (const username of Object.keys(guildUsers)) {
                const userStats = guild.userStats?.get(username);
                if (userStats) {
                    totalStreak += userStats.streak || 0;
                    totalActiveDays += userStats.totalActiveDays || 0;
                    usersWithStats++;
                }
            }

            const avgStreak = usersWithStats > 0 ? (totalStreak / usersWithStats).toFixed(1) : 0;
            const avgActiveDays = usersWithStats > 0 ? (totalActiveDays / usersWithStats).toFixed(0) : 0;

            const serverStatsEmbed = {
                color: 0xFF6B6B,
                title: '⚠️ You are not registered!',
                description: `You're not in the tracking list yet. Use \`/adduser ${interaction.user.username}\` to start tracking your progress!\n\nHere are the server statistics:`,
                fields: [
                    {
                        name: '👥 Total Tracked Users',
                        value: `**${totalUsers}**`,
                        inline: true
                    },
                    {
                        name: '🔥 Average Streak',
                        value: `**${avgStreak}** days`,
                        inline: true
                    },
                    {
                        name: '📅 Average Active Days',
                        value: `**${avgActiveDays}** days`,
                        inline: true
                    }
                ],
                footer: {
                    text: 'Join the tracking list to see your personal stats!'
                },
                timestamp: new Date()
            };

            await interaction.editReply({ embeds: [serverStatsEmbed] });
            return;
        }

        // User is registered - show their personal stats
        const [username] = userEntry;
        const userStats = guild.userStats?.get(username);

        if (!userStats) {
            await interaction.editReply('Your stats are being fetched for the first time. Please try again in a moment!');
            return;
        }

        // Fetch fresh calendar data
        try {
            const calendarData = await getUserCalendar(username);

            const personalStatsEmbed = {
                color: 0x00D9FF,
                title: `📊 LeetCode Statistics for ${username}`,
                description: `Personal stats for <@${interaction.user.id}>`,
                fields: [
                    {
                        name: '🔥 Current Streak',
                        value: `**${calendarData.streak || 0}** days`,
                        inline: true
                    },
                    {
                        name: '📅 Total Active Days',
                        value: `**${calendarData.totalActiveDays || 0}** days`,
                        inline: true
                    },
                    {
                        name: '📆 Active Years',
                        value: calendarData.activeYears && calendarData.activeYears.length > 0
                            ? calendarData.activeYears.join(', ')
                            : 'N/A',
                        inline: true
                    },
                    {
                        name: '🏆 DCC Badges',
                        value: calendarData.dccBadges && calendarData.dccBadges.length > 0
                            ? `${calendarData.dccBadges.length} badges`
                            : 'No badges yet',
                        inline: true
                    }
                ],
                footer: {
                    text: 'Use /leetstats show_all:true to see server-wide stats'
                },
                timestamp: new Date()
            };

            await interaction.editReply({ embeds: [personalStatsEmbed] });
        } catch (error) {
            logger.error(`Error fetching calendar data for ${username}:`, error);

            const fallbackEmbed = {
                color: 0xFFA500,
                title: `📊 LeetCode Statistics for ${username}`,
                description: `Personal stats for <@${interaction.user.id}> (from cache)`,
                fields: [
                    {
                        name: '🔥 Current Streak',
                        value: `**${userStats.streak || 0}** days`,
                        inline: true
                    },
                    {
                        name: '📅 Total Active Days',
                        value: `**${userStats.totalActiveDays || 0}** days`,
                        inline: true
                    },
                    {
                        name: '📆 Active Years',
                        value: userStats.activeYears && userStats.activeYears.length > 0
                            ? userStats.activeYears.join(', ')
                            : 'N/A',
                        inline: true
                    },
                    {
                        name: '🕐 Last Updated',
                        value: userStats.lastUpdated
                            ? new Date(userStats.lastUpdated).toLocaleString()
                            : 'Never',
                        inline: true
                    }
                ],
                footer: {
                    text: 'Could not fetch fresh data - showing cached stats'
                },
                timestamp: new Date()
            };

            await interaction.editReply({ embeds: [fallbackEmbed] });
        }
    }
}

async function handleBotInfo(interaction) {
    const clientId = interaction.client.user.id;
    const permissions = 19456; // View Channels, Send Messages, Embed Links, Attach Files, Read Message History
    const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

    const botInfoEmbed = {
        color: 0x00ff00,
        title: '📚 LeetCode Discord Bot Info',
        description: 'I help track LeetCode activity for your server members. You can find my source code and contribute at:\nhttps://github.com/mochiron-desu/leetDiscord',
        fields: [
            {
                name: '🔗 Invite Me',
                value: `[Click here to add the bot to your server](${inviteLink})`
            },
            {
                name: '🎯 Purpose',
                value: 'Track and encourage daily LeetCode challenge completion within your Discord community'
            },
            {
                name: '🤖 Features',
                value: '• Daily challenge tracking\n• Automatic progress checks\n• Multi-server support\n• User mentions\n• Flexible scheduling'
            },
            {
                name: '💡 Basic Commands',
                value: '`/setchannel` - Set announcement channel\n`/adduser` - Track a user\n`/check` - Manual progress check\n`/managecron` - Schedule checks'
            },
            {
                name: '🆘 Support',
                value: `[Join Support Server](${process.env.DISCORD_SERVER_INVITE_LINK || 'https://discord.gg/4t5zg5SV69'})`
            }
        ],
        footer: {
            text: 'Type /help to see all available commands!'
        },
        timestamp: new Date()
    };

    await interaction.reply({ embeds: [botInfoEmbed] });
}

async function handleHelp(interaction) {
    const categories = {};

    // Group commands by category based on definitions
    commandDefinitions.forEach(cmd => {
        if (cmd.hidden) return;
        if (!categories[cmd.category]) {
            categories[cmd.category] = [];
        }
        categories[cmd.category].push(cmd.data);
    });

    const fields = Object.entries(categories).map(([category, commands]) => {
        const commandList = commands.map(cmd => {
            let desc = `**\`/${cmd.name}\`**\n└ ${cmd.description}`;

            // Add subcommand info if available (basic listing)
            if (cmd.options && cmd.options.length > 0) {
                const subcommands = cmd.options.filter(opt => opt.constructor.name === 'SlashCommandSubcommandBuilder');
                if (subcommands.length > 0) {
                    const subNames = subcommands.map(s => s.name).join(', ');
                    desc += `\n└ Subcommands: ${subNames}`;
                }
            }
            return desc;
        }).join('\n\n');

        return {
            name: `${getCategoryEmoji(category)} ${category}`,
            value: commandList,
            inline: false
        };
    });

    const helpEmbed = {
        color: 0x5865F2,
        title: '📖 LeetCode Discord Bot - Command Help',
        description: `Here are all available commands organized by category.\n\n[Need help? Join our Support Server](${process.env.DISCORD_SERVER_INVITE_LINK || 'https://discord.gg/4t5zg5SV69'})`,
        fields: fields,
        footer: {
            text: 'LeetCode Discord Bot • GitHub: mochiron-desu/leetDiscord'
        },
        timestamp: new Date()
    };

    await interaction.reply({ embeds: [helpEmbed] });
}

function getCategoryEmoji(category) {
    const emojis = {
        'Monitoring': '🔍',
        'User Management': '👥',
        'Setup': '⚙️',
        'Scheduling': '⏰',
        'Information': 'ℹ️',
        'Notifications': '🔔'
    };
    return emojis[category] || '🔹';
}

async function handleForceCheck(interaction) {
    if (!interaction.memberPermissions.has('Administrator')) {
        await interaction.reply({ content: 'You need Administrator permissions to use this command.', ephemeral: true });
        return;
    }

    await interaction.deferReply({ ephemeral: true });

    try {
        const result = await performDailyCheck(interaction.client, interaction.guildId, interaction.channelId);
        await interaction.editReply(result);
    } catch (error) {
        logger.error('Error in forcecheck:', error);
        await interaction.editReply('An error occurred while performing the check.');
    }
}

async function handleBroadcast(interaction) {
    if (interaction.user.id !== '637911567920529409') {
        await interaction.reply({ content: 'You are not authorized to use this command.', ephemeral: true });
        return;
    }

    const type = interaction.options.getString('type');

    const modal = new ModalBuilder()
        .setCustomId(`broadcast_${type}`)
        .setTitle('Broadcast Message');

    const messageInput = new TextInputBuilder()
        .setCustomId('messageInput')
        .setLabel("What's the announcement?")
        .setStyle(TextInputStyle.Paragraph)
        .setPlaceholder('Enter your message here (multiline supported)...')
        .setRequired(true);

    const firstActionRow = new ActionRowBuilder().addComponents(messageInput);

    modal.addComponents(firstActionRow);

    await interaction.showModal(modal);
}

async function handleBroadcastSubmit(interaction) {
    const type = interaction.customId.split('_')[1];
    const messageContent = interaction.fields.getTextInputValue('messageInput');

    let embedColor;
    let embedTitle;

    switch (type) {
        case 'info':
            embedColor = 0x3498db; // Blue
            embedTitle = '📢 Information';
            break;
        case 'warn':
            embedColor = 0xf1c40f; // Yellow
            embedTitle = '⚠️ Warning';
            break;
        case 'alert':
            embedColor = 0xe74c3c; // Red
            embedTitle = '🚨 Alert';
            break;
        default:
            embedColor = 0x95a5a6; // Grey
            embedTitle = 'Broadcast';
    }

    const embed = {
        color: embedColor,
        title: embedTitle,
        description: messageContent,
        footer: {
            text: 'System Broadcast'
        },
        timestamp: new Date()
    };

    await interaction.deferReply({ ephemeral: true });

    try {
        const guilds = await getAllGuildConfigs();
        let successCount = 0;
        let failCount = 0;

        for (const guildConfig of guilds) {
            if (!guildConfig.channelId) continue;

            try {
                // Fetch guild to ensure bot is still in it
                const guild = await interaction.client.guilds.fetch(guildConfig.guildId).catch(() => null);
                if (!guild) {
                    failCount++;
                    continue;
                }

                const channel = await guild.channels.fetch(guildConfig.channelId).catch(() => null);
                if (channel) {
                    await channel.send({ embeds: [embed] });
                    successCount++;
                } else {
                    failCount++;
                }
            } catch (error) {
                logger.warn(`Failed to send broadcast to guild ${guildConfig.guildId}:`, error.message);
                failCount++;
            }
        }

        await interaction.editReply(`Broadcast sent successfully to ${successCount} guilds. Failed for ${failCount} guilds.`);
    } catch (error) {
        logger.error('Error in broadcast command:', error);
        await interaction.editReply('An error occurred while sending the broadcast.');
    }
}

async function handleDaily(interaction) {
    await interaction.deferReply();

    try {
        const usernameOption = interaction.options.getString('username');
        const guildUsers = await getGuildUsers(interaction.guildId);
        let targetUsername = null;

        // If username provided, use it; otherwise resolve from Discord ID
        if (usernameOption) {
            // Check if username exists in guild
            if (guildUsers[usernameOption]) {
                targetUsername = usernameOption;
            } else {
                await interaction.editReply(`❌ User **${usernameOption}** is not tracked in this server.`);
                return;
            }
        } else {
            // Find username from Discord ID
            const userEntry = Object.entries(guildUsers).find(([leetcode, discordId]) =>
                discordId === interaction.user.id
            );

            if (!userEntry) {
                await interaction.editReply('❌ You are not registered in this server. Use `/adduser` to start tracking your LeetCode progress!');
                return;
            }

            targetUsername = userEntry[0];
        }

        // Fetch today's daily challenge
        const dailySlug = await getDailySlug();
        if (!dailySlug) {
            await interaction.editReply('❌ Failed to fetch today\'s daily challenge. Please try again later.');
            return;
        }

        // Fetch problem details
        const axios = require('axios');
        const problemDetails = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${dailySlug}`);
        const problem = problemDetails.data;

        // Fetch best submission
        const bestSubmission = await getBestDailySubmission(targetUsername, dailySlug);

        if (!bestSubmission) {
            const embed = {
                color: 0xff6b6b,
                title: '❌ No Submission Found',
                description: `**${targetUsername}** has not completed today's daily challenge yet.`,
                fields: [
                    {
                        name: '📌 Today\'s Problem',
                        value: `**${problem.title}**\n[View Problem](https://leetcode.com/problems/${dailySlug}/)`
                    }
                ],
                timestamp: new Date()
            };

            await interaction.editReply({ embeds: [embed] });
            return;
        }

        // Create success embed
        const submissionUrl = `https://leetcode.com${bestSubmission.url}`;
        const mention = guildUsers[targetUsername] ? `<@${guildUsers[targetUsername]}>` : targetUsername;

        const embed = {
            color: 0x00d9ff,
            title: '🧠 Daily Challenge Completed',
            description: `Submission details for **${targetUsername}**`,
            fields: [
                {
                    name: '📌 Problem',
                    value: `**${problem.title}**\n[View Problem](https://leetcode.com/problems/${dailySlug}/)`,
                    inline: false
                },
                {
                    name: '🔗 Submission',
                    value: `[View Submission](${submissionUrl})`,
                    inline: true
                },
                {
                    name: '💻 Language',
                    value: bestSubmission.langName,
                    inline: true
                },
                {
                    name: '\u200b',
                    value: '\u200b',
                    inline: true
                },
                {
                    name: '⚡ Runtime',
                    value: bestSubmission.runtime,
                    inline: true
                },
                {
                    name: '🧠 Memory',
                    value: bestSubmission.memory,
                    inline: true
                },
                {
                    name: '\u200b',
                    value: '\u200b',
                    inline: true
                }
            ],
            footer: {
                text: `Requested by ${interaction.user.username}`
            },
            timestamp: new Date()
        };

        // Add notes if they exist
        if (bestSubmission.hasNotes && bestSubmission.notes) {
            embed.fields.push({
                name: '📝 Notes',
                value: bestSubmission.notes,
                inline: false
            });
        }

        await interaction.editReply({ embeds: [embed] });
    } catch (error) {
        logger.error('Error in handleDaily:', error);
        await interaction.editReply('❌ An error occurred while fetching submission data. Please try again later.');
    }
}

module.exports = { handleInteraction, initializeAutocompleteCache };