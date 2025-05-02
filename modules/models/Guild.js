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