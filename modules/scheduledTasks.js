const { enhancedCheck } = require('./apiUtils');

// The scheduled task
async function runCheck(client, channelId, users) {
    try {
        const checkResult = await enhancedCheck(users, client, channelId);
        const channel = await client.channels.fetch(channelId);
        channel.send(checkResult);
    } catch (err) {
        console.error('Error during daily check', err);
    }
}

module.exports = { runCheck };