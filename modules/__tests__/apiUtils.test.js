const axios = require('axios');
const MockAdapter = require('axios-mock-adapter');
const { getDailySlug, getUserSubmissions, checkUser, enhancedCheck } = require('../apiUtils');

describe('apiUtils', () => {
    let mock;

    beforeEach(() => {
        mock = new MockAdapter(axios);
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
                    send: jest.fn()
                })
            }
        };
        const channelId = '123';
        const users = ['user1', 'user2'];

        it('should create status embed with problem details', async () => {
            const mockDaily = {
                question: {
                    titleSlug: 'two-sum',
                    title: 'Two Sum',
                    link: 'https://leetcode.com/problems/two-sum'
                }
            };
            const mockProblem = {
                title: 'Two Sum',
                difficulty: 'Easy',
                topicTags: [{ name: 'Array' }, { name: 'Hash Table' }],
                stats: JSON.stringify({ acRate: '47.5%', totalSubmission: '1000' }),
                url: 'https://leetcode.com/problems/two-sum'
            };
            const mockSubmissions = [
                { titleSlug: 'two-sum', statusDisplay: 'Accepted' }
            ];

            mock.onGet('https://leetcode-api-pied.vercel.app/daily').reply(200, mockDaily);
            mock.onGet('https://leetcode-api-pied.vercel.app/problem/two-sum').reply(200, mockProblem);
            mock.onGet(new RegExp('/user/.*/submissions')).reply(200, mockSubmissions);

            const result = await enhancedCheck(users, mockClient, channelId);
            
            expect(result).toHaveProperty('embeds');
            expect(result.embeds[0]).toHaveProperty('title', 'Daily LeetCode Challenge Status');
            expect(result.embeds[0].description).toContain('Two Sum');
            expect(result.embeds[0].description).toContain('Easy');
            expect(result.embeds[0].description).toContain('Array, Hash Table');
            expect(result.embeds[0].description).toContain('✅'); // Should show completed status
        });

        it('should handle API errors gracefully', async () => {
            mock.onGet('https://leetcode-api-pied.vercel.app/daily').reply(500);

            const result = await enhancedCheck(users, mockClient, channelId);
            expect(result).toHaveProperty('content', 'Error checking challenge status.');
        });
    });
});