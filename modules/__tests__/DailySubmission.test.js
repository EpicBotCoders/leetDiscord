const mongoose = require('mongoose');
const DailySubmission = require('../models/DailySubmission');

jest.mock('../logger', () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn()
}));

describe('DailySubmission Model', () => {
    beforeAll(async () => {
        // Use in-memory MongoDB for tests
        await mongoose.connect(global.__MONGO_URI__);
    });

    afterAll(async () => {
        await mongoose.connection.close();
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
        expect(savedSubmission.questionSlug).toBe(submission.questionSlug);
    });

    it('should not allow duplicate submissions for same user and problem on same day', async () => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const submission = {
            guildId: '123456789',
            userId: '987654321',
            leetcodeUsername: 'testuser',
            date: today,
            questionTitle: 'Two Sum',
            questionSlug: 'two-sum',
            difficulty: 'Easy',
            submissionTime: today
        };

        await DailySubmission.create(submission);

        const existingSubmission = await DailySubmission.findOne({
            guildId: submission.guildId,
            userId: submission.userId,
            questionSlug: submission.questionSlug,
            date: {
                $gte: today,
                $lt: new Date(today.getTime() + 24 * 60 * 60 * 1000)
            }
        });

        expect(existingSubmission).toBeTruthy();
    });

    it('should validate required fields', async () => {
        const invalidSubmission = {
            guildId: '123456789',
            // Missing required fields
        };

        await expect(DailySubmission.create(invalidSubmission)).rejects.toThrow();
    });

    it('should validate difficulty enum', async () => {
        const invalidDifficulty = {
            guildId: '123456789',
            userId: '987654321',
            leetcodeUsername: 'testuser',
            date: new Date(),
            questionTitle: 'Two Sum',
            questionSlug: 'two-sum',
            difficulty: 'Invalid',
            submissionTime: new Date()
        };

        await expect(DailySubmission.create(invalidDifficulty)).rejects.toThrow();
    });
});