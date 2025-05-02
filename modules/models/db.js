const mongoose = require('mongoose');
const logger = require('../logger');
require('dotenv').config();

async function connectDB() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        logger.info('Connected to MongoDB Atlas');
    } catch (error) {
        logger.error('MongoDB connection error:', error);
        process.exit(1);
    }
}

module.exports = { connectDB };