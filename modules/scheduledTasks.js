const cron = require('node-cron');
const { enhancedCheck } = require('./apiUtils');
const { loadConfig, getGuildConfig } = require('./configManager');

// The scheduled task for a specific guild
async function runGuildCheck(client, guildId) {
    try {
        const guildConfig = await getGuildConfig(guildId);
        if (!guildConfig) {
            console.error(`[runGuildCheck] No configuration found for guild ${guildId}`);
            return;
        }

        const users = Object.keys(guildConfig.users);
        if (users.length === 0) {
            console.log(`[runGuildCheck] No users configured for guild ${guildId}`);
            return;
        }

        const checkResult = await enhancedCheck(users, client, guildConfig.channelId);
        
        // Add mentions for users with Discord IDs
        if (checkResult.embeds?.[0]) {
            const embed = checkResult.embeds[0];
            embed.fields = embed.fields.map(field => {
                const discordId = guildConfig.users[field.name];
                return {
                    ...field,
                    name: discordId ? `<@${discordId}> (${field.name})` : field.name
                };
            });
        }

        const channel = await client.channels.fetch(guildConfig.channelId);
        if (channel) {
            await channel.send(checkResult);
        } else {
            console.error(`[runGuildCheck] Could not find channel ${guildConfig.channelId} for guild ${guildId}`);
        }
    } catch (err) {
        console.error(`[runGuildCheck] Error during guild check for ${guildId}:`, err);
    }
}

// Schedule tasks for all configured guilds
async function scheduleTasks(client) {
    const config = await loadConfig();
    
    // Clear existing scheduled tasks if any
    Object.keys(config.guilds).forEach(guildId => {
        const guildConfig = config.guilds[guildId];
        guildConfig.cronJobs.forEach(job => {
            if (job.task === 'runCheck') {
                cron.schedule(job.schedule, async () => {
                    try {
                        console.log(`[Cron] Running check for guild ${guildId}`);
                        await runGuildCheck(client, guildId);
                    } catch (error) {
                        console.error(`[Cron] Error during guild ${guildId} check:`, error);
                    }
                }, { timezone: 'Asia/Kolkata' });
            } else {
                console.warn(`[Cron] Task not recognized: ${job.task}`);
            }
        });
    });
}

// Manual check for a specific guild
async function runCheck(client, guildId) {
    await runGuildCheck(client, guildId);
}

module.exports = { runCheck, scheduleTasks };