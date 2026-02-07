const TelegramBot = require('node-telegram-bot-api');
const logger = require('./logger');
const { linkTelegramChat, getConnectionByChatId } = require('./configManager');
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
                    bot.sendMessage(chatId, `✅ Connected as: ${connection.username}\nServer ID: ${connection.guildId}`);
                } else {
                    bot.sendMessage(chatId, '❌ Not connected. Use /telegram connect in Discord to link your account.');
                }
            } else if (text === '/info') {
                const connection = await getConnectionByChatId(chatId);
                if (connection) {
                    bot.sendMessage(chatId, `🏢 Server Info\nServer ID: ${connection.guildId}\nChannel ID: ${connection.channelId}\nTracked Users: ${connection.totalUsers}`);
                } else {
                    bot.sendMessage(chatId, '❌ Not connected.');
                }
            } else if (text === '/leetstatus') {
                const connection = await getConnectionByChatId(chatId);
                if (connection && connection.userStats) {
                    const stats = connection.userStats;
                    const lastUpdated = stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString() : 'Never';
                    bot.sendMessage(chatId, `📊 LeetCode Stats for ${connection.username}\n\n🔥 Streak: ${stats.streak} days\n📅 Active Days: ${stats.totalActiveDays}\n🕐 Last Updated: ${lastUpdated}`);
                } else if (connection) {
                    bot.sendMessage(chatId, `📊 LeetCode Stats for ${connection.username}\n\nStats not yet available. Please wait for the next scheduled check.`);
                } else {
                    bot.sendMessage(chatId, '❌ Not connected.');
                }
            }
        });

        bot.on('polling_error', (error) => {
            logger.error('Telegram polling error:', error);
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

module.exports = {
    startTelegramBot,
    sendTelegramMessage
};
