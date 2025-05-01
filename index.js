// Refactor the code into modules

// Import necessary modules
const { Client, GatewayIntentBits } = require('discord.js');
const cron = require('node-cron');
const { token, channelId } = require('./config.json');
const { registerCommands } = require('./modules/commandRegistration');
const { runCheck } = require('./modules/scheduledTasks');
const { handleInteraction } = require('./modules/interactionHandler');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('interactionCreate', handleInteraction);

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}`);
    await registerCommands(client.user.id);

    // Schedule tasks
    cron.schedule('0 10 * * *', () => runCheck(client, channelId), { timezone: 'Asia/Kolkata' });
    cron.schedule('0 18 * * *', () => runCheck(client, channelId), { timezone: 'Asia/Kolkata' });
    cron.schedule('30 23 * * *', () => runCheck(client, channelId), { timezone: 'Asia/Kolkata' });
});

client.login(token);
