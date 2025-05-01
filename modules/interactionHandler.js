const { addUser, removeUser } = require('./configManager');
const { enhancedCheck } = require('./apiUtils');

// Handles interaction events
async function handleInteraction(interaction) {
    console.log(`[handleInteraction] Interaction received: ${interaction.commandName}`);

    if (!interaction.isCommand()) {
        console.log('[handleInteraction] Interaction is not a command. Ignoring.');
        return;
    }

    const { commandName } = interaction;
    const config = require('../config.json');
    const users = config.users;

    if (commandName === 'check') {
        console.log('[handleInteraction] Handling check command.');
        await interaction.deferReply();
        const checkResult = await enhancedCheck(users, interaction.client, config.channelId);
        await interaction.editReply(checkResult);
    } else if (commandName === 'adduser') {
        const username = interaction.options.getString('username');
        console.log(`[handleInteraction] Adding user: ${username}`);
        const addResult = await addUser(username);
        await interaction.reply(addResult);
    } else if (commandName === 'removeuser') {
        const username = interaction.options.getString('username');
        console.log(`[handleInteraction] Removing user: ${username}`);
        const removeResult = await removeUser(username);
        await interaction.reply(removeResult);
    } else if (commandName === 'listusers') {
        console.log('[handleInteraction] Listing all tracked users.');
        await interaction.reply(`Currently tracking these users:\n${users.map(u => `• ${u}`).join('\n')}`);
    } else {
        console.log(`[handleInteraction] Unknown command: ${commandName}`);
        await interaction.reply('Unknown command.');
    }
}

module.exports = { handleInteraction };