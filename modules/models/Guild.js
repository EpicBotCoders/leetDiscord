const mongoose = require('mongoose');

const guildSchema = new mongoose.Schema({
    guildId: {
        type: String,
        required: true,
        unique: true
    },
    channelId: {
        type: String,
        required: true
    },
    adminRoleId: {
        type: String,
        default: null
    },
    users: {
        type: Map,
        of: String,
        default: {}
    },
    userStats: {
        type: Map,
        of: {
            streak: { type: Number, default: 0 },
            totalActiveDays: { type: Number, default: 0 },
            activeYears: { type: [Number], default: [] },
            lastUpdated: { type: Date, default: null }
        },
        default: {}
    },
    telegramUsers: {
        type: Map,
        of: {
            chatId: { type: String, default: null },
            username: { type: String, required: true }, // LeetCode username
            enabled: { type: Boolean, default: true },
            tempToken: { type: String, default: null },
            tokenExpires: { type: Date, default: null }
        },
        default: {}
    },
    cronJobs: [{
        schedule: {
            type: String,
            required: true
        },
        task: {
            type: String,
            required: true
        }
    }],
    broadcastEnabled: {
        type: Boolean,
        default: true
    },
    contestReminderEnabled: {
        type: Boolean,
        default: false
    }
});

module.exports = mongoose.model('Guild', guildSchema);