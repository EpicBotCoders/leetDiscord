const { registerCommands, commandDefinitions } = require('../modules/commandRegistration');
const { handleInteraction } = require('../modules/interactionHandler');

console.log('Command Definitions loaded:', Array.isArray(commandDefinitions));
console.log('Register Commands loaded:', typeof registerCommands === 'function');
console.log('Handle Interaction loaded:', typeof handleInteraction === 'function');

if (Array.isArray(commandDefinitions)) {
    console.log('Categories found:', [...new Set(commandDefinitions.map(c => c.category))]);
}
