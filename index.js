const { Client, GatewayIntentBits, REST, Routes, SlashCommandBuilder } = require('discord.js');
const cron = require('node-cron');
const axios = require('axios');
const fs = require('fs').promises;
const path = require('path');
const { token, channelId, users } = require('./config.json');

const ADMIN_USER_ID = '637911567920529409';
const CONFIG_PATH = path.join(__dirname, 'config.json');

const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

// Command definitions
const commands = [
    new SlashCommandBuilder()
        .setName('check')
        .setDescription('Run a manual check of today\'s LeetCode challenge status')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('adduser')
        .setDescription('Add a LeetCode username to track')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('The LeetCode username to add')
                .setRequired(true))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('removeuser')
        .setDescription('Remove a LeetCode username from tracking')
        .addStringOption(option =>
            option.setName('username')
                .setDescription('The LeetCode username to remove')
                .setRequired(true))
        .toJSON(),
    new SlashCommandBuilder()
        .setName('listusers')
        .setDescription('List all tracked LeetCode usernames')
        .toJSON(),
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
        const checkResult = await enhancedCheck();
        const channel = await client.channels.fetch(channelId);
        channel.send(checkResult);
    } catch (err) {
        console.error('Error during daily check', err);
    }
}

// Config management functions
async function updateConfig(newConfig) {
    await fs.writeFile(CONFIG_PATH, JSON.stringify(newConfig, null, 4));
}

async function addUser(username) {
    const config = require('./config.json');
    if (config.users.includes(username)) {
        return `${username} is already being tracked.`;
    }
    config.users.push(username);
    await updateConfig(config);
    return `Added ${username} to tracking list.`;
}

async function removeUser(username) {
    const config = require('./config.json');
    const index = config.users.indexOf(username);
    if (index === -1) {
        return `${username} is not in the tracking list.`;
    }
    config.users.splice(index, 1);
    await updateConfig(config);
    return `Removed ${username} from tracking list.`;
}

// Enhanced check function with more problem details
async function enhancedCheck() {
    try {
        const dailyData = await axios.get('https://leetcode-api-pied.vercel.app/daily');
        const problem = dailyData.data.question;
        const slug = problem.titleSlug;
        
        // Get detailed problem info
        const detailedProblemResponse = await axios.get(`https://leetcode-api-pied.vercel.app/problem/${slug}`);
        const detailedProblem = detailedProblemResponse.data;
        
        const channel = await client.channels.fetch(channelId);
        const results = await Promise.all(users.map(u => checkUser(u, slug)));
        
        // Get topic tags from detailed problem info
        const topics = detailedProblem.topicTags && Array.isArray(detailedProblem.topicTags)
            ? detailedProblem.topicTags.map(t => t.name).join(', ')
            : 'Not specified';

        // Parse stats if available
        let stats = {};
        try {
            stats = JSON.parse(detailedProblem.stats);
        } catch (e) {
            stats = { acRate: 'Unknown' };
        }
        
        const statusEmbed = {
            title: `Daily LeetCode Challenge Status`,
            description: `**Problem**: ${detailedProblem.title || 'Unknown'}\n` +
                        `**Difficulty**: ${detailedProblem.difficulty || 'Unknown'}\n` +
                        `**Topics**: ${topics}\n` +
                        `**Acceptance Rate**: ${stats.acRate || 'Unknown'}\n` +
                        `**Total Submissions**: ${stats.totalSubmission || 'Unknown'}\n\n` +
                        `**User Status**:`,
            fields: users.map((u, i) => ({
                name: u,
                value: results[i] ? '✅ Completed' : '❌ Not completed',
                inline: true
            })),
            color: 0x00ff00,
            timestamp: new Date(),
            url: detailedProblem.url || `https://leetcode.com/problems/${slug}`
        };
        
        return { embeds: [statusEmbed] };
    } catch (err) {
        console.error('Error during enhanced check', err);
        return { content: 'Error checking challenge status.' };
    }
}

// Replace the existing interactionCreate handler
client.on('interactionCreate', async interaction => {
    if (!interaction.isChatInputCommand()) return;

    // Check if the command is admin-only
    const isAdmin = interaction.user.id === ADMIN_USER_ID;
    
    try {
        switch (interaction.commandName) {
            case 'check':
                await interaction.deferReply();
                const checkResult = await enhancedCheck();
                await interaction.editReply(checkResult);
                break;
                
            case 'adduser':
                if (!isAdmin) {
                    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                    return;
                }
                const userToAdd = interaction.options.getString('username');
                const addResult = await addUser(userToAdd);
                await interaction.reply(addResult);
                break;
                
            case 'removeuser':
                if (!isAdmin) {
                    await interaction.reply({ content: 'You do not have permission to use this command.', ephemeral: true });
                    return;
                }
                const userToRemove = interaction.options.getString('username');
                const removeResult = await removeUser(userToRemove);
                await interaction.reply(removeResult);
                break;
                
            case 'listusers':
                const config = require('./config.json');
                await interaction.reply(`Currently tracking these users:\n${config.users.map(u => `• ${u}`).join('\n')}`);
                break;
        }
    } catch (error) {
        console.error('Error handling command:', error);
        const errorMessage = { content: 'An error occurred while processing the command.', ephemeral: true };
        if (interaction.deferred) {
            await interaction.editReply(errorMessage);
        } else {
            await interaction.reply(errorMessage);
        }
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
