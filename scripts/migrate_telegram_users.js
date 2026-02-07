const mongoose = require('mongoose');
const Guild = require('../modules/models/Guild');
const TelegramUser = require('../modules/models/TelegramUser');
require('dotenv').config();

async function migrate() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('Connected to DB');

        const guilds = await Guild.find({});
        console.log(`Found ${guilds.length} guilds to scan.`);

        let migratedCount = 0;
        let errorCount = 0;

        for (const guild of guilds) {
            if (!guild.telegramUsers || guild.telegramUsers.size === 0) {
                continue;
            }

            console.log(`Processing guild ${guild.guildId}...`);

            for (const [username, userData] of guild.telegramUsers.entries()) {
                try {
                    // Look up discord ID from the guild's users map if possible
                    let discordId = null;
                    if (guild.users && guild.users.has(username)) {
                        const uid = guild.users.get(username);
                        if (uid && uid !== 'null') {
                            discordId = uid;
                        }
                    }

                    console.log(`Migrating ${username} (Discord: ${discordId}, ChatID: ${userData.chatId})...`);

                    // Upsert into TelegramUser
                    // We prioritize preserving existing chatId/enabled state if it exists
                    await TelegramUser.findOneAndUpdate(
                        { leetcodeUsername: username },
                        {
                            $set: {
                                leetcodeUsername: username,
                                // Only set discordId if we found one and it's not already set? 
                                // Actually, let's just set it.
                                ...(discordId && { userId: discordId }),
                                ...(userData.chatId && { telegramChatId: userData.chatId }),
                                isEnabled: userData.enabled !== undefined ? userData.enabled : true,
                                ...(userData.tempToken && { tempToken: userData.tempToken }),
                                ...(userData.tokenExpires && { tokenExpires: userData.tokenExpires })
                            },
                            $setOnInsert: {
                                createdAt: new Date()
                            }
                        },
                        { upsert: true, new: true }
                    );
                    migratedCount++;
                } catch (err) {
                    console.error(`Failed to migrate ${username}:`, err.message);
                    errorCount++;
                }
            }
        }

        console.log('Migration complete.');
        console.log(`Successfully migrated/upserted: ${migratedCount}`);
        console.log(`Errors: ${errorCount}`);

    } catch (error) {
        console.error('Migration Fatal Error:', error);
    } finally {
        await mongoose.disconnect();
    }
}

migrate();
