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
    cronJobs: [{
        schedule: {
            type: String,
            required: true
        },
        task: {
            type: String,
            required: true
        }
    }]
});

module.exports = mongoose.model('Guild', guildSchema);