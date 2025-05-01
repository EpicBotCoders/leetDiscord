const fs = require('fs').promises;
const path = require('path');
const CONFIG_PATH = path.join(__dirname, '../config.json');

async function loadConfig() {
    const configData = await fs.readFile(CONFIG_PATH, 'utf8');
    return JSON.parse(configData);
}

async function updateConfig(newConfig) {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 4));
}

async function initializeGuildConfig(guildId, channelId) {
    const config = await loadConfig();
    if (!config.guilds[guildId]) {
        config.guilds[guildId] = {
            channelId,
            users: {},
            cronJobs: [
                { schedule: "0 10 * * *", task: "runCheck" },
                { schedule: "0 18 * * *", task: "runCheck" }
            ]
        };
        await updateConfig(config);
    }
    return config.guilds[guildId];
}

async function addUser(guildId, username, discordId = null) {
    const config = await loadConfig();
    if (!config.guilds[guildId]) {
        throw new Error('Guild not configured');
    }

    if (config.guilds[guildId].users[username]) {
        return `${username} is already being tracked in this server.`;
    }

    config.guilds[guildId].users[username] = discordId;
    await updateConfig(config);
    return `Added ${username} to tracking list for this server.`;
}

async function removeUser(guildId, username) {
    const config = await loadConfig();
    if (!config.guilds[guildId]?.users[username]) {
        return `${username} is not in the tracking list for this server.`;
    }

    delete config.guilds[guildId].users[username];
    await updateConfig(config);
    return `Removed ${username} from tracking list for this server.`;
}

async function getGuildUsers(guildId) {
    const config = await loadConfig();
    return config.guilds[guildId]?.users || {};
}

async function getGuildConfig(guildId) {
    const config = await loadConfig();
    return config.guilds[guildId];
}

async function updateGuildChannel(guildId, channelId) {
    const config = await loadConfig();
    if (!config.guilds[guildId]) {
        throw new Error('Guild not configured');
    }
    
    config.guilds[guildId].channelId = channelId;
    await updateConfig(config);
    return `Updated announcement channel for this server.`;
}

async function addCronJob(guildId, hours, minutes) {
    const config = await loadConfig();
    if (!config.guilds[guildId]) {
        throw new Error('Guild not configured');
    }

    const schedule = `${minutes} ${hours} * * *`;
    const existingJob = config.guilds[guildId].cronJobs.find(
        job => job.schedule === schedule && job.task === 'runCheck'
    );

    if (existingJob) {
        return `A check is already scheduled for ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    config.guilds[guildId].cronJobs.push({
        schedule,
        task: 'runCheck'
    });

    await updateConfig(config);
    return `Added new check time at ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

async function removeCronJob(guildId, hours, minutes) {
    const config = await loadConfig();
    if (!config.guilds[guildId]) {
        throw new Error('Guild not configured');
    }

    const schedule = `${minutes} ${hours} * * *`;
    const initialLength = config.guilds[guildId].cronJobs.length;
    
    config.guilds[guildId].cronJobs = config.guilds[guildId].cronJobs.filter(
        job => !(job.schedule === schedule && job.task === 'runCheck')
    );

    if (config.guilds[guildId].cronJobs.length === initialLength) {
        return `No check scheduled for ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    }

    await updateConfig(config);
    return `Removed check time at ${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
}

async function listCronJobs(guildId) {
    const config = await loadConfig();
    if (!config.guilds[guildId]) {
        throw new Error('Guild not configured');
    }

    return config.guilds[guildId].cronJobs
        .filter(job => job.task === 'runCheck')
        .map(job => {
            const [minutes, hours] = job.schedule.split(' ');
            return `${hours.padStart(2, '0')}:${minutes.padStart(2, '0')}`;
        })
        .sort();
}

module.exports = { 
    loadConfig,
    updateConfig, 
    initializeGuildConfig,
    addUser, 
    removeUser,
    getGuildUsers,
    getGuildConfig,
    updateGuildChannel,
    addCronJob,
    removeCronJob,
    listCronJobs
};