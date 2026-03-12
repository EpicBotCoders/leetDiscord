const { ButtonBuilder, ButtonStyle, ActionRowBuilder } = require('discord.js');
const logger = require('../core/logger');
const { getDailySlug, getBestDailySubmission, getUpcomingContests } = require('../services/apiUtils');
const { formatLeetCodeContestEmbed } = require('../utils/embeds');
const { setTelegramToken, toggleTelegramUpdates, getTelegramUser, getGuildUsers } = require('../core/configManager');
const { commandDefinitions } = require('../core/commandRegistration');
const axios = require('axios');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');

/**
 * Returns an emoji corresponding to a command category.
 *
 * @param {string} category - Command category name.
 * @returns {string} Emoji representing the category.
 */
function getCategoryEmoji(category) {
    const map = {
        'Setup': '⚙️',
        'Info': 'ℹ️',
        'Information': 'ℹ️',
        'Monitoring': '📊',
        'User Management': '👥',
        'Scheduling': '⏰',
        'Notifications': '🔔',
        'Admin': '🛡️'
    };
    return map[category] || '📌';
}

/**
 * Handles the `/invite` command.
 * Sends a message containing a button that allows users to invite the bot
 * to another Discord server.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction object.
 * @returns {Promise<void>}
 */
async function handleInvite(interaction) {
    const inviteUrl = `https://discord.com/api/oauth2/authorize?client_id=${interaction.client.user.id}&permissions=19456&scope=bot%20applications.commands`;

    const button = new ButtonBuilder()
        .setLabel('Add Bot to Server')
        .setURL(inviteUrl)
        .setStyle(ButtonStyle.Link);

    const row = new ActionRowBuilder().addComponents(button);

    await safeReply(interaction, {
        content: 'Click the button below to invite me to your server!',
        components: [row]
    });
}

/**
 * Handles the `/botinfo` command.
 * Sends a message containing information about the bot, including its version,
 * library, and an invitation link.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction object.
 * @returns {Promise<void>}
 */
async function handleBotInfo(interaction) {
    const clientId = interaction.client.user.id;
    const permissions = 19456;
    const inviteLink = `https://discord.com/api/oauth2/authorize?client_id=${clientId}&permissions=${permissions}&scope=bot%20applications.commands`;

    const embed = {
        color: 0x00d9ff,
        title: '🤖 LeetDiscord Bot Info',
        description: 'Your companion for LeetCode tracking on Discord.',
        fields: [
            { name: 'Version', value: '1.0.0', inline: true },
            { name: 'Library', value: 'Discord.js', inline: true },
            { name: 'Invitations', value: `[Invite the bot](${inviteLink})`, inline: false }
        ],
        footer: { text: 'LeetDiscord Bot' },
        timestamp: new Date()
    };

    await safeReply(interaction, { embeds: [embed] });
}

/**
 * Handles the `/status` command.
 * Sends a message containing information about the bot's status, including
 * its uptime, memory usage, and the number of guilds it is connected to.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction object.
 * @returns {Promise<void>}
 */
async function handleStatus(interaction) {
    const memoryUsage = process.memoryUsage();
    const uptime = process.uptime();

    const embed = {
        color: 0x00ff00,
        title: '📈 Bot Status',
        fields: [
            { name: 'Uptime', value: `${Math.floor(uptime / 3600)}h ${Math.floor((uptime % 3600) / 60)}m`, inline: true },
            { name: 'Memory Usage', value: `${(memoryUsage.rss / 1024 / 1024).toFixed(2)} MB`, inline: true },
            { name: 'Guilds', value: `${interaction.client.guilds.cache.size}`, inline: true }
        ],
        timestamp: new Date()
    };

    await safeReply(interaction, { embeds: [embed] });
}

/**
 * Handles the `/contest` command.
 * Sends a message containing information about upcoming LeetCode contests.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction object.
 * @returns {Promise<void>}
 */
async function handleContest(interaction) {
    await safeDeferReply(interaction);
    try {
        const upcomingContests = await getUpcomingContests();
        if (!upcomingContests || upcomingContests.length === 0) {
            await safeReply(interaction, 'No upcoming contests found.');
            return;
        }

        const embeds = upcomingContests.map((contest, i) => formatLeetCodeContestEmbed(contest, i, upcomingContests.length));
        await safeReply(interaction, { embeds });
    } catch (error) {
        logger.error('Error in handleContest:', error);
        await safeReply(interaction, 'Failed to fetch upcoming contests.');
    }
}

