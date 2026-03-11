const logger = require('../core/logger');
const {
    listChecks,
    formatTimeAgo,
    formatTimeUntil,
    findCheckByName,
    getCheckDetails,
    formatTime,
    getCheckPings,
    getCheckFlips
} = require('../services/healthchecksApiUtils');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');

const BOT_OWNER_ID = process.env.BOT_OWNER_ID;

/**
 * Checks whether a given user ID belongs to the bot owner.
 *
 * @param {string} userId - Discord user ID.
 * @returns {Promise<boolean>} True if the user is the bot owner.
 */
async function isOwnerOnly(userId) {
    return userId === BOT_OWNER_ID;
}

/**
 * Main handler for the `/hc` (Healthchecks.io) command.
 * Routes execution to the appropriate subcommand handler.
 *
 * This command is restricted to the bot owner.
 *
 * Subcommands supported:
 * - overview
 * - info
 * - history
 * - flips
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleHealthchecks(interaction) {
    const isOwner = await isOwnerOnly(interaction.user.id);
    if (!isOwner) {
        const embed = {
            color: 0xff4444,
            description: '❌ This command is only available to the bot owner.',
            footer: { text: 'Healthchecks.io Monitoring' }
        };
        await safeReply(interaction, { embeds: [embed], flags: 64 });
        return;
    }

    const subcommand = interaction.options.getSubcommand();
    switch (subcommand) {
        case 'overview':
            await handleHealthchecksOverview(interaction);
            break;
        case 'info':
            await handleHealthchecksInfo(interaction);
            break;
        case 'history':
            await handleHealthchecksHistory(interaction);
            break;
        case 'flips':
            await handleHealthchecksFlips(interaction);
            break;
        default:
            await safeReply(interaction, 'Unknown subcommand');
    }
}

/**
 * Displays an overview of all Healthchecks.io checks,
 * including status, last ping, and next expected ping.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleHealthchecksOverview(interaction) {
    await safeDeferReply(interaction);
    try {
        const checks = await listChecks();
        if (checks.length === 0) {
            await safeReply(interaction, 'No checks found. Configure Healthchecks.io first.');
            return;
        }

        const lines = ['```\nName                | Status  | Last Ping     | Next Ping'];
        lines.push('─'.repeat(75));

        for (const check of checks) {
            const lastPing = formatTimeAgo(check.lastPing);
            const nextPing = check.nextPing ? formatTimeUntil(check.nextPing) : 'N/A';
            const name = check.name.substring(0, 18).padEnd(18);
            const status = `${check.statusEmoji} ${check.status}`.padEnd(8);
            const lastPingStr = lastPing.padEnd(13);
            lines.push(`${name} | ${status} | ${lastPingStr} | ${nextPing}`);
        }
        lines.push('```');

        const embed = {
            title: '📊 Healthchecks.io Overview',
            description: lines.join('\n'),
            color: 0x00ff00,
            fields: [
                { name: 'Total Checks', value: `${checks.length}`, inline: true },
                { name: 'Up', value: `${checks.filter(c => c.status === 'up').length}`, inline: true },
                { name: 'Down', value: `${checks.filter(c => c.status === 'down').length}`, inline: true }
            ],
            timestamp: new Date()
        };

        await safeReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error in handleHealthchecksOverview:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

/**
 * Displays detailed information for a specific Healthchecks.io check.
 *
 * Information includes status, last ping, timeout, grace period,
 * total pings, tags, and description.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleHealthchecksInfo(interaction) {
    await safeDeferReply(interaction);
    try {
        const checkName = interaction.options.getString('check');
        const checkInfo = await findCheckByName(checkName);
        const details = await getCheckDetails(checkInfo.uuid);

        const embed = {
            title: `📋 ${details.name}`,
            color: details.status === 'up' ? 0x00ff00 : (details.status === 'down' ? 0xff4444 : 0xffaa00),
            fields: [
                { name: 'Status', value: `${checkInfo.statusEmoji} ${checkInfo.status.toUpperCase()}`, inline: true },
                { name: 'Slug', value: details.slug, inline: true },
                { name: 'Last Ping', value: details.last_ping ? formatTime(details.last_ping) : 'Never', inline: false },
                { name: 'Next Expected', value: details.next_ping ? formatTime(details.next_ping) : 'N/A', inline: false },
                { name: 'Timeout', value: `${details.timeout}s`, inline: true },
                { name: 'Grace Period', value: `${details.grace}s`, inline: true },
                { name: 'Total Pings', value: `${details.n_pings}`, inline: true },
                { name: 'Tags', value: details.tags || 'None', inline: false }
            ],
            timestamp: new Date()
        };

        if (details.desc) {
            embed.fields.push({ name: 'Description', value: details.desc, inline: false });
        }

        await safeReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error in handleHealthchecksInfo:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

/**
 * Shows recent ping history for a Healthchecks.io check.
 *
 * Displays ping timestamps, status types (success/start/failure),
 * and execution durations where available.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleHealthchecksHistory(interaction) {
    await safeDeferReply(interaction);
    try {
        const checkName = interaction.options.getString('check');
        const limit = interaction.options.getInteger('limit') || 10;

        const checkInfo = await findCheckByName(checkName);
        const pings = await getCheckPings(checkInfo.uuid, limit);

        if (pings.length === 0) {
            await safeReply(interaction, `No pings found for **${checkInfo.name}**.`);
            return;
        }

        const lines = pings.map((ping, i) => {
            const typeEmoji = ping.type === 'success' ? '✅' : (ping.type === 'start' ? '🚀' : '❌');
            const date = formatTime(ping.date);
            const duration = ping.duration ? ` (${ping.duration.toFixed(2)}s)` : '';
            return `${i + 1}. ${typeEmoji} ${date}${duration}`;
        });

        const embed = {
            title: `📜 History - ${checkInfo.name}`,
            description: lines.join('\n'),
            color: 0x00aaff,
            footer: { text: `Showing last ${pings.length} pings` },
            timestamp: new Date()
        };

        await safeReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error in handleHealthchecksHistory:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

/**
 * Displays recent status changes (UP/DOWN flips) for a Healthchecks.io check.
 *
 * Useful for identifying instability or outages within a given time window.
 *
 * @param {import('discord.js').ChatInputCommandInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleHealthchecksFlips(interaction) {
    await safeDeferReply(interaction);
    try {
        const checkName = interaction.options.getString('check');
        const days = interaction.options.getInteger('days') || 7;

        const checkInfo = await findCheckByName(checkName);
        const seconds = days * 24 * 60 * 60;
        const flips = await getCheckFlips(checkInfo.uuid, seconds);

        if (flips.length === 0) {
            await safeReply(interaction, `No status changes found for **${checkInfo.name}** in the last ${days} days.`);
            return;
        }

        const lines = flips.map((flip, i) => {
            const status = flip.up ? '🟢 UP' : '🔴 DOWN';
            const date = formatTime(flip.timestamp);
            return `${i + 1}. ${date} → ${status}`;
        });

        const embed = {
            title: `🔄 Status Changes - ${checkInfo.name}`,
            description: lines.join('\n'),
            color: 0xffaa00,
            footer: { text: `Last ${days} days (${flips.length} status changes)` },
            timestamp: new Date()
        };

        await safeReply(interaction, { embeds: [embed] });
    } catch (error) {
        logger.error('Error in handleHealthchecksFlips:', error);
        await safeReply(interaction, `❌ Error: ${error.message}`);
    }
}

module.exports = {
    handleHealthchecks
};