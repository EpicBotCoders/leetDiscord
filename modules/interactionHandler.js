const { addUser, removeUser, getGuildUsers, initializeGuildConfig, updateGuildChannel, addCronJob, removeCronJob, listCronJobs } = require('./configManager');
const { enhancedCheck } = require('./apiUtils');
const { scheduleTasks } = require('./scheduledTasks');

async function handleInteraction(interaction) {
    console.log(`[handleInteraction] Interaction received: ${interaction.commandName}`);

    if (!interaction.isCommand()) {
        console.log('[handleInteraction] Interaction is not a command. Ignoring.');
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
            default:
                await interaction.reply('Unknown command.');
        }
    } catch (error) {
        console.error(`[handleInteraction] Error handling ${commandName}:`, error);
        await interaction.reply('An error occurred while processing your command.');
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
    
    console.log(`[handleAddUser] Adding user: ${username} with Discord ID: ${discordId}`);
    const addResult = await addUser(interaction.guildId, username, discordId);
    await interaction.reply(addResult);
}

async function handleRemoveUser(interaction) {
    const username = interaction.options.getString('username');
    console.log(`[handleRemoveUser] Removing user: ${username}`);
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
    if (!interaction.memberPermissions.has('MANAGE_CHANNELS')) {
        await interaction.reply('You need the Manage Channels permission to use this command.');
        return;
    }

    const channel = interaction.options.getChannel('channel');
    if (!channel || !channel.isTextBased()) {
        await interaction.reply('Please specify a valid text channel.');
        return;
    }

    await initializeGuildConfig(interaction.guildId, channel.id);
    await updateGuildChannel(interaction.guildId, channel.id);
    await interaction.reply(`Announcement channel set to ${channel}.`);
}

async function handleManageCron(interaction) {
    if (!interaction.memberPermissions.has('MANAGE_CHANNELS')) {
        await interaction.reply('You need the Manage Channels permission to use this command.');
        return;
    }

    const subcommand = interaction.options.getSubcommand();

    switch (subcommand) {
        case 'add': {
            const hours = interaction.options.getInteger('hours');
            const minutes = interaction.options.getInteger('minutes');
            const result = await addCronJob(interaction.guildId, hours, minutes);
            await interaction.reply(result);
            // Reschedule tasks to apply the new schedule
            await scheduleTasks(interaction.client);
            break;
        }
        case 'remove': {
            const hours = interaction.options.getInteger('hours');
            const minutes = interaction.options.getInteger('minutes');
            const result = await removeCronJob(interaction.guildId, hours, minutes);
            await interaction.reply(result);
            // Reschedule tasks to apply the removed schedule
            await scheduleTasks(interaction.client);
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

module.exports = { handleInteraction };