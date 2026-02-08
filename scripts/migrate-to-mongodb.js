require('dotenv').config();
const fs = require('fs').promises;
const path = require('path');
const { connectDB } = require('../modules/models/db');
const Guild = require('../modules/models/Guild');
const logger = require('../modules/logger');

async function migrateToMongoDB() {
    try {
        // Connect to MongoDB
        await connectDB();

        // Read the existing config.json
        const configPath = path.join(__dirname, '..', 'config.json');
        const configData = JSON.parse(await fs.readFile(configPath, 'utf8'));

        // Migrate each guild's data
        for (const [guildId, guildData] of Object.entries(configData.guilds)) {
            await Guild.findOneAndUpdate(
                { guildId },
                {
                    guildId,
                    channelId: guildData.channelId,
                    users: guildData.users || {},
                    cronJobs: guildData.cronJobs || [
                        { schedule: '0 10 * * *', task: 'runCheck' },
                        { schedule: '0 18 * * *', task: 'runCheck' }
                    ]
                },
                { upsert: true, new: true }
            );
            logger.info(`Migrated data for guild ${guildId}`);
        }

        // Create backup of config.json
        const backupPath = path.join(__dirname, '..', 'config.json.bak');
        await fs.copyFile(configPath, backupPath);
        logger.info(`Created backup at ${backupPath}`);

        // Update config.json to only contain the token
        await fs.writeFile(configPath, JSON.stringify({ token: configData.token }, null, 2));
        logger.info('Updated config.json to only contain token');

        logger.info('Migration completed successfully!');
        process.exit(0);
    } catch (error) {
        logger.error('Migration failed:', error);
        process.exit(1);
    }
}

migrateToMongoDB();