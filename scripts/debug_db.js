const mongoose = require('mongoose');
const Guild = require('../modules/models/Guild');
require('dotenv').config();

async function checkDb() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const guildId = '1354159052535627908';
        const guild = await Guild.findOne({ guildId });

        if (guild) {
            console.log('Guild found:', guild.guildId);
            console.log('Telegram Users (raw):', guild.telegramUsers);
            if (guild.telegramUsers) {
                console.log('Telegram Users Keys:', Array.from(guild.telegramUsers.keys()));
                console.log('Telegram Users Entries:', JSON.stringify(Object.fromEntries(guild.telegramUsers), null, 2));
            } else {
                console.log('telegramUsers field is missing or null');
            }
        } else {
            console.log('Guild not found');
        }

    } catch (error) {
        console.error('Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

checkDb();
