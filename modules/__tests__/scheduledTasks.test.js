const { scheduleDailyCheck, performContestReminder, performSilentCheck } = require('../scheduledTasks');
const Guild = require('../models/Guild');
const DailySubmission = require('../models/DailySubmission');
const logger = require('../logger');
const axios = require('axios');
const { PermissionsBitField } = require('discord.js');

// Mock dependencies
jest.mock('../logger');
jest.mock('axios');
jest.mock('../models/Guild');
jest.mock('../models/DailySubmission');

describe('scheduledTasks', () => {
    let mockClient;
    let mockChannel;
    let mockGuild;
    let mockPermissions;
    
    beforeEach(() => {
        jest.clearAllMocks();

        // Set up Guild mock with proper users Map
        mockGuild = {
            guildId: 'guildId',
            channelId: 'channelId',
            name: 'Test Guild',
            users: new Map([
                ['testuser', '123456789']
            ])
        };
        Guild.findOne.mockResolvedValue(mockGuild);

        // Mock permissions object
        mockPermissions = {
            has: jest.fn().mockReturnValue(true)
        };

        // Set up mock channel
        mockChannel = {
            id: 'channelId',
            name: 'test-channel',
            send: jest.fn().mockResolvedValue({}),
            guild: {
                name: 'Test Guild',
                members: {
                    fetchMe: jest.fn().mockResolvedValue({ id: 'botId' })
                },
                fetchOwner: jest.fn().mockResolvedValue({
                    send: jest.fn().mockResolvedValue({})
                })
            }
        };

        // Set up permissionsFor on the channel
        mockChannel.permissionsFor = jest.fn().mockReturnValue(mockPermissions);

        // Set up mock client
        mockClient = {
            channels: {
                fetch: jest.fn().mockResolvedValue(mockChannel)
            }
        };

        // Default axios mock responses
        axios.get.mockImplementation((url) => {
            if (url.includes('/daily')) {
                return Promise.resolve({ 
                    data: { 
                        question: { 
                            titleSlug: 'two-sum'
                        } 
                    } 
                });
            }
            if (url.includes('/problem/')) {
                return Promise.resolve({
                    data: {
                        title: 'Two Sum',
                        difficulty: 'Easy'
                    }
                });
            }
            if (url.includes('/user/')) {
                return Promise.resolve({
                    data: [{
                        titleSlug: 'two-sum',
                        statusDisplay: 'Accepted',
                        timestamp: '1620000000'
                    }]
                });
            }
            return Promise.reject(new Error('Invalid URL'));
        });

        // Default DailySubmission mock behavior
        DailySubmission.findOne.mockResolvedValue(null);
        DailySubmission.create.mockResolvedValue({});

        // Set a fixed date for consistency
        jest.spyOn(global, 'Date').mockImplementation(() => new Date('2025-05-04T00:00:00Z'));
    });

    afterEach(() => {
        // Restore Date after each test
        global.Date = Date;
    });

    describe('scheduleDailyCheck', () => {
        it('should handle missing permissions correctly', async () => {
            // Override the permission check to return false for SendMessages
            mockPermissions.has.mockImplementation((permission) => {
                if (permission === PermissionsBitField.Flags.SendMessages) {
                    return false;
                }
                return true;
            });

            const schedule = '0 10 * * *';
            await scheduleDailyCheck(mockClient, 'guildId', 'channelId', schedule);

            expect(logger.error).toHaveBeenCalledWith(
                `Bot lacks permission to send messages in channel ${mockChannel.name} (${mockChannel.id}) in guild ${mockChannel.guild.name} (guildId)`,
                expect.any(String)
            );
            expect(mockChannel.guild.fetchOwner).toHaveBeenCalled();
        });

        it('should handle valid submission correctly', async () => {
            const schedule = '0 10 * * *';
            await scheduleDailyCheck(mockClient, 'guildId', 'channelId', schedule);

            expect(DailySubmission.create).toHaveBeenCalledWith({
                guildId: 'guildId',
                userId: '123456789',
                leetcodeUsername: 'testuser',
                date: expect.any(Date),
                questionTitle: 'Two Sum',
                questionSlug: 'two-sum',
                difficulty: 'Easy',
                submissionTime: expect.any(Date)
            });
        });

        it('should handle invalid timestamps correctly', async () => {
            // Override axios response for user submissions to include invalid timestamp
            axios.get.mockImplementation((url) => {
                if (url.includes('/user/')) {
                    return Promise.resolve({
                        data: [{
                            titleSlug: 'two-sum',
                            statusDisplay: 'Accepted',
                            timestamp: 'invalid-timestamp'
                        }]
                    });
                }
                return Promise.resolve({
                    data: {
                        title: 'Two Sum',
                        difficulty: 'Easy'
                    }
                });
            });

            const schedule = '0 10 * * *';
            await scheduleDailyCheck(mockClient, 'guildId', 'channelId', schedule);

            expect(logger.warn).toHaveBeenCalledWith(
                'Invalid timestamp format:',
                'invalid-timestamp'
            );
        });

        it('should handle duplicate submissions correctly', async () => {
            // Mock that submission already exists
            DailySubmission.findOne.mockResolvedValue({
                guildId: 'guildId',
                questionSlug: 'two-sum'
            });

            const schedule = '0 10 * * *';
            await scheduleDailyCheck(mockClient, 'guildId', 'channelId', schedule);

            // Should not create new submission
            expect(DailySubmission.create).not.toHaveBeenCalled();
        });
    });

    describe('healthcheck pings', () => {
        beforeEach(() => {
            // clear axios call history
            axios.get.mockClear();
        });

        it('should ping contest reminder healthcheck before running', async () => {
            process.env.HC_PING_CONTEST_REMINDER = 'https://hc-ping.com/contest';
            // make sure no guilds to simplify
            Guild.find.mockResolvedValue([]);

            await performContestReminder(mockClient);
            expect(axios.get.mock.calls[0][0]).toBe(process.env.HC_PING_CONTEST_REMINDER);
        });

        it('should ping silent daily check healthcheck before running', async () => {
            process.env.HC_PING_SILENT_CHECK = 'https://hc-ping.com/silent';
            Guild.find.mockResolvedValue([]);

            await performSilentCheck(mockClient);
            expect(axios.get.mock.calls[0][0]).toBe(process.env.HC_PING_SILENT_CHECK);
        });
    });
});