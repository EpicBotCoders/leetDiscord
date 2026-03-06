// Set up timezone for consistent testing
process.env.TZ = 'UTC';

// Mock environment variables
process.env.NODE_ENV = 'test';
process.env.STATS_GUILD_ID = 'stats_guild_id';
process.env.STATS_CHANNEL_ID = 'stats_channel_id';
process.env.LEADERBOARD_CHANNEL_ID = 'leaderboard_channel_id';

// No need to start MongoMemoryServer here as we use @shelf/jest-mongodb preset
// which provides global.__MONGO_URI__