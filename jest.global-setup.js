const { MongoMemoryServer } = require('mongodb-memory-server');
const mongoose = require('mongoose');

module.exports = async () => {
    const mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    
    // Set the MongoDB URI for tests
    global.__MONGO_URI__ = uri;
    global.__MONGOD__ = mongod;

    // Create mongoose connection
    await mongoose.connect(uri);

    // Clean up function
    global.__CLEANUP__ = async () => {
        await mongoose.connection.close();
        await mongod.stop();
    };
};