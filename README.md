# LeetDiscord Bot Setup

This Discord bot tracks LeetCode activity for specified users and posts updates to Discord channels. It supports multiple servers (guilds) with per-server configurations.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- A Discord bot token (from [Discord Developer Portal](https://discord.com/developers/applications))

## Setup Instructions

1. Clone this repository to your local machine

2. Install dependencies:
```bash
npm install
```

3. Create a `config.json` file in the root directory with the following structure:
```json
{
    "token": "YOUR_DISCORD_BOT_TOKEN",
    "guilds": {
        "GUILD_ID": {
            "channelId": "ANNOUNCEMENT_CHANNEL_ID",
            "users": {
                "leetcode_username1": "optional_discord_id",
                "leetcode_username2": null
            },
            "cronJobs": [
                {
                    "schedule": "0 10 * * *",
                    "task": "runCheck"
                },
                {
                    "schedule": "0 18 * * *",
                    "task": "runCheck"
                }
            ]
        }
    }
}
```

Replace:
- `YOUR_DISCORD_BOT_TOKEN` with your Discord bot token
- The guilds object will be automatically populated as the bot joins servers

4. Start the bot:
```bash
node index.js
```

## Server Setup

When the bot joins a new server:
1. It will automatically create initial configuration for the server
2. Use the `/setchannel` command to set the announcement channel
3. Use `/adduser` to start tracking LeetCode users

## Available Commands

- `/setchannel` - Set the channel for LeetCode activity announcements (requires Manage Channels permission)
- `/adduser` - Add a LeetCode username to track (optionally link to a Discord user)
- `/removeuser` - Remove a LeetCode username from tracking
- `/listusers` - List all tracked users in the server
- `/check` - Manually trigger a check of today's LeetCode challenge status

## Features

- Multi-server support with independent configurations
- Per-server announcement channels
- Optional Discord user mentions when reporting challenge status
- Configurable reminder schedules per server
- Automated user tracking and status updates

## Security Note
Never commit your `config.json` with real token values to version control. Add it to your `.gitignore` file.

