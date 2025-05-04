const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const { getDailySlug, getUserSubmissions, checkUser, enhancedCheck } = require('../apiUtils');
const logger = require('../logger');
const DailySubmission = require('../models/DailySubmission');

jest.mock('../logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

jest.mock('../models/DailySubmission');

describe('apiUtils', () => {
    let mock;

    beforeEach(() => {
        mock = new MockAdapter(axios);
        jest.clearAllMocks();
    });

    afterEach(() => {
        mock.reset();
    });

    describe('getDailySlug', () => {
        it('should fetch daily challenge slug', async () => {
            const mockResponse = {
                question: {
                    titleSlug: 'two-sum'
                }
            };
            mock.onGet('https://leetcode-api-pied.vercel.app/daily').reply(200, mockResponse);

            const slug = await getDailySlug();
            expect(slug).toBe('two-sum');
        });

        it('should handle API errors', async () => {
            mock.onGet('https://leetcode-api-pied.vercel.app/daily').reply(500);
            await expect(getDailySlug()).rejects.toThrow();
        });
    });

    describe('getUserSubmissions', () => {
        const username = 'testuser';
        const mockSubmissions = [
            { titleSlug: 'two-sum', statusDisplay: 'Accepted' },
            { titleSlug: 'add-two-numbers', statusDisplay: 'Wrong Answer' }
        ];

        it('should fetch user submissions', async () => {
            mock.onGet(new RegExp(`/user/${username}/submissions`)).reply(200, mockSubmissions);

            const submissions = await getUserSubmissions(username);
            expect(submissions).toEqual(mockSubmissions);
        });

        it('should handle API errors', async () => {
            mock.onGet(new RegExp(`/user/${username}/submissions`)).reply(500);
            await expect(getUserSubmissions(username)).rejects.toThrow();
        });
    });

    describe('checkUser', () => {
        const username = 'testuser';
        const slug = 'two-sum';

        it('should return true if user solved problem', async () => {
            const mockSubmissions = [
                { titleSlug: 'two-sum', statusDisplay: 'Accepted' }
            ];
            mock.onGet(new RegExp(`/user/${username}/submissions`)).reply(200, mockSubmissions);

            const result = await checkUser(username, slug);
            expect(result).toBe(true);
        });

        it('should return false if user has not solved problem', async () => {
            const mockSubmissions = [
                { titleSlug: 'add-two-numbers', statusDisplay: 'Accepted' }
            ];
            mock.onGet(new RegExp(`/user/${username}/submissions`)).reply(200, mockSubmissions);

            const result = await checkUser(username, slug);
            expect(result).toBe(false);
        });

        it('should handle API errors', async () => {
            mock.onGet(new RegExp(`/user/${username}/submissions`)).reply(500);
            await expect(checkUser(username, slug)).rejects.toThrow();
        });
    });

    describe('enhancedCheck', () => {
        const mockClient = {
            channels: {
                fetch: jest.fn().mockResolvedValue({
                    guild: {
                        id: 'guildId',
                        name: 'Test Guild',
                        members: {
                            fetch: jest.fn().mockResolvedValue({ id: 'userId' }),
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

        describe('submission timestamp handling', () => {
            beforeEach(() => {
                // Mock daily challenge endpoint
                mock.onGet('https://leetcode-api-pied.vercel.app/daily').reply(200, {
                    question: { titleSlug: 'two-sum' }
                });

                // Mock problem details endpoint
                mock.onGet('https://leetcode-api-pied.vercel.app/problem/two-sum').reply(200, {
                    title: 'Two Sum',
                    difficulty: 'Easy',
                    topicTags: [{ name: 'Array' }],
                    stats: JSON.stringify({ acRate: '47.5%' })
                });

                // Mock DailySubmission.findOne to return null (no existing submission)
                DailySubmission.findOne.mockResolvedValue(null);
            });

            it('should handle Unix timestamp in seconds', async () => {
                mock.onGet(new RegExp('/user/.*/submissions')).reply(200, [{
                    titleSlug: 'two-sum',
                    statusDisplay: 'Accepted',
                    timestamp: '1620000000'
                }]);

                await enhancedCheck(users, mockClient, channelId);

                expect(DailySubmission.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        submissionTime: expect.any(Date)
                    })
                );
                expect(logger.warn).not.toHaveBeenCalled();
            });

            it('should handle Unix timestamp in milliseconds', async () => {
                mock.onGet(new RegExp('/user/.*/submissions')).reply(200, [{
                    titleSlug: 'two-sum',
                    statusDisplay: 'Accepted',
                    timestamp: '1620000000000'
                }]);

                await enhancedCheck(users, mockClient, channelId);

                expect(DailySubmission.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        submissionTime: expect.any(Date)
                    })
                );
                expect(logger.warn).not.toHaveBeenCalled();
            });

            it('should handle ISO string timestamp', async () => {
                mock.onGet(new RegExp('/user/.*/submissions')).reply(200, [{
                    titleSlug: 'two-sum',
                    statusDisplay: 'Accepted',
                    timestamp: '2025-05-04T00:00:00Z'
                }]);

                await enhancedCheck(users, mockClient, channelId);

                expect(DailySubmission.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        submissionTime: expect.any(Date)
                    })
                );
                expect(logger.warn).not.toHaveBeenCalled();
            });

            it('should handle invalid timestamp format', async () => {
                mock.onGet(new RegExp('/user/.*/submissions')).reply(200, [{
                    titleSlug: 'two-sum',
                    statusDisplay: 'Accepted',
                    timestamp: 'invalid-timestamp'
                }]);

                await enhancedCheck(users, mockClient, channelId);

                expect(DailySubmission.create).toHaveBeenCalledWith(
                    expect.objectContaining({
                        submissionTime: expect.any(Date)
                    })
                );
                expect(logger.warn).toHaveBeenCalledWith(
                    expect.stringContaining('Invalid timestamp format')
                );
            });

            it('should handle missing timestamp', async () => {
                mock.onGet(new RegExp('/user/.*/submissions')).reply(200, [{
                    titleSlug: 'two-sum',
                    statusDisplay: 'Accepted'
                    // timestamp field missing
                }]);

                await enhancedCheck(users, mockClient, channelId);

                expect(logger.warn).toHaveBeenCalledWith(
                    'No timestamp in submission:',
                    expect.objectContaining({
                        titleSlug: 'two-sum',
                        statusDisplay: 'Accepted'
                    })
                );
            });
        });

        it('should create status embed with problem details', async () => {
            const mockDaily = {
                question: {
                    titleSlug: 'two-sum'
                }
            };
            const mockProblem = {
                title: 'Two Sum',
                difficulty: 'Easy',
                topicTags: [{ name: 'Array' }, { name: 'Hash Table' }],
                stats: JSON.stringify({ acRate: '47.5%', totalSubmission: '1000' })
            };
            const mockSubmissions = [
                { titleSlug: 'two-sum', statusDisplay: 'Accepted', timestamp: '1620000000' }
            ];

            mock.onGet('https://leetcode-api-pied.vercel.app/daily').reply(200, mockDaily);
            mock.onGet('https://leetcode-api-pied.vercel.app/problem/two-sum').reply(200, mockProblem);
            mock.onGet(new RegExp('/user/.*/submissions')).reply(200, mockSubmissions);

            DailySubmission.findOne.mockResolvedValue(null);

            const result = await enhancedCheck(users, mockClient, channelId);
            
            expect(result).toHaveProperty('embeds');
            expect(result.embeds[0].fields).toEqual(
                expect.arrayContaining([
                    expect.objectContaining({
                        name: expect.any(String),
                        value: expect.stringContaining('Two Sum')
                    }),
                    expect.objectContaining({
                        name: expect.any(String),
                        value: expect.stringContaining('Easy')
                    })
                ])
            );
        });

        it('should handle API errors gracefully', async () => {
            mock.onGet('https://leetcode-api-pied.vercel.app/daily').reply(500);

            const result = await enhancedCheck(users, mockClient, channelId);
            expect(result).toHaveProperty('content', 'Error checking challenge status.');
        });
    });
});