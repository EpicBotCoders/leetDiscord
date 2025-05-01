const cron = require('node-cron');
const { enhancedCheck } = require('./apiUtils');
const { cronJobs, channelId, users } = require('../config.json');

// The scheduled task
async function runCheck(client) {
    try {
        const checkResult = await enhancedCheck(users, client, channelId);
        const channel = await client.channels.fetch(channelId);
        channel.send(checkResult);
    } catch (err) {
        console.error('Error during daily check', err);
    }
}

// Dynamically schedule tasks based on config
function scheduleTasks(client) {
    cronJobs.forEach(job => {
        cron.schedule(job.schedule, async () => {
            try {
                console.log(`[Cron] Running task: ${job.task}`);
                if (job.task === 'runCheck') {
                    await runCheck(client);
                } else {
                    console.warn(`[Cron] Task not recognized: ${job.task}`);
                }
            } catch (error) {
                console.error(`[Cron] Error during task ${job.task}:`, error);
            }
        }, { timezone: 'Asia/Kolkata' });
    });
}

module.exports = { runCheck, scheduleTasks };