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
        index: true,
        set: function(val) {
            // Normalize date to midnight UTC
            const date = new Date(val);
            date.setUTCHours(0, 0, 0, 0);
            return date;
        }
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
        required: true,
        default: 0
    }
});

// Compound index for efficient querying of user submissions within a guild
dailySubmissionSchema.index({ guildId: 1, userId: 1, date: -1 });

// Pre-save middleware to handle streak calculation
dailySubmissionSchema.pre('save', async function(next) {
    try {
        if (this.isNew && this.completed) {
            const yesterday = new Date(this.date);
            yesterday.setDate(yesterday.getDate() - 1);
            yesterday.setUTCHours(0, 0, 0, 0);

            // Find yesterday's submission
            const prevSubmission = await this.constructor.findOne({
                userId: this.userId,
                guildId: this.guildId,
                completed: true,
                date: yesterday
            }).sort({ date: -1 });

            // If there was a submission yesterday, increment streak
            // Otherwise start a new streak at 1
            this.streakCount = prevSubmission ? prevSubmission.streakCount + 1 : 1;
        } else if (!this.completed) {
            // Reset streak if submission is marked as incomplete
            this.streakCount = 0;
        }
        next();
    } catch (error) {
        next(error);
    }
});

module.exports = mongoose.model('DailySubmission', dailySubmissionSchema);