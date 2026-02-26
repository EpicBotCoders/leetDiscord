# LeetDiscord Bot

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Contributor Covenant](https://img.shields.io/badge/Contributor%20Covenant-2.1-4baaaa.svg)](CODE_OF_CONDUCT.md)
[![Security Policy](https://img.shields.io/badge/Security-Policy-red.svg)](SECURITY.md)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D14-brightgreen)](https://nodejs.org)
[![Discord](https://img.shields.io/discord/1471127554386690232?style=flat&logo=discord&label=Support%20Server)](https://discord.gg/4t5zg5SV69)
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
  - [Quick Start](#quick-start)
  - [Server Setup](#server-setup)
  - [Available Commands](#available-commands)
    - [Setup Commands](#setup-commands)
    - [User Management Commands](#user-management-commands)
    - [Scheduling Commands](#scheduling-commands)
    - [Monitoring Commands](#monitoring-commands)
    - [Information Commands](#information-commands)
    - [Notification Commands](#notification-commands)
  - [Command Workflow](#command-workflow)
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
    - [v2.2.0 (2026-02-07)](#v220-2026-02-07)
    - [v2.1.0 (2025-05-04)](#v210-2025-05-04)
    - [v2.0.0 (2025-05-02)](#v200-2025-05-02)
    - [v1.0.0](#v100)

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- A Discord bot token (from [Discord Developer Portal](https://discord.com/developers/applications))
- MongoDB Atlas account (free tier works fine)

## Quick Start

Follow these steps to get your bot up and running:

### 1. Clone and Install

```bash
git clone https://github.com/mochiron-desu/leetDiscord.git
cd leetDiscord
npm install
```

### 2. Create Discord Bot

1. Go to [Discord Developer Portal](https://discord.com/developers/applications)
2. Click "New Application" and give it a name
3. Navigate to the "Bot" section
4. Click "Add Bot"
5. Under "Token", click "Copy" to get your bot token
6. **Important**: Enable the following Privileged Gateway Intents:
   - Server Members Intent
   - Message Content Intent

### 3. Set Up MongoDB Atlas

1. Create a free account at [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Create a new cluster (free M0 tier is sufficient)
3. Set up database access:
   - Create a database user with read/write permissions
   - Note down the username and password
4. Set up network access:
   - Add your IP address (or use `0.0.0.0/0` for testing)
5. Click "Connect" → "Connect your application"
6. Copy the connection string

### 4. Configure Environment Variables

Create a `.env` file in the root directory:

```env
DISCORD_TOKEN=your_discord_bot_token
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/leetdiscord?retryWrites=true&w=majority
NODE_ENV=production
```

Replace:
- `your_discord_bot_token` with the token from Discord Developer Portal
- `username:password` with your MongoDB credentials
- `cluster.mongodb.net` with your cluster URL

### 5. Invite Bot to Your Server

1. In Discord Developer Portal, go to "OAuth2" → "URL Generator"
2. Select scopes: `bot` and `applications.commands`
3. Select bot permissions:
   - View Channels
   - Send Messages
   - Embed Links
   - Manage Channels (for admins setting up the bot)
4. Copy the generated URL and open it in your browser
5. Select your server and authorize

### 6. Start the Bot

```bash
node index.js
```

You should see:
```
Bot is ready!
Started refreshing application (/) commands.
Successfully reloaded application (/) commands.
Bot initialization complete
```

### 7. Initial Server Configuration

In your Discord server, run these commands to get started:

1. **Set announcement channel**: `/setchannel #your-channel`
2. **Add users to track**: `/adduser username @DiscordUser`
3. **Set up automatic checks** (optional): `/managecron add hours:10 minutes:0`
4. **Test it out**: `/check`

**Need help?** Use `/help` in Discord to see all available commands!

## Server Setup

When the bot joins a new server:
1. It will automatically create initial configuration in MongoDB
2. The bot will send a welcome message explaining how to get started
3. Use the `/setchannel` command to set the announcement channel
4. Use `/adduser` to start tracking LeetCode users

## Available Commands

All commands are available as Discord slash commands. Type `/` in Discord to see the autocomplete list.

For detailed command documentation, parameters, and usage examples, please refer to our **[Command Documentation](https://leetdiscord.onrender.com/docs)** in the frontend app. You can also use `/help` in Discord to view all available commands directly.

## Command Workflow

Understanding how commands interact with each other:

```mermaid
graph TD
    A[Bot Joins Server] --> B[/setchannel]
    B --> C{Guild Configured}
    C -->|Yes| D[/adduser]
    C -->|Yes| E[/managecron]
    D --> F[Users Tracked]
    E --> G[Schedule Set]
    F --> H[/check]
    G --> H
    H --> I[Results Posted]
    I --> J[MongoDB Update]
    
    style B fill:#ffd700
    style D fill:#90EE90
    style E fill:#87CEEB
    style H fill:#FFB6C1
```

**Flow Explanation**:

1. **Initial Setup** (`/setchannel`)
   - Creates guild configuration in MongoDB
   - Sets announcement channel
   - Enables all other commands

2. **User Management** (`/adduser`, `/removeuser`)
   - Requires configured guild
   - Stores user mappings in database
   - Links LeetCode accounts to Discord users

3. **Scheduling** (`/managecron`)
   - Sets up automated checks using cron jobs
   - Multiple check times can be configured
   - Automatically triggers `/check` functionality

4. **Monitoring** (`/check`)
   - Can be triggered manually or automatically
   - Queries LeetCode GraphQL API for:
     - Today's daily challenge
     - User submission history
   - Checks against MongoDB for duplicate tracking
   - Posts formatted embed to announcement channel
   - Records submissions in database

**Data Flow**:
- **LeetCode API** → Bot → **MongoDB** → Discord Channel
- Cached API responses for performance
- Submission tracking prevents duplicates

## Features

- Multi-server support with independent configurations
- MongoDB Atlas integration for reliable data storage
- Per-server announcement channels
- Automated welcome message with setup instructions
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
| HC_PING_CONTEST_REMINDER | *(optional)* URL that will be GET‑pinged whenever the contest reminder job runs |
| HC_PING_SILENT_CHECK | *(optional)* URL that will be GET‑pinged before each silent daily check |
| HC_PING_STATS_PANEL | *(optional)* URL that will be GET‑pinged when the stats panel is updated |
| HC_PING_SERVER_LEADERBOARD | *(optional)* URL that will be GET‑pinged when the server leaderboard is updated |

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

### v2.2.0 (2026-02-07)
- 🔔 **Telegram Integration**:
  - Connect Telegram account for personal notifications
  - Receive reminders for incomplete daily challenges
  - Manage notification preferences
- 📊 **Enhanced Statistics**:
  - Added `/leetstats` command for detailed user logic
  - Support for server-wide statistics view
  - Track streaks, active days, and more
- ℹ️ **Dynamic Help Command**:
  - Help strings are now dynamically generated from command definitions
  - Always up-to-date with available commands
- 🐛 **Bug Fixes**:
  - Improved error handling for unconfigured guilds
  - Fixed issues with Telegram linking

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

