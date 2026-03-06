const { initializeServerLeaderboard } = require('../utils/serverLeaderboard');
const SystemConfig = require('../models/SystemConfig');
const Guild = require('../models/Guild');
const DailySubmission = require('../models/DailySubmission');
const logger = require('../core/logger');
const axios = require('axios');

// Mocks
jest.mock('../models/SystemConfig');
jest.mock('../models/Guild');
jest.mock('../models/DailySubmission');
jest.mock('axios');
jest.mock('../core/logger');

describe('serverLeaderboard', () => {
    let mockClient;
    let mockGuild;
    let mockChannel;

    beforeEach(() => {
        jest.clearAllMocks();

        process.env.STATS_GUILD_ID = 'statsGuild';
        process.env.LEADERBOARD_CHANNEL_ID = 'leaderboardChannel';

        mockChannel = {
            id: 'leaderboardChannel',
            messages: { fetch: jest.fn().mockResolvedValue({ edit: jest.fn().mockResolvedValue({}) }) },
            send: jest.fn().mockResolvedValue({ id: 'newmsg' })
        };
        mockGuild = {
            id: 'statsGuild',
            name: 'Stats Guild',
            channels: { fetch: jest.fn().mockResolvedValue(mockChannel) }
        };
        mockClient = {
            guilds: {
                fetch: jest.fn().mockResolvedValue(mockGuild),
                cache: new Map([[mockGuild.id, mockGuild]])
            },
            uptime: 1000
        };

        // stub guild metrics calls
        Guild.find = jest.fn().mockResolvedValue([{
            guildId: 'statsGuild',
            isActive: true
        }]);

        SystemConfig.findOne = jest.fn().mockResolvedValue({ value: 'existingMsgId' });
        axios.get.mockResolvedValue({});
    });

    it('should initialize and update without error', async () => {
        await initializeServerLeaderboard(mockClient);
        expect(Guild.find).toHaveBeenCalled();
    });
});
