const mongoose = require('mongoose');

const UserProfileSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true },
    displayName: String,
    avatar: String,
    ranking: Number,
    reputation: Number,
    contributionPoints: Number,
    skillTags: [String],
    aboutMe: String,
    stats: {
        all: { count: Number, submissions: Number },
        easy: { count: Number, submissions: Number },
        medium: { count: Number, submissions: Number },
        hard: { count: Number, submissions: Number }
    },
    badges: [{
        id: String,
        name: String,
        shortName: String,
        displayName: String,
        icon: String,
        hoverText: String,
        creationDate: String,
        category: String
    }],
    lastUpdated: { type: Date, default: Date.now }
});

module.exports = mongoose.model('UserProfile', UserProfileSchema);
