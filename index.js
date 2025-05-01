const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
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

// Command definition
const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Run a manual check of today\'s LeetCode challenge status')
        .toJSON()
];

// Register slash commands
async function registerCommands(clientId) {
    try {
        const rest = new REST({ version: '10' }).setToken(token);
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationCommands(clientId),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('Error registering commands:', error);
    }
}

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

// Replace the messageCreate event with interactionCreate
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    if (interaction.commandName === 'check') {
        await interaction.reply('Running daily challenge check...');
        await runCheck();
    }
});

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    
    // Register commands when bot starts
    await registerCommands(client.user.id);
    console.log('Bot application ID:', client.user.id); // This will help us verify the correct ID is being used

    // Schedule for 10:00 AM IST
    cron.schedule('0 10 * * *', runCheck, { timezone: 'Asia/Kolkata' });       // 10:00 IST 

    // Schedule for 6:00 PM IST
    cron.schedule('0 18 * * *', runCheck, { timezone: 'Asia/Kolkata' });       // 18:00 IST 

    // Schedule for 11:30 PM IST
    cron.schedule('30 23 * * *', runCheck, { timezone: 'Asia/Kolkata' });      // 23:30 IST 
});

client.login(token);
