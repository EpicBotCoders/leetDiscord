const { updateStatsPanel } = require('../statsPanel');
const SystemConfig = require('../models/SystemConfig');
const Guild = require('../models/Guild');
const axios = require('axios');
const logger = require('../logger');

// Mocks
jest.mock('../models/SystemConfig');
jest.mock('../models/Guild');
jest.mock('axios');
jest.mock('../logger');

describe('statsPanel', () => {
    let mockClient;
    let mockGuild;
    let mockChannel;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env.STATS_GUILD_ID = 'statsGuild';
        process.env.STATS_CHANNEL_ID = 'statsChannel';
        process.env.HC_PING_STATS_PANEL = 'https://hc-ping.com/stats';

        mockChannel = {
            messages: { fetch: jest.fn().mockResolvedValue({ edit: jest.fn().mockResolvedValue({}) }) },
            send: jest.fn().mockResolvedValue({ id: 'newmsg' })
        };
        mockGuild = {
            channels: { fetch: jest.fn().mockResolvedValue(mockChannel) }
        };
        mockClient = {
            guilds: { fetch: jest.fn().mockResolvedValue(mockGuild) },
            uptime: 1000
        };

        // stub guild metrics calls
        Guild.countDocuments = jest.fn().mockResolvedValue(1);
        Guild.find = jest.fn().mockResolvedValue([{
            users: new Map(),
            contestReminderEnabled: false
        }]);

        SystemConfig.findOne = jest.fn().mockResolvedValue({ value: 'existingMsgId' });

        axios.get.mockResolvedValue({});
    });

    it('should ping healthcheck and update without error', async () => {
        await updateStatsPanel(mockClient);
        expect(axios.get).toHaveBeenCalledWith(process.env.HC_PING_STATS_PANEL);
    });
});