/**
 * Handles the `/daily` command.
 * Sends a message containing information about today's LeetCode daily challenge.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction object.
 * @param {Function} getGuildUsers - Function to retrieve guild users.
 * @returns {Promise<void>}
 */
async function handleDaily(interaction, getGuildUsers) {
    await safeDeferReply(interaction);

    try {
        const usernameOption = interaction.options.getString('username');
        const guildUsers = await getGuildUsers(interaction.guildId);
        let targetUsername = null;

        if (usernameOption) {
            if (guildUsers[usernameOption]) {
                targetUsername = usernameOption;
            } else {
                await safeReply(interaction, `❌ User **${usernameOption}** is not tracked in this server.`);
                return;
            }
        } else {
            const userEntry = Object.entries(guildUsers).find(([leetcode, discordId]) =>
                discordId === interaction.user.id
            );

            if (!userEntry) {
                await safeReply(interaction, '❌ You are not registered in this server. Use `/adduser` to start tracking your LeetCode progress!');
                return;
            }

            targetUsername = userEntry[0];
        }

        const dailySlug = await getDailySlug();
        if (!dailySlug) {
            await safeReply(interaction, '❌ Failed to fetch today\'s daily challenge. Please try again later.');
            return;
        }

        const problemDetails = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${dailySlug}`);
        const problem = problemDetails.data;

        const bestSubmission = await getBestDailySubmission(targetUsername, dailySlug);

        const discordId = guildUsers[targetUsername];
        let displayName = targetUsername;

        if (discordId && interaction.guild) {
            try {
                const member = await interaction.guild.members.fetch(discordId).catch(() => null);
                if (member) {
                    displayName = member.user.displayName || member.user.username;
                }
            } catch (error) {
                // Fallback
            }
        }

        if (!bestSubmission) {
            const embed = {
                color: 0xff6b6b,
                title: '❌ No Submission Found',
                description: `**${displayName}** has not completed today's daily challenge yet.`,
                fields: [
                    {
                        name: '📌 Today\'s Problem',
                        value: `**${problem.title}**\n[View Problem](https://leetcode.com/problems/${dailySlug}/)`
                    }
                ],
                timestamp: new Date()
            };

            await safeReply(interaction, { embeds: [embed] });
            return;
        }

        const submissionUrl = `https://leetcode.com${bestSubmission.url}`;
        const embed = {
            color: 0x00d9ff,
            title: '🧠 Daily Challenge Completed',
            description: `Submission details for **${displayName}**`,
            fields: [
                {
                    name: '📌 Problem',
                    value: `**${problem.title}**\n[View Problem](https://leetcode.com/problems/${dailySlug}/)`,
                    inline: false
                },
                {
                    name: '🔗 Submission',
                    value: `[View Submission](${submissionUrl})`,
                    inline: true
                },
                {
                    name: '💻 Language',
                    value: bestSubmission.langName,
                    inline: true
                },
                { name: '\u200b', value: '\u200b', inline: true },
                {
                    name: '⚡ Runtime',
                    value: bestSubmission.runtime || 'N/A',
                    inline: true
                },
                {
                    name: '🧠 Memory',
                    value: bestSubmission.memory || 'N/A',
                    inline: true
                },
                { name: '\u200b', value: '\u200b', inline: true }
            ],
            footer: { text: `Requested by ${interaction.user.username}` },
            timestamp: new Date()
        };

        if (bestSubmission.hasNotes && bestSubmission.notes) {
            embed.fields.push({
                name: '📝 Notes',
                value: bestSubmission.notes,
                inline: false
            });
        }

        await safeReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error in handleDaily:', error);
        await safeReply(interaction, '❌ An error occurred while fetching submission data. Please try again later.');
    }
}

/**
 * Handles the `/halloffame` command.
 * Sends a message containing a link to the LeetCode Hall of Fame for the server.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction object.
 * @returns {Promise<void>}
 */
async function handleHallOfFame(interaction) {
    const guildId = interaction.guildId;
    const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
    const hofUrl = `${baseUrl}/hall-of-fame/${guildId}`;

    const embed = {
        color: 0xf1c40f,
        title: '🏆 Hall of Fame',
        description: `Check out the LeetCode Hall of Fame for **${interaction.guild.name}**!`,
        fields: [
            { name: '🌐 View Online', value: `[Click here to visit the Hall of Fame](${hofUrl})` }
        ],
        timestamp: new Date()
    };

    await safeReply(interaction, { embeds: [embed] });
}

