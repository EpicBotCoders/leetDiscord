const logger = require('../core/logger');
const { getGuildUsers, listCronJobs } = require('../core/configManager');
const { listChecks } = require('../services/healthchecksApiUtils');

/**
 * Cache storing LeetCode usernames per guild.
 * @type {Map<string, string[]>}
 */
const usernameCache = new Map(); // Map<guildId, string[]>

/**
 * Cache storing cron job schedule strings per guild.
 * @type {Map<string, string[]>}
 */
const cronJobsCache = new Map(); // Map<guildId, string[]>

/**
 * Retrieves cached usernames for a guild. If not cached,
 * fetches from the database and stores them in memory.
 *
 * @param {string} guildId - Discord guild ID.
 * @returns {Promise<string[]>} Array of LeetCode usernames.
 */
async function getCachedUsernames(guildId) {
    if (!usernameCache.has(guildId)) {
        logger.info(`No cached usernames for guild ${guildId}, fetching from DB`);
        const users = await getGuildUsers(guildId);
        const usernames = Object.keys(users);
        usernameCache.set(guildId, usernames);
    }
    return usernameCache.get(guildId);
}

/**
 * Retrieves cached cron jobs for a guild. If not cached,
 * fetches them from the database and stores them in memory.
 *
 * @param {string} guildId - Discord guild ID.
 * @returns {Promise<string[]>} Array of cron schedule strings.
 */
async function getCachedCronJobs(guildId) {
    if (!cronJobsCache.has(guildId)) {
        const cronJobs = await listCronJobs(guildId);
        cronJobsCache.set(guildId, cronJobs);
    }
    return cronJobsCache.get(guildId);
}

/**
 * Clears the cached usernames for a guild.
 * Should be called when users are added or removed.
 *
 * @param {string} guildId - Discord guild ID.
 */
function invalidateUsernameCache(guildId) {
    usernameCache.delete(guildId);
}

/**
 * Clears the cached cron jobs for a guild.
 * Should be called when cron schedules change.
 *
 * @param {string} guildId - Discord guild ID.
 */
function invalidateCronJobsCache(guildId) {
    cronJobsCache.delete(guildId);
}

/**
 * Main handler for Discord slash command autocomplete interactions.
 * Routes the autocomplete request to the appropriate handler
 * based on the command name.
 *
 * @param {import('discord.js').AutocompleteInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleAutocomplete(interaction) {
    const { commandName, guildId } = interaction;

    if (!guildId) {
        await interaction.respond([]);
        return;
    }

    try {
        switch (commandName) {
            case 'removeuser':
            case 'daily':
            case 'profile':
                await handleUsernameAutocomplete(interaction);
                break;
            case 'managecron':
                await handleCronAutocomplete(interaction);
                break;
            case 'hc':
                await handleHealthchecksAutocomplete(interaction);
                break;
            default:
                await interaction.respond([]);
        }
    } catch (error) {
        logger.error(`Error handling autocomplete for ${commandName}:`, error);
        await interaction.respond([]);
    }
}

/**
 * Handles username autocomplete for commands that require
 * selecting a tracked LeetCode user.
 *
 * @param {import('discord.js').AutocompleteInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleUsernameAutocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    try {
        const guildUsers = await getGuildUsers(interaction.guildId);
        const usernames = Object.keys(guildUsers);

        const options = await Promise.all(usernames.map(async (leetcodeUsername) => {
            const discordId = guildUsers[leetcodeUsername];
            let displayName = leetcodeUsername;

            if (discordId && interaction.guild) {
                try {
                    const member = await interaction.guild.members.fetch(discordId).catch(() => null);
                    if (member) {
                        displayName = member.user.displayName || member.user.username;
                    }
                } catch (error) {
                    // Fallback to LeetCode username
                }
            }

            return { leetcodeUsername, displayName };
        }));

        const filtered = options
            .filter(opt =>
                opt.displayName.toLowerCase().includes(focusedValue) ||
                opt.leetcodeUsername.toLowerCase().includes(focusedValue)
            )
            .slice(0, 25)
            .map(opt => ({
                name: opt.displayName,
                value: opt.leetcodeUsername
            }));

        await interaction.respond(filtered);
    } catch (error) {
        logger.error('Error fetching usernames for autocomplete:', error);
        await interaction.respond([]);
    }
}

/**
 * Handles autocomplete for cron schedule removal
 * within the `/managecron remove` subcommand.
 *
 * Converts stored cron strings into readable time values.
 *
 * @param {import('discord.js').AutocompleteInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleCronAutocomplete(interaction) {
    const subcommand = interaction.options.getSubcommand();
    if (subcommand !== 'remove') {
        await interaction.respond([]);
        return;
    }

    const focusedValue = interaction.options.getFocused();

    try {
        const cronJobs = await getCachedCronJobs(interaction.guildId);

        if (cronJobs.length === 0) {
            await interaction.respond([]);
            return;
        }

        const times = cronJobs
            .map(job => {
                const parts = job.split(' ');
                if (!parts[0] || !parts[1]) return null;

                const display = `${parts[1].padStart(2, '0')}:${parts[0].padStart(2, '0')} UTC`;
                return {
                    name: display,
                    value: `${parts[1]}:${parts[0]}`
                };
            })
            .filter(time => time !== null);

        const filtered = times
            .filter(time => time.name.toLowerCase().includes(focusedValue.toLowerCase()))
            .slice(0, 25);

        await interaction.respond(filtered);
    } catch (error) {
        logger.error('Error fetching cron times for autocomplete:', error);
        await interaction.respond([]);
    }
}

/**
 * Handles autocomplete for Healthchecks.io checks.
 * Allows searching by check name or slug.
 *
 * @param {import('discord.js').AutocompleteInteraction} interaction
 * @returns {Promise<void>}
 */
async function handleHealthchecksAutocomplete(interaction) {
    const focusedValue = interaction.options.getFocused().toLowerCase();

    try {
        const checks = await listChecks();

        const filtered = checks
            .filter(check =>
                check.name.toLowerCase().includes(focusedValue) ||
                check.slug.toLowerCase().includes(focusedValue)
            )
            .slice(0, 25)
            .map(check => ({
                name: `${check.statusEmoji} ${check.name}`,
                value: check.name
            }));

        await interaction.respond(filtered);
    } catch (error) {
        logger.error('Error fetching healthchecks for autocomplete:', error);
        await interaction.respond([]);
    }
}

module.exports = {
    handleAutocomplete,
    invalidateUsernameCache,
    invalidateCronJobsCache,
    usernameCache,
    cronJobsCache
};