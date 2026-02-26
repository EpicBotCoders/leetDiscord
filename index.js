// Refactor the code into modules

// Import necessary modules
const { Client, GatewayIntentBits } = require('discord.js');
const { handleInteraction, initializeAutocompleteCache } = require('./modules/interactionHandler');
const { registerCommands } = require('./modules/commandRegistration');
const { loadConfig } = require('./modules/configManager');
const { connectDB } = require('./modules/models/db');
const logger = require('./modules/logger');
const { initializeScheduledTasks, stopAllCronJobs } = require('./modules/scheduledTasks');
const { forceOfflineStatsPanel } = require('./modules/statsPanel');
const { startTelegramBot, stopTelegramBot } = require('./modules/telegramBot');
const http = require('http');

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
                    value: '1. Use `/setchannel` to set where I should post updates\n2. (Recommended) Use `/setadminrole` to choose which role can manage bot configuration (cron, channels, user management)\n3. Add users to track with `/adduser`\n4. Use `/check` to manually check progress'
                },
                {
                    name: '📢 Features',
                    value: '• Track daily LeetCode challenge completion\n• Schedule automatic progress checks\n• Multiple server support\n• Discord user mentions'
                },
                {
                    name: '🆘 Support',
                    value: `Need help? Join our [Support Server](${process.env.DISCORD_SERVER_INVITE_LINK || 'https://discord.gg/4t5zg5SV69'})`
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
                await initializeAutocompleteCache();
                logger.info('Bot initialization complete');
                logger.info("============ BOT IS READY ============")
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

        // Start Telegram Bot
        await startTelegramBot();


        // Express App setup
        const express = require('express');
        const cors = require('cors');
        const path = require('path');
        const RateLimit = require('express-rate-limit');
        const Guild = require('./modules/models/Guild');

        const DailySubmission = require('./modules/models/DailySubmission');

        const app = express();
        const port = process.env.PORT || 3000;

        // Rate limiter for frontend catch-all route
        const frontendLimiter = RateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
        });

        app.use(cors());
        app.use(express.static(path.join(__dirname, 'frontend/out')));

        // API Endpoints
        app.get('/api/stats', async (req, res) => {
            try {
                const totalGuilds = await Guild.countDocuments();
                const totalSubmissions = await DailySubmission.countDocuments();

                // Calculate total users across all guilds
                // Since users are in a Map in each guild document, we need to aggregate
                const guilds = await Guild.find({}, 'users');
                let totalUsers = 0;
                const uniqueUsers = new Set();

                for (const guild of guilds) {
                    if (guild.users) {
                        for (const userId of guild.users.keys()) {
                            uniqueUsers.add(userId);
                        }
                    }
                }
                totalUsers = uniqueUsers.size;

                res.json({
                    guilds: totalGuilds,
                    users: totalUsers,
                    submissions: totalSubmissions,
                    version: process.env.npm_package_version || '2.2.0'
                });
            } catch (error) {
                logger.error('API Error:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        app.get('/api/leaderboard/:guildId', async (req, res) => {
            try {
                const { guildId } = req.params;
                const guild = await Guild.findOne({ guildId });
                if (!guild) {
                    return res.status(404).json({ error: 'Guild not found' });
                }

                // Transform data for frontend
                const leaderboard = [];
                for (const [userId, username] of guild.users) {
                    const stats = guild.userStats.get(userId);
                    if (stats) {
                        leaderboard.push({
                            userId,
                            username,
                            ...stats.toObject() // Convert Mongoose subdocument to object
                        });
                    }
                }

                // Sort by total active days (descending)
                leaderboard.sort((a, b) => b.totalActiveDays - a.totalActiveDays);

                res.json(leaderboard);
            } catch (error) {
                logger.error('API Error:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        // Catch-all to serve index.html for client-side routing
        // In Express 5, '*' is not a valid wildcard. using regex instead.
        app.get(/(.*)/, frontendLimiter, (req, res) => {
            res.sendFile(path.join(__dirname, 'frontend/out/index.html'));
        });

        const server = app.listen(port, "0.0.0.0",  () => {
            logger.info(`Express server listening on port ${port}`);
        });

        // Self-ping to prevent sleeping (Render free tier)
        setInterval(() => {
            http.get(`http://localhost:${port}/api/health`, (res) => {
                // consume response
                res.resume();
            }).on('error', (e) => {
                // ignore error
            });
        }, 60000); // Ping every 1 minute

        // Health check endpoint
        app.get('/api/health', (req, res) => res.send('Alive'));

        // Setup graceful shutdown handlers
        setupGracefulShutdown(client, server);
    } catch (error) {
        logger.error('Failed to start the bot:', error);
        process.exit(1);
    }
}

function setupGracefulShutdown(client, server) {
    let isShuttingDown = false;

    const shutdown = async (signal) => {
        if (isShuttingDown) {
            logger.warn('Shutdown already in progress...');
            return;
        }

        isShuttingDown = true;
        logger.info(`\n${signal} received. Starting graceful shutdown...`);

        try {
            // Immediately update stats panel to offline
            if (client) {
                logger.info('Updating stats panel to offline...');
                await forceOfflineStatsPanel(client);
            }

            // Give ongoing operations a chance to complete
            logger.info('Waiting for ongoing operations to complete...');
            await new Promise(resolve => setTimeout(resolve, 2000));

            // Stop all scheduled cron jobs
            logger.info('Stopping scheduled tasks...');
            stopAllCronJobs();

            // Stop Telegram Bot
            await stopTelegramBot();

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

            // Close HTTP server
            if (server) {
                logger.info('Closing HTTP server...');
                server.close(() => {
                    logger.info('HTTP server closed');
                });
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
