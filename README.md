# LeetDiscord Bot

This Discord bot tracks LeetCode activity for specified users and posts updates to Discord channels. It supports multiple servers (guilds) with per-server configurations, storing data in MongoDB Atlas.

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
- `/managecron` - Manage scheduled check times (requires Manage Channels permission)
  - `/managecron add` - Add a new check time (24h format)
  - `/managecron remove` - Remove an existing check time
  - `/managecron list` - List all scheduled check times

## Features

- Multi-server support with independent configurations
- MongoDB Atlas integration for reliable data storage
- Per-server announcement channels
- Optional Discord user mentions when reporting challenge status
- Flexible cron job management for check schedules
- Detailed problem information in status updates:
  - Problem difficulty
  - Topic tags
  - Acceptance rate
  - Direct link to problem
- Winston-based logging system
- Automated user tracking and status updates

## Environment Variables

| Variable | Description |
|----------|-------------|
| DISCORD_TOKEN | Your Discord bot token |
| MONGODB_URI | MongoDB Atlas connection string |
| NODE_ENV | Set to 'production' for production logging levels |

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

## Security Notes

- Never commit your `.env` file or `config.json` to version control
- Add both files to your `.gitignore`
- Keep your MongoDB connection string private
- Use appropriate Discord bot token restrictions

## Changelog

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

## Contributing

Feel free to submit issues and enhancement requests!

