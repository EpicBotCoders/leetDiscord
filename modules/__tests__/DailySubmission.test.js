const mongoose = require('mongoose');
const { MongoMemoryServer } = require('mongodb-memory-server');
const DailySubmission = require('../models/DailySubmission');

jest.mock('../core/logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

describe('DailySubmission Model', () => {
    let mongod;

    beforeAll(async () => {
        // Fallback to starting own server if global one didn't start in time
        let uri = global.__MONGO_URI__ || globalThis.__MONGO_URI__;
        if (!uri) {
            mongod = await MongoMemoryServer.create();
            uri = mongod.getUri();
        }
        await mongoose.connect(uri);
    });

    afterAll(async () => {
        await mongoose.connection.close();
        if (mongod) {
            await mongod.stop();
        }
    });

    beforeEach(async () => {
        await DailySubmission.deleteMany({});
        jest.clearAllMocks();
    });

    it('should create a valid submission', async () => {
        const submission = {
            guildId: '123456789',
            userId: '987654321',
            leetcodeUsername: 'testuser',
            date: new Date(),
            questionTitle: 'Two Sum',
            questionSlug: 'two-sum',
            difficulty: 'Easy',
            submissionTime: new Date()
        };

        const savedSubmission = await DailySubmission.create(submission);
        expect(savedSubmission.guildId).toBe(submission.guildId);
        expect(savedSubmission.leetcodeUsername).toBe(submission.leetcodeUsername);
    });
});