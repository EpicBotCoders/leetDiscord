// Refactor the code into modules

// Import necessary modules
const { Client, GatewayIntentBits } = require('discord.js');
const { token } = require('./config.json');
const { registerCommands } = require('./modules/commandRegistration');
const { scheduleTasks } = require('./modules/scheduledTasks');
const { handleInteraction } = require('./modules/interactionHandler');
const { initializeGuildConfig } = require('./modules/configManager');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Handle guild join events
client.on('guildCreate', async (guild) => {
    try {
        console.log(`[guildCreate] Bot joined new guild: ${guild.name} (${guild.id})`);
        // Find the first available text channel to send welcome message
        const channel = guild.channels.cache
            .find(channel => channel.type === 0 && channel.permissionsFor(guild.members.me).has('SendMessages'));

        if (channel) {
            await initializeGuildConfig(guild.id, channel.id);
            await channel.send(
                'Thanks for adding me! Please use `/setchannel` to set up the announcement channel, ' +
                'then use `/adduser` to start tracking LeetCode users in this server.'
            );
        }
    } catch (error) {
        console.error('[guildCreate] Error handling new guild:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    try {
        await handleInteraction(interaction);
    } catch (error) {
        console.error('[interactionCreate] Error handling interaction:', error);
    }
});

client.once('ready', async () => {
    try {
        console.log(`Logged in as ${client.user.tag}`);
        await registerCommands(client.user.id);

        // Initialize configurations for existing guilds if needed
        client.guilds.cache.forEach(async (guild) => {
            try {
                const config = await initializeGuildConfig(guild.id, null);
                if (!config.channelId) {
                    const channel = guild.channels.cache
                        .find(channel => channel.type === 0 && channel.permissionsFor(guild.members.me).has('SendMessages'));
                    if (channel) {
                        await initializeGuildConfig(guild.id, channel.id);
                    }
                }
            } catch (error) {
                console.error(`[Ready] Error initializing guild ${guild.id}:`, error);
            }
        });

        // Schedule tasks for all guilds
        await scheduleTasks(client);
    } catch (error) {
        console.error('[Ready] Error during client ready event:', error);
    }
});

process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

client.login(token).catch(error => {
    console.error('[Login] Error logging in:', error);
});
