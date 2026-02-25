// Script to extract command metadata from backend definitions for frontend docs
// Usage: node scripts/export-commands.js

const fs = require('fs');
const path = require('path');
const { commandDefinitions } = require('../modules/commandRegistration');


// Extract metadata from SlashCommandBuilder's .toJSON(), plus category/adminOnly
const docsCommands = commandDefinitions.map(cmd => {
  const meta = cmd.data.toJSON();
  return {
    name: meta.name,
    description: meta.description,
    options: meta.options || [],
    category: cmd.category || null,
    adminOnly: cmd.adminOnly || false,
    hidden: cmd.hidden || false
  };
});

const outPath = path.join(__dirname, '../frontend/public/commands.json');
fs.writeFileSync(outPath, JSON.stringify(docsCommands, null, 2));
console.log(`Exported ${docsCommands.length} commands to ${outPath}`);