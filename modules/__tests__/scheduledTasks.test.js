const { performDailyCheck, performContestReminder } = require('../core/scheduledTasks');
const logger = require('../core/logger');
const Guild = require('../models/Guild');
const DailySubmission = require('../models/DailySubmission');
const { getDailySlug, getBestDailySubmission, getLeetCodeContests } = require('../services/apiUtils');
const { getGuildConfig, updateUserStats } = require('../core/configManager');
const axios = require('axios');

// Mock dependencies
jest.mock('../core/logger');
jest.mock('axios');
jest.mock('../models/Guild');
jest.mock('../models/DailySubmission');
jest.mock('../services/apiUtils');
jest.mock('../core/configManager');

describe('scheduledTasks', () => {
    let mockClient;
    let mockChannel;
    let mockGuild;

    beforeEach(() => {
        jest.clearAllMocks();

        mockChannel = {
            id: 'channelId',
            name: 'test-channel',
            send: jest.fn().mockResolvedValue({}),
            permissionsFor: jest.fn().mockReturnValue({
                has: jest.fn().mockReturnValue(true)
            })
        };

        mockGuild = {
            id: 'guildId',
            name: 'Test Guild',
            channels: { fetch: jest.fn().mockResolvedValue(mockChannel) },
            members: { fetchMe: jest.fn().mockResolvedValue({ id: 'botId' }) },
            fetchOwner: jest.fn().mockResolvedValue({ send: jest.fn().mockResolvedValue({}) })
        };

        mockClient = {
            guilds: {
                fetch: jest.fn().mockResolvedValue(mockGuild),
                cache: new Map([['guildId', mockGuild]])
            },
            channels: { fetch: jest.fn().mockResolvedValue(mockChannel) }
        };

        getDailySlug.mockResolvedValue('two-sum');
        getBestDailySubmission.mockResolvedValue({
            title: 'Two Sum',
            difficulty: 'Easy',
            timestamp: (Date.now() / 1000).toString(),
            runtime: '100 ms',
            memory: '20 MB'
        });

        getGuildConfig.mockResolvedValue({
            guildId: 'guildId',
            channelId: 'channelId',
            users: new Map([['123456789', 'testuser']])
        });

        DailySubmission.findOne.mockResolvedValue(null);
        DailySubmission.create.mockResolvedValue({});
    });

    describe('performDailyCheck', () => {
        it('should handle missing permissions correctly', async () => {
            mockChannel.permissionsFor().has.mockReturnValue(false);

            await performDailyCheck(mockClient, 'guildId');

            expect(logger.error).toHaveBeenCalled();
            expect(mockGuild.fetchOwner).toHaveBeenCalled();
        });

        it('should handle valid submission correctly', async () => {
            await performDailyCheck(mockClient, 'guildId');

            expect(DailySubmission.create).toHaveBeenCalledWith(expect.objectContaining({
                guildId: 'guildId',
                userId: '123456789',
                leetcodeUsername: 'testuser'
            }));
        });
    });
});