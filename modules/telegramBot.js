const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');
const { linkTelegramChat, getConnectionByChatId } = require('./configManager');
const { getUserCalendar } = require('./apiUtils');
require('dotenv').config();

let bot = null;

async function startTelegramBot() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
        logger.warn('TELEGRAM_BOT_TOKEN not found in .env. Telegram features will be disabled.');
        return;
    }

    try {
        bot = new TelegramBot(token, { polling: true });

        bot.on('message', async (msg) => {
            const chatId = msg.chat.id;
            const text = msg.text;

            if (text && text.startsWith('/start')) {
                const args = text.split(' ');
                if (args.length > 1) {
                    const token = args[1];
                    try {
                        const result = await linkTelegramChat(token, chatId.toString());
                        bot.sendMessage(chatId, result.message);
                        logger.info(`Telegram link attempt: ${result.message}`);
                    } catch (error) {
                        logger.error('Error linking Telegram chat:', error);
                        bot.sendMessage(chatId, 'An error occurred while linking your account. Please try generating a new link from Discord.');
                    }
                } else {
                    bot.sendMessage(chatId, 'Welcome! To link your account, use the /telegram connect command in our Discord server.');
                }
            } else if (text === '/help') {
                bot.sendMessage(chatId, 'I am a notification bot for LeetCode Discord.\n\nCommands:\n/start <token> - Link your Discord account\n/status - Check connection status\n/info - Show server info\n/leetstatus - Show your LeetCode stats\n/help - Show this message');
            } else if (text === '/status') {
                const connection = await getConnectionByChatId(chatId);
                if (connection) {
                    let msg = `✅ **Connected Globally**\n\n👤 **LeetCode**: ${connection.username}\n`;

                    if (connection.connectedGuilds && connection.connectedGuilds.length > 0) {
                        msg += `\nTesting in **${connection.connectedGuilds.length}** Discord Server(s):\n`;
                        connection.connectedGuilds.forEach(g => {
                            msg += `- Server ID: \`${g.guildId}\`\n`;
                        });
                    } else {
                        msg += `\n⚠️ You are linked, but not currently tracked in any Discord servers. Ask an admin to \`/adduser ${connection.username}\`.`;
                    }

                    bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
                } else {
                    bot.sendMessage(chatId, '❌ Not connected. Use /telegram connect in Discord to link your account.');
                }
            } else if (text === '/info') {
                const connection = await getConnectionByChatId(chatId);
                if (connection) {
                    bot.sendMessage(chatId, `👤 Account Info\nUsername: ${connection.username}\n\nYour Telegram account is linked globally. You will receive notifications from any server where you are tracked.`);
                } else {
                    bot.sendMessage(chatId, '❌ Not connected.');
                }
            } else if (text === '/leetstatus') {
                const connection = await getConnectionByChatId(chatId);
                if (!connection) {
                    bot.sendMessage(chatId, '❌ Not connected. Use /telegram connect in Discord to link your account first.');
                    return;
                }

                try {
                    // Fetch user's calendar data
                    const calendarData = await getUserCalendar(connection.username);

                    if (!calendarData) {
                        bot.sendMessage(chatId, '❌ Could not fetch your LeetCode statistics. Please try again later.');
                        return;
                    }

                    const statsMessage = `📊 **LeetCode Stats for ${connection.username}**\n\n` +
                        `🔥 Current Streak: ${calendarData.streak || 0} days\n` +
                        `✅ Total Active Days: ${calendarData.totalActiveDays || 0}\n` +
                        `📅 Active Years: ${calendarData.activeYears?.join(', ') || 'N/A'}\n\n` +
                        'Keep up the great work! 💪';

                    bot.sendMessage(chatId, statsMessage, { parse_mode: 'Markdown' });
                } catch (error) {
                    logger.error(`Error fetching stats for ${connection.username}:`, error);
                    bot.sendMessage(chatId, '❌ An error occurred while fetching your statistics. Please try again later.');
                }
            }
        });

        bot.on('polling_error', (error) => {
            if (error.code === 'ETELEGRAM' && error.response && error.response.statusCode === 409) {
                logger.warn('Telegram polling conflict (409): Another instance is running. Stopping polling for this instance to prevent conflicts.');
                bot.stopPolling().catch(err => logger.error('Error stopping polling:', err));
            } else {
                logger.error('Telegram polling error:', error);
            }
        });

        logger.info('Telegram Bot started successfully');
    } catch (error) {
        logger.error('Failed to start Telegram Bot:', error);
    }
}

async function sendTelegramMessage(chatId, message) {
    if (!bot) {
        logger.warn('Cannot send Telegram message: Bot not initialized');
        return false;
    }

    try {
        await bot.sendMessage(chatId, message);
        return true;
    } catch (error) {
        logger.error(`Failed to send Telegram message to ${chatId}:`, error);
        return false;
    }
}

async function stopTelegramBot() {
    if (bot) {
        logger.info('Stopping Telegram Bot polling...');
        await bot.stopPolling();
        logger.info('Telegram Bot stopped');
        bot = null;
    }
}

module.exports = {
    startTelegramBot,
    stopTelegramBot,
    sendTelegramMessage
};
