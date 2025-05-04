module.exports = {
    testEnvironment: 'node',
    testMatch: ['**/*.test.js'],
    collectCoverage: true,
    coverageReporters: ['text', 'lcov'],
    coverageDirectory: 'coverage',
    coveragePathIgnorePatterns: [
        '/node_modules/',
        '/coverage/',
        '/.git/',
        '/logs/'
    ],
    verbose: true,
    setupFilesAfterEnv: ['./jest.setup.js'],
    testTimeout: 30000, // Increased timeout for MongoDB operations
    globalSetup: './jest.global-setup.js'
};