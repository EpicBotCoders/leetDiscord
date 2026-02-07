const { REST, Routes, SlashCommandBuilder } = require('discord.js');
require('dotenv').config();
const logger = require('./logger');

const commandDefinitions = [
    {
        category: 'Monitoring',
        data: new SlashCommandBuilder()
            .setName('check')
            .setDescription('Run a manual check of today\'s LeetCode challenge status')
    },
    {
        category: 'User Management',
        data: new SlashCommandBuilder()
            .setName('adduser')
            .setDescription('Add a LeetCode username to track')
            .addStringOption(option =>
                option.setName('username')
                    .setDescription('The LeetCode username to add')
                    .setRequired(true))
            .addUserOption(option =>
                option.setName('discord_user')
                    .setDescription('The Discord user to associate with this LeetCode account')
                    .setRequired(false))
    },
    {
        category: 'User Management',
        data: new SlashCommandBuilder()
            .setName('removeuser')
            .setDescription('Remove a LeetCode username from tracking')
            .addStringOption(option =>
                option.setName('username')
                    .setDescription('The LeetCode username to remove')
                    .setRequired(true))
    },
    {
        category: 'User Management',
        data: new SlashCommandBuilder()
            .setName('listusers')
            .setDescription('List all tracked LeetCode usernames')
    },
    {
        category: 'Setup',
        data: new SlashCommandBuilder()
            .setName('setchannel')
            .setDescription('Set the announcement channel for this server')
            .addChannelOption(option =>
                option.setName('channel')
                    .setDescription('The channel to send announcements to')
                    .setRequired(true))
    },
    {
        category: 'Scheduling',
        data: new SlashCommandBuilder()
            .setName('managecron')
            .setDescription('Manage cron schedules for LeetCode checks')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('add')
                    .setDescription('Add a new check time')
                    .addIntegerOption(option =>
                        option.setName('hours')
                            .setDescription('Hour in 24H format (0-23)')
                            .setRequired(true)
                            .setMinValue(0)
                            .setMaxValue(23))
                    .addIntegerOption(option =>
                        option.setName('minutes')
                            .setDescription('Minutes (0-59)')
                            .setRequired(true)
                            .setMinValue(0)
                            .setMaxValue(59)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('remove')
                    .setDescription('Remove an existing check time')
                    .addIntegerOption(option =>
                        option.setName('hours')
                            .setDescription('Hour in 24H format (0-23)')
                            .setRequired(true)
                            .setMinValue(0)
                            .setMaxValue(23))
                    .addIntegerOption(option =>
                        option.setName('minutes')
                            .setDescription('Minutes (0-59)')
                            .setRequired(true)
                            .setMinValue(0)
                            .setMaxValue(59)))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('list')
                    .setDescription('List all scheduled check times'))
    },
    {
        category: 'Monitoring',
        data: new SlashCommandBuilder()
            .setName('leetstats')
            .setDescription('View LeetCode statistics')
            .addBooleanOption(option =>
                option.setName('show_all')
                    .setDescription('Show stats for all registered members (default: your own stats)')
                    .setRequired(false))
    },
    {
        category: 'Information',
        data: new SlashCommandBuilder()
            .setName('botinfo')
            .setDescription('Display information about the bot and its GitHub repository')
    },
    {
        category: 'Information',
        data: new SlashCommandBuilder()
            .setName('help')
            .setDescription('Display all available commands and their usage')
    },
    {
        category: 'Notifications',
        data: new SlashCommandBuilder()
            .setName('telegram')
            .setDescription('Manage Telegram notifications')
            .addSubcommand(subcommand =>
                subcommand
                    .setName('connect')
                    .setDescription('Link your Telegram account to receive notifications'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('toggle')
                    .setDescription('Enable or disable Telegram notifications'))
            .addSubcommand(subcommand =>
                subcommand
                    .setName('status')
                    .setDescription('Check your Telegram connection status'))
    },
    {
        category: 'Admin',
        data: new SlashCommandBuilder()
            .setName('forcecheck')
            .setDescription('Manually trigger the daily check for this server (Admin only)')
            .setDefaultMemberPermissions(0x8) // Administrator permission
    }
];

async function registerCommands(clientId) {
    if (!clientId) {
        logger.error('Failed to register commands: No client ID provided');
        return;
    }

    logger.info(`Initializing command registration for clientId: ${clientId}`);
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

    // Convert definitions to JSON for Discord API
    const commands = commandDefinitions.map(def => def.data.toJSON());

    try {
        logger.info('Started refreshing application (/) commands.');

        // Register commands globally instead of per-guild
        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands }
        );

        logger.info('Successfully reloaded application (/) commands.');
    } catch (error) {
        logger.error('Error reloading commands:', error);
        throw error; // Propagate error for proper handling
    }
}

module.exports = { registerCommands, commandDefinitions };