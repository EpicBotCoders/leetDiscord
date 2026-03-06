const DailySubmission = require('../models/DailySubmission');
jest.mock('../models/DailySubmission', () => ({
    findOne: jest.fn(),
    findOneAndUpdate: jest.fn(),
    aggregate: jest.fn()
}));

const logger = require('../core/logger');
jest.mock('../core/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const {
    getDailySlug,
    getUserSubmissions,
    enhancedCheck,
    clearCache
} = require('../services/apiUtils');

describe('apiUtils', () => {
    let mock;

    beforeEach(() => {
        mock = new MockAdapter(axios);
        jest.clearAllMocks();
        clearCache();

        // Default mocks
        DailySubmission.findOne.mockResolvedValue(null);
        DailySubmission.findOneAndUpdate.mockResolvedValue({});
    });

    afterEach(() => {
        mock.reset();
    });

    describe('enhancedCheck', () => {
        const mockClient = {
            channels: {
                fetch: jest.fn().mockResolvedValue({
                    guild: {
                        id: 'guildId',
                        name: 'Test Guild',
                        members: {
                            fetch: jest.fn().mockResolvedValue({ user: { id: 'userId', displayName: 'Test User' } }),
                            fetchMe: jest.fn().mockResolvedValue({ id: 'botId' })
                        }
                    },
                    permissionsFor: jest.fn().mockReturnValue({
                        has: jest.fn().mockReturnValue(true)
                    })
                })
            }
        };
        const channelId = '123';
        const users = ['testuser'];

        beforeEach(() => {
            mock.onGet('https://leetcode-api-pied.vercel.app/daily').reply(200, {
                question: { titleSlug: 'two-sum' }
            });
            mock.onGet('https://leetcode-api-pied.vercel.app/problem/two-sum').reply(200, {
                title: 'Two Sum',
                difficulty: 'Easy',
                topicTags: [{ name: 'Array' }],
                stats: JSON.stringify({ acRate: '47.5%' })
            });
        });

        it('should handle Unix timestamp correctly and record to DB', async () => {
            mock.onGet(new RegExp('/user/.*/submissions')).reply(200, [{
                titleSlug: 'two-sum',
                statusDisplay: 'Accepted',
                timestamp: '1620000000'
            }]);

            const result = await enhancedCheck(users, mockClient, channelId);

            expect(result.embeds).toBeDefined();
            expect(DailySubmission.findOneAndUpdate).toHaveBeenCalled();
        });
    });
});