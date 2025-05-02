// Refactor the code into modules

// Import necessary modules
const { Client, GatewayIntentBits } = require('discord.js');
const { handleInteraction } = require('./modules/interactionHandler');
const { registerCommands } = require('./modules/commandRegistration');
const { loadConfig } = require('./modules/configManager');
const { connectDB } = require('./modules/models/db');
const logger = require('./modules/logger');
const { initializeScheduledTasks } = require('./modules/scheduledTasks');

async function main() {
    try {
        // Connect to MongoDB first
        await connectDB();

        const config = await loadConfig();
        const client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages
            ]
        });

        client.once('ready', () => {
            logger.info('Bot is ready!');
            registerCommands(client.application.id);
            initializeScheduledTasks(client);
        });

        client.on('interactionCreate', async interaction => {
            await handleInteraction(interaction);
        });

        await client.login(config.token);
    } catch (error) {
        logger.error('Failed to start the bot:', error);
        process.exit(1);
    }
}

main();
