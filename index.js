// Refactor the code into modules

// Import necessary modules
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const { token, channelId } = require('./config.json');
const { registerCommands } = require('./modules/commandRegistration');
const { runCheck, scheduleTasks } = require('./modules/scheduledTasks');
const { handleInteraction } = require('./modules/interactionHandler');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('interactionCreate', async (interaction) => {
    try {
        console.log(`[interactionCreate] Interaction received: ${interaction.commandName}`);
        await handleInteraction(interaction);
    } catch (error) {
        console.error('[interactionCreate] Error handling interaction:', error);
    }
});

client.once('ready', async () => {
    try {
        console.log(`Logged in as ${client.user.tag}`);
        await registerCommands(client.user.id);

        // Schedule tasks dynamically from config
        scheduleTasks(client);
    } catch (error) {
        console.error('[Ready] Error during client ready event:', error);
    }
});

client.login(token).catch(error => {
    console.error('[Login] Error logging in:', error);
});
