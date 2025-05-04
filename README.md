# LeetDiscord Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/Security-Policy-red.svg)](SECURITY.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14-brightgreen)](https://nodejs.org)
[![Discord.js](https://img.shields.io/badge/discord.js-v14.19.2-blue.svg)](https://discord.js.org)
[![MongoDB](https://img.shields.io/badge/MongoDB-%234ea94b.svg?logo=mongodb&logoColor=white)](https://www.mongodb.com/)
[![Jest](https://img.shields.io/badge/tested_with-jest-99424f.svg?logo=jest)](https://jestjs.io)
[![ESLint](https://img.shields.io/badge/ESLint-4B3263?logo=eslint&logoColor=white)](https://eslint.org)
[![Winston Logger](https://img.shields.io/badge/logger-winston-green.svg)](https://github.com/winstonjs/winston)
[![GitHub last commit](https://img.shields.io/github/last-commit/mochiron-desu/leetDiscord)](https://github.com/mochiron-desu/leetDiscord)
[![Test Coverage](https://img.shields.io/badge/coverage-jest-green.svg)](coverage/lcov-report/index.html)

This Discord bot tracks LeetCode activity for specified users and posts updates to Discord channels. It supports multiple servers (guilds) with per-server configurations, storing data in MongoDB Atlas.

## Table of Contents
- [LeetDiscord Bot](#leetdiscord-bot)
  - [Table of Contents](#table-of-contents)
  - [Prerequisites](#prerequisites)
  - [Setup Instructions](#setup-instructions)
  - [Server Setup](#server-setup)
  - [Available Commands](#available-commands)
  - [Features](#features)
  - [Environment Variables](#environment-variables)
  - [Security](#security)
  - [Error Handling](#error-handling)
  - [Data Migration](#data-migration)
  - [Contributing](#contributing)
  - [Code of Conduct](#code-of-conduct)
  - [Security](#security-1)
  - [Testing](#testing)
    - [Test Coverage](#test-coverage)
    - [Running Specific Tests](#running-specific-tests)
  - [License](#license)
  - [Changelog](#changelog)
    - [v2.1.1 (2025-05-04)](#v211-2025-05-04)
    - [v2.1.0 (2025-05-04)](#v210-2025-05-04)
    - [v2.0.0 (2025-05-02)](#v200-2025-05-02)
    - [v1.0.0](#v100)

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- A Discord bot token (from [Discord Developer Portal](https://discord.com/developers/applications))
- MongoDB Atlas account (free tier works fine)

## Setup Instructions

1. Clone this repository to your local machine

2. Install dependencies:
```bash
npm install
```

3. Create a `.env` file in the root directory with:
```env
DISCORD_TOKEN=your_discord_bot_token
MONGODB_URI=your_mongodb_connection_string
```

Replace:
- `your_discord_bot_token` with your Discord bot token
- `your_mongodb_connection_string` with your MongoDB Atlas connection string

4. Start the bot:
```bash
node index.js
```

## Server Setup

When the bot joins a new server:
1. It will automatically create initial configuration in MongoDB
2. Use the `/setchannel` command to set the announcement channel
3. Use `/adduser` to start tracking LeetCode users

## Available Commands

- `/setchannel` - Set the channel for LeetCode activity announcements (requires Manage Channels permission)
- `/adduser` - Add a LeetCode username to track (optionally link to a Discord user)
- `/removeuser` - Remove a LeetCode username from tracking
- `/listusers` - List all tracked users in the server
- `/check` - Manually trigger a check of today's LeetCode challenge status
- `/botinfo` - Display information about the bot and its GitHub repository
- `/managecron` - Manage scheduled check times (requires Manage Channels permission)
  - `/managecron add` - Add a new check time (24h format)
  - `/managecron remove` - Remove an existing check time
  - `/managecron list` - List all scheduled check times

## Features

- Multi-server support with independent configurations
- MongoDB Atlas integration for reliable data storage
- Per-server announcement channels
- Automated welcome message with setup instructions
- Advanced Streak Tracking System:
  - Daily streak counting
  - Automatic streak maintenance
  - Streak preservation across timezone boundaries
  - Streak reset on missed days
  - Per-guild streak leaderboards
- Submission Tracking and Validation:
  - Normalized UTC timestamp handling
  - Duplicate submission prevention
  - Accurate streak counting with date normalization
  - Complete submission history
- User Progress Features:
  - Daily challenge completion tracking
  - Individual streak statistics
  - Weekly and monthly completion rates
  - Server-wide leaderboards
- Permission-based command system:
  - Users can add/remove themselves
  - Admins can manage all users
  - Channel management requires "Manage Channels" permission
  - Optional Discord user mentions when reporting challenge status
- Flexible cron job management for check schedules
- Detailed problem information in status updates:
  - Problem difficulty
  - Topic tags
  - Acceptance rate
  - Direct link to problem
- Complete submission tracking:
  - Daily challenge completion history
  - Submission timestamps
  - Problem difficulty tracking
  - Duplicate submission prevention
  - Built-in retry and error handling
- Robust timestamp handling:
  - Support for Unix timestamps
  - Support for ISO string dates
  - Fallback handling for invalid dates
- Permission handling:
  - Automatic permission checks
  - Guild owner notifications for permission issues
  - Detailed error feedback
- Winston-based logging system with:
  - Error tracking
  - Warning notifications
  - Debug information
  - Activity logging
- Automated user tracking and status updates

## Environment Variables

| Variable | Description |
|----------|-------------|
| DISCORD_TOKEN | Your Discord bot token |
| MONGODB_URI | MongoDB Atlas connection string |
| NODE_ENV | Set to 'production' for production logging levels |

## Security

For details about our security practices and how to report security issues, please see our [Security Policy](SECURITY.md).

## Error Handling

- The bot includes comprehensive error logging
- All errors are logged to `logs/error.log`
- General activity is logged to `logs/combined.log`
- Console output includes colorized logging for better visibility

## Data Migration

If you're upgrading from a previous version that used config.json:

1. The migration script will automatically:
   - Move guild configurations to MongoDB
   - Create a backup of your config.json as config.json.bak
   - Update config.json to only contain the bot token
2. After migration, update your environment variables in .env

## Contributing

We love contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for details on how to:
- Set up your development environment
- Run tests
- Submit pull requests
- Report bugs
- Propose new features

## Code of Conduct

We are committed to fostering an open and welcoming environment. Please read and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

## Security

For details about our security practices and how to report security issues, please see our [Security Policy](SECURITY.md).

## Testing

The project includes a comprehensive test suite using Jest. To run the tests:

```bash
npm test
```

### Test Coverage

Tests cover all major functionality including:
- DailySubmission model validation
- Timestamp parsing and handling
- Permission checks and error handling
- API interactions and response handling
- Database operations
- Discord message handling

The test suite uses:
- mongodb-memory-server for database testing
- axios-mock-adapter for API mocking
- Jest mocks for Discord.js interactions
- Winston logger mocking
- Comprehensive assertion coverage

Test coverage reports are available in the coverage/ directory after running tests.

### Running Specific Tests

Run a specific test suite:
```bash
npm test -- apiUtils
```

Watch mode for development:
```bash
npm run test:watch
```

Generate coverage report:
```bash
npm run test:coverage
```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### v2.1.1 (2025-05-04)
- ✨ Enhanced streak tracking system
  - Improved date handling with UTC normalization
  - Fixed streak counting across timezone boundaries
  - Added streak preservation logic
  - Enhanced duplicate submission detection
- 🔄 Improved submission validation
- 📊 Added per-guild leaderboards
- ⚡️ Optimized database queries
- 🐛 Fixed streak reset issues

### v2.1.0 (2025-05-04)
- ✨ Added submission tracking with MongoDB
- 🎉 Added welcome message when bot joins a server
- ➕ Added /botinfo command for quick bot information access
- 🔄 Improved timestamp handling with support for:
  - Unix timestamps (seconds/milliseconds)
  - ISO string dates
  - Fallback handling for invalid dates
- 🔒 Enhanced permission handling:
  - Automatic permission checks before sending messages
  - Guild owner notifications for permission issues
  - Detailed error feedback
- 🧪 Added comprehensive test coverage:
  - MongoDB integration tests
  - Timestamp parsing tests
  - Permission handling tests
  - API interaction mocks
- 📝 Improved error logging and debugging
- ⚡️ Added duplicate submission prevention
- 🚀 Added retry mechanisms for API failures

### v2.0.0 (2025-05-02)
- 🎉 Migrated from JSON file storage to MongoDB Atlas
- ✨ Added flexible cron job management with /managecron command
- 🔄 Enhanced status updates with detailed problem information
- 📝 Improved logging system with Winston
- 🔒 Moved sensitive data to environment variables
- 🐛 Fixed user tracking and removal issues
- 🚀 Improved error handling and interaction responses
- 📊 Added debug logging for better troubleshooting

### v1.0.0
- Initial release with JSON-based configuration
- Basic LeetCode activity tracking
- Multi-server support
- User management commands
- Scheduled checks

