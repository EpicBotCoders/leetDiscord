const { MongoMemoryServer } = require('mongodb-memory-server');

// Set up timezone for consistent testing
process.env.TZ = 'UTC';

// Mock environment variables
process.env.NODE_ENV = 'test';

let mongod;

beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    const uri = mongod.getUri();
    global.__MONGO_URI__ = uri;
});

afterAll(async () => {
    if (mongod) {
        await mongod.stop();
    }
});