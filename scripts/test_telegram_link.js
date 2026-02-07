const mongoose = require('mongoose');
const Guild = require('../modules/models/Guild');
const { setTelegramToken, addUser } = require('../modules/configManager');
require('dotenv').config();

async function testLink() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const guildId = '1354159052535627908';
        const testUser = 'test_user_123';
        const testDiscordId = '999999999';

        // 1. Ensure user exists
        console.log('Adding test user...');
        await addUser(guildId, testUser, testDiscordId);

        // 2. Set token
        console.log('Setting Telegram token...');
        try {
            const token = 'test-token-' + Date.now();
            await setTelegramToken(guildId, testDiscordId, token);
            console.log('Token set successfully');
        } catch (e) {
            console.error('Error setting token:', e);
        }

        // 3. Verify DB
        const TelegramUser = require('../modules/models/TelegramUser');
        const user = await TelegramUser.findOne({ leetcodeUsername: testUser });

        console.log('Verification - Global User Found:', !!user);
        if (user) {
            console.log('Verification - User Data:', JSON.stringify(user, null, 2));
        } else {
            console.log('Verification - User NOT found in TelegramUser collection');
        }

    } catch (error) {
        console.error('Test Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

testLink();