/**
 * Handles the `/telegram` command.
 * Sends a message containing a link to the LeetCode Hall of Fame for the server.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction object.
 * @returns {Promise<void>}
 */
async function handleTelegram(interaction, hasAdminAccess) {
    const subcommand = interaction.options.getSubcommand();
    await safeDeferReply(interaction, true);

    try {
        if (subcommand === 'connect') {
            const token = Math.random().toString(36).substring(2, 10);
            const username = await setTelegramToken(interaction.guildId, interaction.user.id, token);
            const botUser = process.env.TELEGRAM_BOT_USERNAME || 'leet_discord_bot';
            const connectUrl = `https://t.me/${botUser}?start=${token}`;

            const embed = {
                color: 0x0088cc,
                title: '📲 Connect to Telegram',
                description: `Hello! Link your Telegram account to receive LeetCode challenge notifications.`,
                fields: [
                    { name: 'Step 1', value: `[Click here to visit the Telegram Bot](${connectUrl})` },
                    { name: 'Step 2', value: 'Click the **START** button in Telegram.' },
                    { name: '⚠️ Expiry', value: 'This link will expire in 15 minutes.' }
                ],
                footer: { text: 'Telegram Integration' }
            };
            await safeReply(interaction, { embeds: [embed] });

        } else if (subcommand === 'toggle') {
            const result = await toggleTelegramUpdates(interaction.guildId, interaction.user.id);
            await safeReply(interaction, result.message);

        } else if (subcommand === 'status') {
            const users = await getGuildUsers(interaction.guildId);
            let lcUsername = null;
            for (const [u, d] of Object.entries(users)) {
                if (d === interaction.user.id) {
                    lcUsername = u;
                    break;
                }
            }

            if (!lcUsername) {
                await safeReply(interaction, '❌ You are not registered in this server. Use `/adduser` first.');
                return;
            }

            const tgUser = await getTelegramUser(interaction.guildId, lcUsername);
            if (!tgUser || !tgUser.telegramChatId) {
                await safeReply(interaction, '❌ Your account is not linked to Telegram. Use `/telegram connect` to link it.');
            } else {
                await safeReply(interaction, `✅ **Connected to Telegram**\nStatus: ${tgUser.isEnabled ? 'Active (Notifications enabled)' : 'Paused (Notifications disabled)'}`);
            }
        }
    } catch (error) {
        logger.error('Error in handleTelegram:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

/**
 * Handles the `/help` command.
 * Sends a message containing a list of available commands organized by category.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction - Discord interaction object.
 * @returns {Promise<void>}
 */
async function handleHelp(interaction) {
    const categories = {};

    // Group commands by category based on definitions
    commandDefinitions.forEach(cmd => {
        if (cmd.hidden) return;
        if (!categories[cmd.category]) {
            categories[cmd.category] = [];
        }
        categories[cmd.category].push(cmd.data);
    });

    const fields = Object.entries(categories).map(([category, commands]) => {
        const commandList = commands.map(cmd => {
            let desc = `**\`/${cmd.name}\`**\n└ ${cmd.description}`;

            // Add subcommand info if available
            if (cmd.options && cmd.options.length > 0) {
                const subcommands = cmd.options.filter(opt => opt.constructor.name === 'SlashCommandSubcommandBuilder');
                if (subcommands.length > 0) {
                    const subNames = subcommands.map(s => s.name).join(', ');
                    desc += `\n└ Subcommands: ${subNames}`;
                }
            }
            return desc;
        }).join('\n\n');

        return {
            name: `${getCategoryEmoji(category)} ${category}`,
            value: commandList,
            inline: false
        };
    });

    const helpEmbed = {
        color: 0x5865F2,
        title: '📖 LeetCode Discord Bot - Command Help',
        description: `Here are all available commands organized by category.\n\n[Need help? Join our Support Server](${process.env.DISCORD_SERVER_INVITE_LINK || 'https://discord.gg/4t5zg5SV69'})`,
        fields: fields,
        footer: {
            text: 'LeetCode Discord Bot • GitHub: mochiron-desu/leetDiscord'
        },
        timestamp: new Date()
    };

    await interaction.reply({ embeds: [helpEmbed] });
}

module.exports = {
    handleInvite,
    handleBotInfo,
    handleStatus,
    handleContest,
    handleDaily,
    handleHallOfFame,
    handleTelegram,
    handleHelp
};
