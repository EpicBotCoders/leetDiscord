const Guild = require('../models/Guild');
const TelegramUser = require('../models/TelegramUser');
const {
    initializeGuildConfig,
    addUser,
    removeUser,
    getGuildUsers,
    getGuildConfig
} = require('../core/configManager');
const { getUserCalendar } = require('../services/apiUtils');
const logger = require('../core/logger');

// Mocks
jest.mock('../models/Guild');
jest.mock('../models/TelegramUser');
jest.mock('../core/logger');
jest.mock('../services/apiUtils');

describe('configManager', () => {
    let mockGuild;

    beforeEach(() => {
        jest.clearAllMocks();

        mockGuild = {
            guildId: '123',
            channelId: '456',
            users: new Map([['leetcoder1', '789']]),
            userStats: new Map(),
            save: jest.fn().mockResolvedValue(true),
            markModified: jest.fn()
        };

        Guild.findOne.mockResolvedValue(mockGuild);
        Guild.create.mockResolvedValue(mockGuild);
    });

    describe('initializeGuildConfig', () => {
        it('should create new guild config if not exists', async () => {
            Guild.findOne.mockResolvedValue(null);
            await initializeGuildConfig('999', '888');
            expect(Guild.create).toHaveBeenCalledWith(expect.objectContaining({
                guildId: '999',
                channelId: '888'
            }));
        });

        it('should return existing guild config if exists', async () => {
            const config = await initializeGuildConfig('123', '456');
            expect(config).toEqual(mockGuild);
            expect(Guild.create).not.toHaveBeenCalled();
        });
    });

    describe('addUser', () => {
        it('should add new user with discord ID', async () => {
            getUserCalendar.mockResolvedValue({ streak: 5, totalActiveDays: 10 });

            const result = await addUser('123', 'newuser', '777');
            expect(result).toContain('Added newuser');
            expect(mockGuild.users.get('newuser')).toBe('777');
            expect(mockGuild.save).toHaveBeenCalled();
        });

        it('should not add duplicate user', async () => {
            const result = await addUser('123', 'leetcoder1', '999');
            expect(result).toContain('already being tracked');
            expect(mockGuild.save).not.toHaveBeenCalled();
        });
    });

    describe('removeUser', () => {
        it('should remove existing user', async () => {
            const result = await removeUser('123', 'leetcoder1');
            expect(result).toContain('Removed leetcoder1');
            expect(mockGuild.save).toHaveBeenCalled();
            expect(mockGuild.users.has('leetcoder1')).toBe(false);
        });

        it('should handle non-existent user', async () => {
            const result = await removeUser('123', 'nonexistent');
            expect(result).toContain('not in the tracking list');
            expect(mockGuild.save).not.toHaveBeenCalled();
        });
    });

    describe('getGuildUsers', () => {
        it('should return guild users', async () => {
            const users = await getGuildUsers('123');
            expect(users).toEqual({ 'leetcoder1': '789' });
        });

        it('should return empty object for non-existent guild', async () => {
            Guild.findOne.mockResolvedValue(null);
            const users = await getGuildUsers('nonexistent');
            expect(users).toEqual({});
        });
    });
});