# LeetDiscord Bot Setup

This Discord bot tracks LeetCode activity for specified users and posts updates to a Discord channel.

## Prerequisites

- [Node.js](https://nodejs.org/) (v14 or higher)
- A Discord bot token (from [Discord Developer Portal](https://discord.com/developers/applications))
- Discord channel ID where the bot will post updates

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
    "channelId": "YOUR_DISCORD_CHANNEL_ID",
    "users": [
        "leetcode_username1",
        "leetcode_username2"
    ]
}
```

Replace:
- `YOUR_DISCORD_BOT_TOKEN` with your Discord bot token
- `YOUR_DISCORD_CHANNEL_ID` with the ID of the channel where you want the bot to post
- Add LeetCode usernames to the `users` array

4. Start the bot:
```bash
node index.js
```

## Security Note
Never commit your `config.json` with real token values to version control. Add it to your `.gitignore` file.