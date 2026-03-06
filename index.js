// Refactor the code into modules
require('dotenv').config();

// Import necessary modules
const { Client, GatewayIntentBits, ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const { handleInteraction, initializeAutocompleteCache } = require('./modules/interactionHandler');
const { registerCommands } = require('./modules/commandRegistration');
const { loadConfig } = require('./modules/configManager');
const { connectDB } = require('./modules/models/db');
const logger = require('./modules/logger');
const webhookReporter = require('./modules/webhookReporter');
const { initializeScheduledTasks, stopAllCronJobs, validateGuilds } = require('./modules/scheduledTasks');
const { forceOfflineStatsPanel } = require('./modules/statsPanel');
const { startTelegramBot, stopTelegramBot } = require('./modules/telegramBot');
const http = require('http');
const rateLimit = require('express-rate-limit');

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

async function sendWelcomeBackMessage(guild, existingGuildConfig) {
    try {
        const channel = guild.channels.cache.find(
            ch => ch.type === 0 &&
                ch.permissionsFor(guild.members.me).has(['SendMessages', 'ViewChannel'])
        );

        if (!channel) {
            logger.warn(`Could not find a suitable channel to send welcome-back message in guild ${guild.name}`);
            return;
        }

        const userCount = existingGuildConfig.users ? existingGuildConfig.users.size : 0;
        const cronCount = existingGuildConfig.cronJobs ? existingGuildConfig.cronJobs.length : 0;

        const welcomeBackEmbed = {
            color: 0xf5a623,
            title: '👋 Welcome Back!',
            description:
                `I was previously configured in this server and still have your data.\n\n` +
                `**Existing configuration includes:**\n` +
                `• **${userCount}** tracked user(s)\n` +
                `• **${cronCount}** scheduled cron job(s)\n\n` +
                `Would you like to continue with your existing configuration, or start fresh?`,
            fields: [
                {
                    name: '⚠️ Admin Only',
                    value: 'Only server administrators can use the buttons below.'
                }
            ],
            footer: { text: 'This prompt will be ignored after 10 minutes.' },
            timestamp: new Date()
        };

        const keepButton = new ButtonBuilder()
            .setCustomId('guild_restore_keep')
            .setLabel('✅ Keep Existing Config')
            .setStyle(ButtonStyle.Success);

        const resetButton = new ButtonBuilder()
            .setCustomId('guild_restore_reset')
            .setLabel('🗑️ Start Fresh')
            .setStyle(ButtonStyle.Danger);

        const row = new ActionRowBuilder().addComponents(keepButton, resetButton);

        await channel.send({ embeds: [welcomeBackEmbed], components: [row] });
        logger.info(`Sent welcome-back message to guild ${guild.name} (${guild.id})`);
    } catch (error) {
        logger.error('Error sending welcome-back message:', error);
    }
}

async function main() {
    let client = null;
    let server = null;

    try {
        logger.info('Starting LeetDiscord Bot initialization...');

        // 1. Connect to MongoDB
        await connectDB();
        // Logger inside connectDB already logs "Connected to MongoDB Atlas"

        // 2. Start Express server IMMEDIATELY after DB connection
        // This is critical for Render to detect an open port as soon as possible
        logger.info('Initializing Express server...');
        const express = require('express');
        const cors = require('cors');
        const path = require('path');
        const RateLimit = require('express-rate-limit');
        const Guild = require('./modules/models/Guild');
        const DailySubmission = require('./modules/models/DailySubmission');

        const app = express();
        app.set('trust proxy', 1);
        const port = process.env.PORT || 3000;

        // Rate limiter for frontend catch-all route
        const frontendLimiter = RateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 requests per windowMs
        });

        app.use(cors());
        app.use(express.static(path.join(__dirname, 'frontend/out'), {
            extensions: ['html']
        }));

        // Health check endpoint (moved up for immediate availability)
        app.get('/api/health', (req, res) => res.send('Alive'));

        // API Endpoints
        app.get('/api/stats', async (req, res) => {
            try {
                const activeGuildsCount = await Guild.countDocuments({ isActive: true });
                const totalSubmissions = await DailySubmission.countDocuments();

                const guilds = await Guild.find({ isActive: true }, 'users');
                const uniqueUsers = new Set();
                for (const guild of guilds) {
                    if (guild.users) {
                        for (const userId of guild.users.keys()) {
                            uniqueUsers.add(userId);
                        }
                    }
                }

                res.json({
                    guilds: activeGuildsCount,
                    users: uniqueUsers.size,
                    submissions: totalSubmissions,
                    version: process.env.npm_package_version || '2.2.0'
                });
            } catch (error) {
                logger.error('API Error:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        const apiLimiter = rateLimit({
            windowMs: 15 * 60 * 1000, // 15 minutes
            max: 100, // limit each IP to 100 API requests per windowMs
        });

        app.get('/api/leaderboard/:guildId', apiLimiter, async (req, res) => {
            try {
                const { guildId } = req.params;
                const guild = await Guild.findOne({ guildId });
                if (!guild) {
                    return res.status(404).json({ error: 'Guild not found' });
                }

                if (guild.isActive === false) {
                    return res.json({ error: 'Guild is currently inactive', inactive: true });
                }

                const leaderboard = [];
                for (const [userId, username] of guild.users) {
                    const stats = guild.userStats.get(userId);
                    if (stats) {
                        leaderboard.push({
                            userId,
                            username,
                            ...stats.toObject()
                        });
                    }
                }
                leaderboard.sort((a, b) => b.totalActiveDays - a.totalActiveDays);
                res.json(leaderboard);
            } catch (error) {
                logger.error('API Error:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        // Get all guilds (for static generation)
        app.get('/api/guilds', apiLimiter, async (req, res) => {
            try {
                // Return only active guilds so frontend doesn't build pages for inactive ones
                const guilds = await Guild.find({ isActive: true }, { guildId: 1 });
                res.json(guilds);
            } catch (error) {
                logger.error('Guilds API Error:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        // Hall of Fame endpoint
        app.get('/api/hall-of-fame/:guildId', apiLimiter, async (req, res) => {
            try {
                const { guildId } = req.params;
                const { difficulty = 'All' } = req.query;

                const guild = await Guild.findOne({ guildId });
                if (!guild) {
                    return res.status(404).json({ error: 'Guild not found' });
                }

                if (guild.isActive === false) {
                    return res.json({ error: 'Guild is currently inactive', inactive: true });
                }

                const { buildHallOfFameData } = require('./modules/hallOfFameUtils');
                const hallOfFameData = await buildHallOfFameData(guildId, difficulty);

                res.json(hallOfFameData);
            } catch (error) {
                logger.error('Hall of Fame API Error:', error);
                res.status(500).json({ error: 'Internal Server Error' });
            }
        });

        // Catch-all: try to serve a matching .html file from the static export,
        // then fall back to index.html for client-side routing
        app.get(/.*/, frontendLimiter, (req, res) => {
            if (req.url.startsWith('/api/')) {
                return res.status(404).json({ error: 'API route not found' });
            }
            // Try to serve a specific page's HTML (e.g. /hall-of-fame -> hall-of-fame.html)
            const urlPath = req.path.replace(/^\//, '').replace(/\/$/, '') || 'index';
            const specificFile = path.join(__dirname, 'frontend/out', `${urlPath}.html`);
            const fs = require('fs');
            if (urlPath !== 'index' && fs.existsSync(specificFile)) {
                return res.sendFile(specificFile);
            }
            res.sendFile(path.join(__dirname, 'frontend/out/index.html'));
        });

        server = app.listen(port, "0.0.0.0", () => {
            logger.info(`Express server listening on port ${port}`);
        });

        // Self-ping to prevent sleeping (Render free tier)
        setInterval(() => {
            http.get(`http://localhost:${port}/api/health`, (res) => {
                res.resume();
            }).on('error', (e) => {
                // ignore
            });
        }, 60000);

        // 3. Initialize Bots
        logger.info('Starting bot components...');
        const config = await loadConfig();

        if (!config.token) {
            logger.warn('DISCORD_TOKEN not found. Discord bot will not start.');
        } else {
            logger.info('Initializing Discord client...');
            const { Events } = require('discord.js');
            client = new Client({
                intents: [
                    GatewayIntentBits.Guilds,
                    GatewayIntentBits.GuildMessages,
                    GatewayIntentBits.GuildMembers,
                    GatewayIntentBits.MessageContent
                ]
            });

            // WebSocket Debug listeners
            client.ws.on('HELLO', () => logger.info('[DEBUG] WS: Received HELLO from gateway'));
            client.ws.on('READY', () => logger.info('[DEBUG] WS: Received READY from gateway'));
            client.ws.on('RESUMED', () => logger.info('[DEBUG] WS: Session RESUMED'));
            client.on('shardReady', (id) => logger.info(`[DEBUG] Shard ${id} ready`));
            client.on('shardError', (error) => logger.error('[DEBUG] Shard error:', error));
            client.on('shardDisconnect', (event, id) => logger.warn(`[DEBUG] Shard ${id} disconnected:`, event));
            client.on('shardReconnecting', (id) => logger.warn(`[DEBUG] Shard ${id} reconnecting`));

            // Register ready listener BEFORE login
            client.once(Events.ClientReady, async (c) => {
                logger.info(`[DEBUG] Discord ClientReady event fired. Logged in as ${c.user.tag}`);
                try {
                    const appId = c.application?.id;
                    if (!appId) {
                        logger.error('CRITICAL: Application ID not found on ready.');
                        return;
                    }

                    logger.info('Step 1: Registering commands...');
                    await registerCommands(appId);

                    logger.info('Step 2: Validating existing guilds...');
                    await validateGuilds(c);

                    logger.info('Step 3: Initializing scheduled tasks...');
                    await initializeScheduledTasks(c);

                    logger.info('Step 4: Initializing autocomplete cache...');
                    await initializeAutocompleteCache();

                    logger.info('Discord initialization complete');
                    logger.info("============ BOT IS READY ============");
                } catch (error) {
                    logger.error('Error during Discord ready initialization:', error);
                }
            });

            client.on('interactionCreate', async interaction => {
                await handleInteraction(interaction);
            });

            client.on('guildCreate', async (guild) => {
                logger.info(`Joined guild: ${guild.name} (${guild.id})`);
                require('./modules/webhookReporter').send({
                    phase: 'Guild Joined',
                    message: `Bot was added to a new server: **${guild.name}**`,
                    context: { guildId: guild.id, memberCount: guild.memberCount }
                }).catch(() => { });

                try {
                    const Guild = require('./modules/models/Guild');
                    const existingConfig = await Guild.findOne({ guildId: guild.id });
                    if (existingConfig) {
                        // Bot was re-added — data still exists, ask admin what to do
                        logger.info(`Existing config found for guild ${guild.id}, sending welcome-back message`);
                        await sendWelcomeBackMessage(guild, existingConfig);
                    } else {
                        // Brand new guild
                        await sendWelcomeMessage(guild);
                    }
                } catch (err) {
                    logger.error(`Error in guildCreate handler for ${guild.id}:`, err);
                    await sendWelcomeMessage(guild); // fallback to normal welcome
                }
            });

            client.on('guildDelete', async (guild) => {
                logger.info(`Removed from guild: ${guild.name} (${guild.id}) — marking inactive, data preserved`);

                // Feedback feature requested logs
                logger.info(`Bot removed event - Guild: ${guild.name}, ID: ${guild.id}, Owner: ${guild.ownerId || 'Unknown'}`);

                require('./modules/webhookReporter').send({
                    phase: 'Guild Left',
                    message: `Bot was removed from server: **${guild.name}**`,
                    context: { guildId: guild.id }
                }).catch(() => { });

                // Feedback DM Logic
                try {
                    const ownerId = guild.ownerId;
                    if (!ownerId) {
                        logger.warn(`Could not retrieve owner ID for guild ${guild.id} (${guild.name}). Skipping feedback DM.`);
                    } else {
                        const feedbackUrl = process.env.FEEDBACK_FORM_URL;
                        if (feedbackUrl) {
                            try {
                                const owner = await client.users.fetch(ownerId);
                                const dmMessage = `Hey! 👋\n\nI noticed LeetDiscord was removed from your server: **${guild.name}**.\n\nNo worries at all — but if you're willing, I’d really appreciate quick feedback so I can improve the bot.\n\nThis form takes less than 30 seconds:\n${feedbackUrl}\n\nThanks for giving the bot a try ❤️`;

                                await owner.send(dmMessage);
                                logger.info(`Successfully sent feedback DM to owner ${ownerId} of guild ${guild.id}`);
                            } catch (dmErr) {
                                logger.warn(`Failed to send feedback DM to owner ${ownerId} of guild ${guild.id} (DMs might be disabled): ${dmErr.message}`);
                            }
                        } else {
                            logger.warn('FEEDBACK_FORM_URL is not configured in environment variables. Skipping feedback DM.');
                        }
                    }
                } catch (feedbackErr) {
                    logger.error(`Error processing feedback DM for guild ${guild.id}:`, feedbackErr);
                }

                try {
                    const Guild = require('./modules/models/Guild');
                    await Guild.findOneAndUpdate(
                        { guildId: guild.id },
                        { $set: { isActive: false } }
                    );
                } catch (err) {
                    logger.error(`Error marking guild ${guild.id} as inactive:`, err);
                }
            });

            client.on('error', error => {
                logger.error('Discord Client Error:', error);
            });

            logger.info('Logging in to Discord...');
            client.login(config.token)
                .then(() => {
                    logger.info('Discord login() promise resolved');
                    setTimeout(() => {
                        logger.info(`[DEBUG] Client ready state after 30s: ${client.isReady()}`);
                        if (client.ws) {
                            logger.info(`[DEBUG] WebSocket status: ${client.ws.status}`);
                            logger.info(`[DEBUG] WebSocket ping: ${client.ws.ping}`);
                        }
                    }, 30000);
                })
                .catch(err => logger.error('Discord login() promise rejected:', err));

            logger.info('Discord login attempt initiated (non-blocking)');

            const https = require('https');

            // Check if Discord REST API is reachable at all
            https.get('https://discord.com/api/v10/gateway', (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => logger.info(`[DEBUG] Discord REST reachable, status: ${res.statusCode}, body: ${data}`));
            }).on('error', (e) => {
                logger.error(`[DEBUG] Discord REST unreachable: ${e.message} (code: ${e.code})`);
            });

            // Check raw TCP connectivity to the gateway host
            const net = require('net');
            const socket = net.createConnection({ host: 'gateway.discord.gg', port: 443 }, () => {
                logger.info('[DEBUG] TCP connection to gateway.discord.gg:443 succeeded');
                socket.destroy();
            });
            socket.on('error', (e) => {
                logger.error(`[DEBUG] TCP connection to gateway.discord.gg:443 failed: ${e.message}`);
            });
            socket.setTimeout(10000, () => {
                logger.error('[DEBUG] TCP connection to gateway.discord.gg:443 timed out');
                socket.destroy();
            });
        }

        // Start Telegram Bot
        logger.info('Moving to Telegram bot initialization...');
        await startTelegramBot();
        logger.info('Telegram bot initialization flow complete');

        // Setup graceful shutdown handlers
        setupGracefulShutdown(client, server);
    } catch (error) {
        logger.error('CRITICAL: Failed to start the service:', error);
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
    process.on('uncaughtException', async (error) => {
        logger.error('Uncaught Exception:', error);
        // Also report directly to webhook in case logger transport fails
        await webhookReporter.send({
            phase: 'Process: uncaughtException',
            message: error?.message || String(error),
            error: error instanceof Error ? error : null,
            context: { pid: process.pid, nodeVersion: process.version },
        });
        shutdown('uncaughtException');
    });

    process.on('unhandledRejection', async (reason, promise) => {
        const msg = reason instanceof Error ? reason.message : String(reason);
        logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
        // Also report directly to webhook in case logger transport fails
        await webhookReporter.send({
            phase: 'Process: unhandledRejection',
            message: msg,
            error: reason instanceof Error ? reason : null,
            context: { pid: process.pid, nodeVersion: process.version },
        });
        shutdown('unhandledRejection');
    });
}

main();
