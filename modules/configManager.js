const fs = require('fs').promises;
const CONFIG_PATH = '../config.json';

// Update the configuration file
async function updateConfig(newConfig) {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 4));
}

// Add a user to the tracking list
async function addUser(username) {
    const config = require(CONFIG_PATH);
    if (config.users.includes(username)) {
        return `${username} is already being tracked.`;
    }
    config.users.push(username);
    await updateConfig(config);
    return `Added ${username} to tracking list.`;
}

// Remove a user from the tracking list
async function removeUser(username) {
    const config = require(CONFIG_PATH);
    const index = config.users.indexOf(username);
    if (index === -1) {
        return `${username} is not in the tracking list.`;
    }
    config.users.splice(index, 1);
    await updateConfig(config);
    return `Removed ${username} from tracking list.`;
}

module.exports = { updateConfig, addUser, removeUser };