const { REST, Routes, SlashCommandBuilder } = require('discord.js');
const { clientId, guildId, token } = require('../config.json');

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

async function registerCommands(clientId) {
    console.log(`[registerCommands] Initializing command registration for clientId: ${clientId}`);
    const rest = new REST({ version: '10' }).setToken(token);
    try {
        console.log('[registerCommands] Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(clientId, guildId),
            { body: commands }
        );

        console.log('[registerCommands] Successfully reloaded application (/) commands.');
    } catch (error) {
        console.error('[registerCommands] Error reloading commands:', error);
    }
}

module.exports = { registerCommands };