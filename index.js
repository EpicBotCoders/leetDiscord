const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const axios = require('axios');
const { token, channelId, users } = require('./config.json');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Fetch today’s daily challenge slug
async function getDailySlug() {
    const res = await axios.get('https://leetcode-api-pied.vercel.app/daily');
    return res.data.question.titleSlug;
}

// Fetch recent submissions for a user (limit 20)
async function getUserSubmissions(username) {
    const res = await axios.get(`https://leetcode-api-pied.vercel.app/user/${username}/submissions?limit=20`);
    return res.data; // array of { titleSlug, statusDisplay, ... }
}

// Check whether user solved today’s slug
async function checkUser(username, slug) {
    const subs = await getUserSubmissions(username);
    return subs.some(s => s.titleSlug === slug && s.statusDisplay === 'Accepted');
}

// The scheduled task
async function runCheck() {
    try {
        const slug = await getDailySlug();                                     // daily slug :contentReference[oaicite:1]{index=1}
        const channel = await client.channels.fetch(channelId);
        const results = await Promise.all(users.map(u => checkUser(u, slug)));
        const lines = users.map((u, i) => `**${u}**: ${results[i] ? '✅ done' : '❌ not done'}`);
        channel.send(`Daily challenge **${slug}** status:\n` + lines.join('\n'));
    } catch (err) {
        console.error('Error during daily check', err);
    }
}

client.on('messageCreate', async message => {
    if (message.content.toLowerCase() === '!check') {
        await message.reply('Running daily challenge check...');
        await runCheck();
    }
});

client.once('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);

    // Schedule for 10:00 AM IST
    cron.schedule('0 10 * * *', runCheck, { timezone: 'Asia/Kolkata' });       // 10:00 IST 

    // Schedule for 6:00 PM IST
    cron.schedule('0 18 * * *', runCheck, { timezone: 'Asia/Kolkata' });       // 18:00 IST 

    // Schedule for 11:30 PM IST
    cron.schedule('30 23 * * *', runCheck, { timezone: 'Asia/Kolkata' });      // 23:30 IST 
});

client.login(token);
