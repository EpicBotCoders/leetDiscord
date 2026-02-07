const mongoose = require('mongoose');

const telegramUserSchema = new mongoose.Schema({
    userId: {
        type: String,
        unique: true,
        sparse: true // Allow null/undefined to not conflict, though we usually expect it
    },
    leetcodeUsername: {
        type: String,
        required: true,
        unique: true
    },
    telegramChatId: {
        type: String,
        default: null
    },
    isEnabled: {
        type: Boolean,
        default: true
    },
    tempToken: {
        type: String,
        default: null
    },
    tokenExpires: {
        type: Date,
        default: null
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    lastUpdated: {
        type: Date,
        default: Date.now
    }
});

// Update lastUpdated timestamp on save
telegramUserSchema.pre('save', function (next) {
    this.lastUpdated = new Date();
    next();
});

module.exports = mongoose.model('TelegramUser', telegramUserSchema);
