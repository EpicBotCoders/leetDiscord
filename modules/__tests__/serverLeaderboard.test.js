const { updateServerLeaderboard } = require('../serverLeaderboard');
const SystemConfig = require('../models/SystemConfig');
const Guild = require('../models/Guild');
const DailySubmission = require('../models/DailySubmission');
const axios = require('axios');
const logger = require('../logger');

// Mocks
jest.mock('../models/SystemConfig');
jest.mock('../models/Guild');
jest.mock('../models/DailySubmission');
jest.mock('axios');
jest.mock('../logger');

describe('serverLeaderboard', () => {
    let mockClient;
    let mockGuild;
    let mockChannel;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.STATS_GUILD_ID = 'statsGuild';
        process.env.LEADERBOARD_CHANNEL_ID = 'leaderboardChannel';
        process.env.HC_PING_SERVER_LEADERBOARD = 'https://hc-ping.com/leaderboard';

        mockChannel = {
            messages: { fetch: jest.fn().mockResolvedValue({ edit: jest.fn().mockResolvedValue({}) }) },
            send: jest.fn().mockResolvedValue({ id: 'newmsg' })
        };
        mockGuild = {
            channels: { fetch: jest.fn().mockResolvedValue(mockChannel) }
        };
        mockClient = {
            guilds: {
                fetch: jest.fn().mockResolvedValue(mockGuild),
                cache: new Map([['guild1', { name: 'Guild1' }]])
            }
        };

        Guild.find = jest.fn().mockResolvedValue([]);
        DailySubmission.aggregate = jest.fn().mockResolvedValue([]);
        SystemConfig.findOne = jest.fn().mockResolvedValue({ value: 'existingMsgId' });

        axios.get.mockResolvedValue({});
    });

    it('should ping healthcheck and update without error', async () => {
        await updateServerLeaderboard(mockClient);
        expect(axios.get).toHaveBeenCalledWith(process.env.HC_PING_SERVER_LEADERBOARD);
    });
});
