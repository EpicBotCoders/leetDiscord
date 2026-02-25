# Copilot Instructions for LeetDiscord Bot

## Project Overview
- **LeetDiscord** is a Discord bot for tracking LeetCode activity, posting updates to Discord channels, and managing user stats across multiple servers (guilds).
- **Backend:** Node.js (main logic in root and `modules/`)
- **Frontend:** Next.js app in `frontend/` (UI components, not directly tied to bot logic)
- **Database:** MongoDB Atlas (cloud, not local)
- **Key Integrations:** Discord.js, MongoDB, Telegram (for notifications)

## Architecture & Data Flow
- **Entry Point:** `index.js` (bot startup, command registration, event listeners)
- **Modules:**
  - `modules/` contains all bot logic (API, commands, scheduling, logging, DB models)
  - `models/` (inside `modules/`): Mongoose schemas for MongoDB
  - `frontend/`: Next.js app for web UI (optional, not required for bot operation)
- **Data Flow:**
  - Discord events → Command handlers → MongoDB (via Mongoose) → Discord responses
  - LeetCode API → Bot → MongoDB → Discord
  - Telegram integration via `telegramBot.js`

## Developer Workflows
- **Start Bot:** `node index.js` (requires `.env` with `DISCORD_TOKEN`, `MONGODB_URI`)
- **Run All Tests:** `npm test` (Jest, covers backend logic)
- **Watch Tests:** `npm run test:watch`
- **Coverage Report:** `npm run test:coverage`
- **Frontend Dev:** `cd frontend && npm run dev` (for Next.js UI)
- **Migrations:** See `scripts/` for migration utilities (e.g., `migrate-to-mongodb.js`)

## Project-Specific Conventions
- **Commands:** All bot commands are Discord slash commands (see `/help` for full list)
- **Config:** Per-server (guild) config is stored in MongoDB, not in local files
- **Logging:** Uses Winston, logs to `logs/` directory
- **Testing:** Uses in-memory MongoDB and mocks for Discord.js/axios
- **Scheduling:** Cron jobs managed via `/managecron` commands, not OS-level cron
- **Error Handling:** All errors logged to `logs/error.log`, user-facing errors sent as Discord messages
- **Environment:** All secrets/config via `.env` (never hardcode tokens/URIs)

## Integration Points
- **Discord.js:** Handles all bot interactions and events
- **MongoDB:** All persistent data (users, configs, submissions)
- **LeetCode API:** Fetches daily challenge and user submissions
- **Telegram:** Optional user notifications (see `/telegram` commands)

## Key Files & Directories
- `index.js`: Bot entry point
- `modules/`: Core logic (commands, scheduling, API, logging)
- `modules/models/`: Mongoose schemas
- `frontend/`: Next.js UI (optional)
- `scripts/`: Migration and utility scripts
- `logs/`: Log output (errors, combined)
- `.env`: Required for secrets (not committed)
- `modules/commandRegistration.js`: Command definitions and registration logic
- `README.md`: Full setup documentation

## Examples
- **Add tracked user:** `/adduser leetcode_username @DiscordUser`
- **Set announcement channel:** `/setchannel #channel`
- **Schedule daily check:** `/managecron add hours:10 minutes:0`
- **Run tests:** `npm test`

## Tips for AI Agents
- Always check MongoDB for config/state, not local files
- Use Discord slash commands for all user interactions
- Follow logging and error conventions (Winston, logs/)
- Reference `modules/commandRegistration.js` for command details and workflows

## Additional Caveats & Best Practices

- **Config Changes:**  
  Whenever you add or modify any config-related feature, you must also update the relevant config command embed (and help text) to reflect the new or changed data. This ensures users see accurate, up-to-date information in Discord and in `/help`.
- **Admin-Only Commands:**  
  If you add a command that should be admin-only, always confirm with the user if admin restriction is required. Enforce permission checks (e.g., `MANAGE_GUILD`, `ADMINISTRATOR`) in the command handler and provide clear denial messages if permissions are insufficient.
- **Command Registration & Help:**  
  When adding or changing commands, update both the command registration logic and command embeds.
- **Logging:**  
  All config/admin actions and errors must be logged using Winston (`modules/logger.js`).  
- **Scheduling:**  
  If your change affects scheduling or cron jobs, ensure `/managecron` and related scheduling logic are updated.
- **Documentation:**  
  Never store config or secrets in local files; always use MongoDB and `.env`.  
  Update documentation and help text for any workflow or feature changes.