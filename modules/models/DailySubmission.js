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
    }
});

// Compound index for efficient querying of user submissions within a guild
dailySubmissionSchema.index({ guildId: 1, userId: 1, date: -1 });

// Unique index to prevent duplicate submissions for the same user/problem/day
// Uses leetcodeUsername (not userId) as the canonical identity, since userId is
// inconsistently populated (sometimes Discord snowflake, sometimes LeetCode username)
dailySubmissionSchema.index(
    { guildId: 1, leetcodeUsername: 1, questionSlug: 1, date: 1 },
    { unique: true }
);

module.exports = mongoose.model('DailySubmission', dailySubmissionSchema);