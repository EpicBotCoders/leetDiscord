const mongoose = require('mongoose');

const broadcastLogSchema = new mongoose.Schema({
    // The Discord user ID of whoever triggered the broadcast
    senderId: {
        type: String,
        required: true,
        index: true
    },
    // The Discord username of the sender (for human-readable lookup)
    senderUsername: {
        type: String,
        required: true
    },
    // Broadcast type: 'info', 'warn', 'alert', or any custom value
    type: {
        type: String,
        required: true
    },
    // The actual message content that was broadcast
    message: {
        type: String,
        required: true
    },
    // How many guilds received it
    successCount: {
        type: Number,
        default: 0
    },
    // How many guilds failed
    failCount: {
        type: Number,
        default: 0
    },
    // When the broadcast was sent
    sentAt: {
        type: Date,
        default: Date.now,
        index: true
    }
});

module.exports = mongoose.model('BroadcastLog', broadcastLogSchema);
