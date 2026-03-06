const { initializePresence, updatePresence, stopPresence, resetState } = require('../presenceManager');
const { ActivityType, PresenceUpdateStatus } = require('discord.js');
const Guild = require('../models/Guild');

// Mock dependencies
jest.mock('../models/Guild');
jest.mock('../logger');

describe('Presence Manager', () => {
    let mockClient;

    beforeEach(() => {
        jest.useFakeTimers();
        resetState();
        mockClient = {
            user: {
                setPresence: jest.fn()
            }
        };
        Guild.countDocuments.mockResolvedValue(5);
    });

    afterEach(() => {
        stopPresence();
        jest.clearAllMocks();
        jest.useRealTimers();
    });

    test('updatePresence sets the correct activity', async () => {
        await updatePresence(mockClient);

        expect(mockClient.user.setPresence).toHaveBeenCalledWith({
            activities: [expect.objectContaining({
                name: expect.stringContaining('5 servers'),
                type: ActivityType.Playing
            })],
            status: PresenceUpdateStatus.Online
        });
    });

    test('updatePresence rotates activities', async () => {
        // First call
        await updatePresence(mockClient);
        expect(mockClient.user.setPresence).toHaveBeenLastCalledWith(
            expect.objectContaining({
                activities: [expect.objectContaining({ type: ActivityType.Playing })]
            })
        );

        // Second call
        await updatePresence(mockClient);
        expect(mockClient.user.setPresence).toHaveBeenLastCalledWith(
            expect.objectContaining({
                activities: [expect.objectContaining({ type: ActivityType.Listening })]
            })
        );
    });

    test('initializePresence sets up an interval', async () => {
        initializePresence(mockClient);

        // Process all pending promises/timers
        await Promise.resolve();
        jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Should have called updatePresence immediately
        expect(mockClient.user.setPresence).toHaveBeenCalledTimes(1);

        // Fast-forward 10 minutes
        jest.advanceTimersByTime(600000);
        await Promise.resolve();
        jest.runOnlyPendingTimers();
        await Promise.resolve();

        // Should have updated again
        expect(mockClient.user.setPresence).toHaveBeenCalledTimes(2);
    });
});
