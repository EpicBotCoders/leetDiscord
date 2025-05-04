const mongoose = require('mongoose');

const dailySubmissionSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        index: true
    },
    userId: {
        type: String,
        required: true,
        index: true
    },
    leetcodeUsername: {
        type: String,
        required: true
    },
    date: {
        type: Date,
        required: true,
        index: true
    },
    questionTitle: {
        type: String,
        required: true
    },
    questionSlug: {
        type: String,
        required: true
    },
    difficulty: {
        type: String,
        enum: ['Easy', 'Medium', 'Hard'],
        required: true
    },
    submissionTime: {
        type: Date,
        required: true
    },
    completed: {
        type: Boolean,
        required: true,
        default: false
    },
    streakCount: {
        type: Number,
        required: false,
        default: 0
    }
});

// Compound index for efficient querying of user submissions within a guild
dailySubmissionSchema.index({ guildId: 1, userId: 1, date: -1 });

module.exports = mongoose.model('DailySubmission', dailySubmissionSchema);