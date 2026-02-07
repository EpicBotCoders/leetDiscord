// Refactor the code into modules

// Import necessary modules
const { Client, GatewayIntentBits } = require('discord.js');
const { handleInteraction } = require('./modules/interactionHandler');
const { registerCommands } = require('./modules/commandRegistration');
const { loadConfig } = require('./modules/configManager');
const { connectDB } = require('./modules/models/db');
const logger = require('./modules/logger');
const { initializeScheduledTasks, stopAllCronJobs } = require('./modules/scheduledTasks');

async function sendWelcomeMessage(guild) {
    try {
        // Find the first available text channel we can send to
        const channel = guild.channels.cache.find(
            channel => channel.type === 0 && // 0 is GUILD_TEXT
                channel.permissionsFor(guild.members.me).has(['SendMessages', 'ViewChannel'])
        );

        if (!channel) {
            logger.warn(`Could not find a suitable channel to send welcome message in guild ${guild.name}`);
            return;
        }

        const welcomeEmbed = {
            color: 0x00ff00,
            title: '👋 Hello! I\'m LeetCode Discord Bot!',
            description: 'I help track LeetCode activity for your server members. You can find my source code and contribute at:\nhttps://github.com/mochiron-desu/leetDiscord',
            fields: [
                {
                    name: '🚀 Getting Started',
                    value: '1. Use `/setchannel` to set where I should post updates\n2. Add users to track with `/adduser`\n3. Use `/check` to manually check progress'
                },
                {
                    name: '📢 Features',
                    value: '• Track daily LeetCode challenge completion\n• Schedule automatic progress checks\n• Multiple server support\n• Discord user mentions'
                }
            ],
            footer: {
                text: 'Type / to see all available commands!'
            },
            timestamp: new Date()
        };

        await channel.send({ embeds: [welcomeEmbed] });
    } catch (error) {
        logger.error('Error sending welcome message:', error);
    }
}

async function main() {
    let client = null;

    try {
        // Connect to MongoDB first
        await connectDB();

        const config = await loadConfig();
        client = new Client({
            intents: [
                GatewayIntentBits.Guilds,
                GatewayIntentBits.GuildMessages,
                GatewayIntentBits.GuildMembers,
                GatewayIntentBits.MessageContent
            ]
        });

        client.once('ready', async () => {
            try {
                logger.info('Bot is ready!');
                await registerCommands(client.application.id);
                await initializeScheduledTasks(client);
                logger.info('Bot initialization complete');
            } catch (error) {
                logger.error('Error during bot initialization:', error);
            }
        });

        client.on('guildCreate', async (guild) => {
            logger.info(`Joined new guild: ${guild.name} (${guild.id})`);
            await sendWelcomeMessage(guild);
        });

        client.on('interactionCreate', async interaction => {
            await handleInteraction(interaction);
        });

        await client.login(config.token);

        // Setup graceful shutdown handlers
        setupGracefulShutdown(client);
    } catch (error) {
        logger.error('Failed to start the bot:', error);
        process.exit(1);
    }
}

function setupGracefulShutdown(client) {
    let isShuttingDown = false;

    const shutdown = async (signal) => {
        if (isShuttingDown) {
            logger.warn('Shutdown already in progress...');
            return;
        }

        isShuttingDown = true;
        logger.info(`\n${signal} received. Starting graceful shutdown...`);

        try {
            // Give ongoing operations a chance to complete
            logger.info('Waiting for ongoing operations to complete...');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Stop all scheduled cron jobs
            logger.info('Stopping scheduled tasks...');
            stopAllCronJobs();

            // Disconnect Discord client
            if (client) {
                logger.info('Disconnecting from Discord...');
                await client.destroy();
                logger.info('Discord client disconnected');
            }

            // Close MongoDB connection
            const mongoose = require('mongoose');
            if (mongoose.connection.readyState !== 0) {
                logger.info('Closing MongoDB connection...');
                await mongoose.connection.close();
                logger.info('MongoDB connection closed');
            }

            logger.info('Graceful shutdown complete');
            process.exit(0);
        } catch (error) {
            logger.error('Error during graceful shutdown:', error);
            process.exit(1);
        }
    };

    // Handle termination signals
    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

    // Handle uncaught exceptions and rejections
    process.on('uncaughtException', (error) => {
        logger.error('Uncaught Exception:', error);
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', (reason, promise) => {
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        shutdown('unhandledRejection');
    });
}

main();
