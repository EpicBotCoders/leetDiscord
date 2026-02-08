const fs = require('fs').promises;
const path = require('path');

// Mock winston logger before requiring any modules that use it
jest.mock('../logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    stream: {
        write: jest.fn()
    }
}));

// Mock fs module using a factory function
jest.mock('fs', () => {
    const mocked = {
        promises: {
            readFile: jest.fn(),
            writeFile: jest.fn().mockResolvedValue(undefined)
        },
        existsSync: jest.fn().mockReturnValue(true)
    };
    return mocked;
});

// Import after mocking dependencies
const { 
    loadConfig, 
    initializeGuildConfig, 
    addUser, 
    removeUser, 
    getGuildUsers 
} = require('../configManager');

describe('configManager', () => {
    const mockConfig = {
        token: 'test-token',
        guilds: {
            '123': {
                channelId: '456',
                users: {
                    'leetcoder1': '789',
                    'leetcoder2': null
                },
                cronJobs: [
                    { schedule: '0 10 * * *', task: 'runCheck' }
                ]
            }
        }
    };

    beforeEach(() => {
        jest.clearAllMocks();
        // Mock readFile to return our mock config
        fs.readFile.mockResolvedValue(JSON.stringify(mockConfig));
        fs.writeFile.mockResolvedValue(undefined);
    });

    describe('loadConfig', () => {
        it('should load and parse config file', async () => {
            const config = await loadConfig();
            expect(config).toEqual(mockConfig);
            expect(fs.readFile).toHaveBeenCalled();
        });

        it('should throw error if config file is invalid', async () => {
            fs.readFile.mockRejectedValueOnce(new Error('Invalid JSON'));
            await expect(loadConfig()).rejects.toThrow();
        });
    });

    describe('initializeGuildConfig', () => {
        it('should create new guild config if not exists', async () => {
            const newGuildId = '999';
            const channelId = '888';
            const config = await initializeGuildConfig(newGuildId, channelId);

            expect(config).toHaveProperty('channelId', channelId);
            expect(config).toHaveProperty('users', {});
            expect(config).toHaveProperty('cronJobs');
            expect(fs.writeFile).toHaveBeenCalled();
        });

        it('should return existing guild config if exists', async () => {
            const config = await initializeGuildConfig('123', '456');
            expect(config).toEqual(mockConfig.guilds['123']);
            expect(fs.writeFile).not.toHaveBeenCalled();
        });
    });

    describe('addUser', () => {
        it('should add new user with discord ID', async () => {
            const result = await addUser('123', 'newuser', '777');
            expect(result).toContain('Added newuser');
            expect(fs.writeFile).toHaveBeenCalled();
        });

        it('should not add duplicate user', async () => {
            const result = await addUser('123', 'leetcoder1', '999');
            expect(result).toContain('already being tracked');
            expect(fs.writeFile).not.toHaveBeenCalled();
        });
    });

    describe('removeUser', () => {
        it('should remove existing user', async () => {
            const result = await removeUser('123', 'leetcoder1');
            expect(result).toContain('Removed leetcoder1');
            expect(fs.writeFile).toHaveBeenCalled();
        });

        it('should handle non-existent user', async () => {
            const result = await removeUser('123', 'nonexistent');
            expect(result).toContain('not in the tracking list');
            expect(fs.writeFile).not.toHaveBeenCalled();
        });
    });

    describe('getGuildUsers', () => {
        it('should return guild users', async () => {
            const users = await getGuildUsers('123');
            expect(users).toEqual(mockConfig.guilds['123'].users);
        });

        it('should return empty object for non-existent guild', async () => {
            const users = await getGuildUsers('nonexistent');
            expect(users).toEqual({});
        });
    });
});