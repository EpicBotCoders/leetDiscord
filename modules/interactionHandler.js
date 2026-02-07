const { addUser, removeUser, getGuildUsers, getGuildConfig, initializeGuildConfig, updateGuildChannel, addCronJob, removeCronJob, listCronJobs } = require('./configManager');
const { enhancedCheck, getUserCalendar } = require('./apiUtils');
const { updateGuildCronJobs } = require('./scheduledTasks');
const logger = require('./logger');

async function handleInteraction(interaction) {
    logger.info(`Interaction received: ${interaction.commandName}`);

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
            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        logger.error(`Error handling ${commandName}:`, error);

        // Handle specific error: Guild not configured
        if (error.message === 'Guild not configured') {
            const replyMessage = 'This server is not configured yet. Please run `/setchannel` to set an announcement channel and initialize the bot.';
            if (interaction.deferred || interaction.replied) {
                await interaction.editReply(replyMessage);
            } else {
                await interaction.reply(replyMessage);
            }
            return;
        }

        // Only reply if we haven't already
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply('An error occurred while processing your command.');
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
    if (!channel || !channel.isTextBased()) {
        await interaction.reply('Please specify a valid text channel.');
        return;
    }

    // Check if bot has permission to send messages in the channel
    const botPermissions = channel.permissionsFor(interaction.client.user);
    if (!botPermissions.has(['SendMessages', 'ViewChannel', 'EmbedLinks'])) {
        await interaction.reply('I don\'t have permission to send messages or embeds in that channel. Please check my permissions and try again.');
        return;
    }

    await initializeGuildConfig(interaction.guildId, channel.id);
    await updateGuildChannel(interaction.guildId, channel.id);

    // Send test embed to the channel
    const testEmbed = {
        color: 0x00ff00,
        title: '📢 Channel Setup Successful!',
        description: 'I will send LeetCode activity updates in this channel.',
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
            await interaction.reply(result);
            // Update cron jobs after adding
            await updateGuildCronJobs(interaction.guildId);
            break;
        }
        case 'remove': {
            const hours = interaction.options.getInteger('hours');
            const minutes = interaction.options.getInteger('minutes');
            result = await removeCronJob(interaction.guildId, hours, minutes);
            await interaction.reply(result);
            // Update cron jobs after removing
            await updateGuildCronJobs(interaction.guildId);
            break;
        }
        case 'list': {
            const times = await listCronJobs(interaction.guildId);
            if (times.length === 0) {
                await interaction.reply('No scheduled check times configured.');
            } else {
                await interaction.reply(`Scheduled check times:\n${times.join('\n')}`);
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
            await interaction.editReply(`Your stats are being fetched for the first time. Please try again in a moment!`);
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
    const botInfoEmbed = {
        color: 0x00ff00,
        title: '📚 LeetCode Discord Bot Info',
        description: 'I help track LeetCode activity for your server members. You can find my source code and contribute at:\nhttps://github.com/mochiron-desu/leetDiscord',
        fields: [
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
    const helpEmbed = {
        color: 0x5865F2,
        title: '📖 LeetCode Discord Bot - Command Help',
        description: 'Here are all available commands organized by category. Commands marked with 🔒 require special permissions.',
        fields: [
            {
                name: '⚙️ Setup Commands',
                value: '**`/setchannel #channel`** 🔒\n└ Set the announcement channel for LeetCode updates\n└ *Requires: Manage Channels permission*\n└ Example: `/setchannel #leetcode-updates`',
                inline: false
            },
            {
                name: '👥 User Management',
                value: '**`/adduser username [discord_user]`**\n└ Add a LeetCode user to track (optionally link to Discord user)\n└ *Users can add themselves; admins can add anyone*\n└ Example: `/adduser john_doe @JohnDoe`\n\n**`/removeuser username`**\n└ Remove a LeetCode user from tracking\n└ *Users can remove themselves; admins can remove anyone*\n└ Example: `/removeuser john_doe`\n\n**`/listusers`**\n└ Display all tracked LeetCode users in this server\n└ Shows Discord mentions if linked',
                inline: false
            },
            {
                name: '⏰ Scheduling Commands',
                value: '**`/managecron add hours minutes`** 🔒\n└ Add a scheduled check time (24-hour format)\n└ *Requires: Manage Channels permission*\n└ Example: `/managecron add hours:14 minutes:30`\n\n**`/managecron remove hours minutes`** 🔒\n└ Remove a scheduled check time\n└ Example: `/managecron remove hours:14 minutes:30`\n\n**`/managecron list`** 🔒\n└ List all scheduled check times for this server',
                inline: false
            },
            {
                name: '🔍 Monitoring Commands',
                value: '**`/check`**\n└ Manually trigger a check of today\'s LeetCode challenge\n└ Checks all tracked users and posts results to the announcement channel\n\n**`/leetstats [show_all]`**\n└ View LeetCode statistics (streak, active days, etc.)\n└ Default: Shows your personal stats if registered\n└ `show_all:true` - Shows stats for all tracked members\n└ Example: `/leetstats` or `/leetstats show_all:true`',
                inline: false
            },
            {
                name: 'ℹ️ Information Commands',
                value: '**`/botinfo`**\n└ Display bot information and GitHub repository link\n\n**`/help`**\n└ Display this help message',
                inline: false
            },
            {
                name: '🚀 Quick Start Guide',
                value: '1️⃣ Run `/setchannel` to set where updates are posted\n2️⃣ Use `/adduser` to add LeetCode users to track\n3️⃣ Set up automatic checks with `/managecron add`\n4️⃣ Use `/check` to manually trigger a status check',
                inline: false
            }
        ],
        footer: {
            text: 'LeetCode Discord Bot • GitHub: mochiron-desu/leetDiscord'
        },
        timestamp: new Date()
    };

    await interaction.reply({ embeds: [helpEmbed] });
}

module.exports = { handleInteraction };