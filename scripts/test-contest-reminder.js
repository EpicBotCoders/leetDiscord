/**
 * test-contest-reminder.js
 *
 * Fires the contest-reminder broadcast immediately (no cron wait) so you can
 * verify the embed layout and channel permissions without waiting for Friday.
 *
 * Usage:
 *   node scripts/test-contest-reminder.js
 *
 * The script will:
 *  1. Connect to MongoDB
 *  2. Log the Discord bot in
 *  3. Fetch upcoming LeetCode contests and send embeds to every guild that
 *     has contestReminderEnabled=true
 *  4. Gracefully disconnect and exit
 *
 * Tip: temporarily set contestReminderEnabled=true on your test guild in the
 * DB  (or run /togglecontestreminder in Discord) before running this script.
 */

'use strict';

require('dotenv').config();

const { Client, GatewayIntentBits, PermissionsBitField } = require('discord.js');
const { connectDB } = require('../modules/models/db');
const Guild = require('../modules/models/Guild');
const { getLeetCodeContests } = require('../modules/apiUtils');
const { formatLeetCodeContestEmbed } = require('../modules/interactionHandler');
const logger = require('../modules/logger');

async function runBroadcast(client) {
    logger.info('[test] Fetching upcoming LeetCode contests…');
    const data = await getLeetCodeContests();

    if (!data || !data.topTwoContests || data.topTwoContests.length === 0) {
        logger.warn('[test] API returned no contests. Nothing to send.');
        return;
    }

    const now = Math.floor(Date.now() / 1000);
    const upcomingContests = data.topTwoContests
        .filter(c => c.startTime > now)
        .sort((a, b) => a.startTime - b.startTime);

    if (upcomingContests.length === 0) {
        logger.warn('[test] No future contests in the API response. Nothing to send.');
        logger.info('[test] Raw contests from API:');
        data.topTwoContests.forEach(c =>
            logger.info(`  - ${c.title} | startTime=${c.startTime} | now=${now}`)
        );
        return;
    }

    logger.info(`[test] Found ${upcomingContests.length} upcoming contest(s):`);
    upcomingContests.forEach((c, i) =>
        logger.info(`  [${i + 1}] ${c.title} — starts <t:${c.startTime}:R>`)
    );

    const embeds = upcomingContests.map((contest, i) =>
        formatLeetCodeContestEmbed(contest, i, upcomingContests.length)
    );

    // Find guilds with contest reminders enabled
    const guilds = await Guild.find({ contestReminderEnabled: true });

    if (guilds.length === 0) {
        logger.warn('[test] No guilds have contestReminderEnabled=true.');
        logger.warn('[test] Run /togglecontestreminder in your server, then re-run this script.');
        logger.info('[test] Embed preview (would have been sent):');
        embeds.forEach((e, i) => logger.info(`  Embed ${i + 1}: ${JSON.stringify(e, null, 2)}`));
        return;
    }

    logger.info(`[test] Sending to ${guilds.length} opted-in guild(s)…`);

    for (const guild of guilds) {
        try {
            const channel = await client.channels.fetch(guild.channelId).catch(() => null);
            if (!channel) {
                logger.warn(`[test] Channel ${guild.channelId} not found for guild ${guild.guildId}`);
                continue;
            }

            const botMember = await channel.guild.members.fetchMe();
            const permissions = channel.permissionsFor(botMember);
            if (!permissions?.has(PermissionsBitField.Flags.SendMessages)) {
                logger.warn(`[test] No SendMessages permission in channel ${channel.id} (guild ${guild.guildId})`);
                continue;
            }

            await channel.send({ embeds });
            logger.info(`[test] ✅  Sent ${embeds.length} embed(s) to guild ${guild.guildId} (#${channel.name})`);
        } catch (err) {
            logger.error(`[test] ❌  Failed for guild ${guild.guildId}:`, err);
        }
    }
}

async function main() {
    // 1. DB
    await connectDB();
    logger.info('[test] MongoDB connected');

    // 2. Discord login (minimal intents — we only need to send messages)
    const client = new Client({
        intents: [
            GatewayIntentBits.Guilds,
            GatewayIntentBits.GuildMessages
        ]
    });

    await new Promise((resolve, reject) => {
        client.once('ready', resolve);
        client.once('error', reject);
        client.login(process.env.DISCORD_TOKEN);
    });
    logger.info(`[test] Logged in as ${client.user.tag}`);

    // 3. Run the broadcast
    try {
        await runBroadcast(client);
    } finally {
        // 4. Clean up
        logger.info('[test] Done. Destroying client…');
        await client.destroy();
        process.exit(0);
    }
}

main().catch(err => {
    logger.error('[test] Fatal error:', err);
    process.exit(1);
});
