const logger = require('../core/logger');
const { getGuildUsers, listCronJobs } = require('../core/configManager');

// Cache for autocomplete data - updated only when members or cron jobs are added/removed
const usernameCache = new Map(); // Map<guildId, string[]> - array of usernames
const cronJobsCache = new Map(); // Map<guildId, string[]> - array of cron schedule strings

// Helper function to get cached usernames, fetching from DB if not cached
async function getCachedUsernames(guildId) {
    if (!usernameCache.has(guildId)) {
        logger.info(`No cached usernames for guild ${guildId}, fetching from DB`);
        const users = await getGuildUsers(guildId);
        const usernames = Object.keys(users);
        usernameCache.set(guildId, usernames);
    }
    return usernameCache.get(guildId);
}

// Helper function to get cached cron jobs, fetching from DB if not cached
async function getCachedCronJobs(guildId) {
    if (!cronJobsCache.has(guildId)) {
        const cronJobs = await listCronJobs(guildId);
        cronJobsCache.set(guildId, cronJobs);
    }
    return cronJobsCache.get(guildId);
}

// Cache invalidation functions
function invalidateUsernameCache(guildId) {
    usernameCache.delete(guildId);
}

function invalidateCronJobsCache(guildId) {
    cronJobsCache.delete(guildId);
}

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
                // This might need healthchecksApiUtils
                const { handleHealthchecksAutocomplete } = require('../services/healthchecksApiUtils');
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
                    // Fallback
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

module.exports = {
    handleAutocomplete,
    invalidateUsernameCache,
    invalidateCronJobsCache,
    usernameCache,
    cronJobsCache
};
