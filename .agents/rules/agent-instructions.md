---
trigger: always_on
---

# Agent Instructions for LeetDiscord Bot

**IMPORTANT INSTRUCTION FOR AI AGENTS:** 
You must update this file (`.agents/rules/agent-instructions.md`) anytime anything major is updated in the project or a new feature is added. This ensures the documentation remains the single source of truth for the bot's capabilities and tech stack.

---

## Project Overview
**LeetDiscord** is a Discord bot designed for tracking LeetCode activity, posting updates to Discord channels, and managing user statistics across multiple servers (guilds).

## Tech Stack
- **Backend:** Node.js (Core bot logic resides in the root directory and the `modules/` folder).
- **Frontend:** Next.js application in the `frontend/` directory (Provides optional web UI components, independent of core bot operation).
- **Database:** MongoDB Atlas (Cloud-hosted). MongoDB models/schemas are defined using Mongoose in `modules/models/`.
- **Key Libraries & Integrations:**
  - **Discord.js:** Main library for interacting with the Discord API and handling slash commands/events.
  - **Mongoose:** Object Data Modeling (ODM) library for MongoDB functionality.
  - **Telegram Integration:** Provides cross-platform notifications to users (`modules/services/telegramBot.js`).
  - **LeetCode API:** Interactions with LeetCode API endpoints for fetching daily challenges and user submissions (`modules/services/apiUtils.js`).
  - **Healthchecks.io API:** Used for bot monitoring and tracking uptime (`modules/services/healthchecksApiUtils.js`).
  - **Winston:** Used for application logging (`modules/core/logger.js`, output to `logs/`).
  - **Chart Generation:** Custom logic for generating statistical charts for user activity (`modules/utils/chartGenerator.js`).

## Bot Capabilities & Features

The bot exposes its capabilities primarily via Discord slash commands, categorized as follows:

### 1. User Management
- **Add/Remove Users** (`/adduser`, `/removeuser`): Link LeetCode usernames to Discord users for tracking.
- **List Users** (`/listusers`): Display all currently tracked LeetCode usernames in the server.

### 2. Monitoring & Statistics
- **Daily Checking** (`/check`, `/daily`): Manually check and report today's LeetCode challenge status or a specific user's submission status.
- **Statistics & Profiles** (`/leetstats`, `/profile`): View detailed LeetCode statistics and badge profiles for members.
- **Activity Calendar** (`/calendar`): Generate visual charts showing recent LeetCode activity across time ranges (7, 30, 90 days, or current month).
- **Leaderboards & Hall of Fame** (`/leaderboard`, `/halloffame`): Generate server-specific leaderboards ranking users by streak, problems solved, or active days across different time periods.

### 3. Scheduling & Automation
- **Cron Management** (`/managecron`): Add, remove, or list specific times (hour/minute) for the bot to automatically perform daily LeetCode activity checks.
- **Silent Check:** Runs hourly in the background to keep submission stats up to date without posting to channels (`performSilentCheck` in `modules/core/scheduledTasks.js`).
- **Contest Reminders:** Runs every 15 minutes to check for upcoming contests and notify guilds that have opted in (`performContestReminder` in `modules/core/scheduledTasks.js`).
- *Note: Cron schedules are handled internally by the bot, not via OS-level cron.*

### 4. Setup, Admin & Configuration
- **Server Configuration** (`/config`): View current server settings — announcement channel, check schedule, tracked users, Telegram status, admin role, and broadcast preference. Handler: `modules/handlers/adminHandlers.js` → `handleConfig`.
- **Channel & Role Setup** (`/setchannel`, `/setadminrole`): Configure which channel receives announcements and which role is authorized to manage bot configuration.
- **System Broadcasts** (`/togglebroadcast`, `/broadcast`, `/broadcastlogs`): Toggle, send, and view logs for bot-wide system broadcasts to all servers. Handlers: `modules/handlers/broadcastHandlers.js`.
- **Admin Checks** (`/forcecheck`): Admins can forcefully trigger the daily check routine.
- **Contest Reminder Toggle** (`/togglecontestreminder`): Enable or disable automated contest reminders per server.

### 5. Utilities & Integrations
- **Contest Info** (`/contest`): Show details for upcoming LeetCode contests.
- **Telegram Notifications** (`/telegram connect | toggle | status`): Allow users to link Telegram accounts and receive direct notifications.
- **Healthchecks Monitoring** (`/hc overview | info | history | flips`): Monitor check statuses, recent pings, and status changes directly within Discord. Bot-owner only. Handlers: `modules/handlers/hcHandlers.js`.
- **General Bot Info** (`/botinfo`, `/help`, `/invite`): Display bot operation instructions, repository links, help menus, and server invite links.
- **Server Feedback Collection**: Automatically sends a direct message to the server owner with a feedback form (configured via `FEEDBACK_FORM_URL`) whenever the bot is removed from a guild.

## Architecture & Data Flow
- **Entry Point:** `index.js` — Bot startup, imports exclusively from `modules/core/`.
- **Module Structure:** `modules/` is organized into four layers:
  - `modules/core/` — Infrastructure and lifecycle: `logger`, `configManager`, `commandRegistration`, `webhookReporter`, `presenceManager`, `scheduledTasks`, `db`, `auth`
  - `modules/services/` — External service integrations: `apiUtils`, `telegramBot`, `healthcheck`, `healthchecksApiUtils`
  - `modules/utils/` — Stateless helpers: `statsPanel`, `leaderboardUtils`, `hallOfFameUtils`, `serverLeaderboard`, `chartGenerator`, `embeds`, `broadcastUtils`, `interactionUtils`
  - `modules/handlers/` — Discord interaction handlers: `adminHandlers`, `membershipHandlers`, `broadcastHandlers`, `hcHandlers`, `autocompleteHandler`
  - `modules/models/` — Mongoose schemas
- **Command Handling:** Handled via `modules/interactionHandler.js`. Definitions live in `modules/core/commandRegistration.js`. Each command routes to a dedicated handler in `modules/handlers/`.
- **Auth:** Admin permission checks are centralized in `modules/core/auth.js` (`hasAdminAccess`). Admin role IDs are cached per guild; call `setCachedAdminRole` after any role change.
- **Autocomplete:** Username and cron job autocomplete is cached in memory in `modules/handlers/autocompleteHandler.js`. Call `invalidateUsernameCache(guildId)` or `invalidateCronJobsCache(guildId)` after relevant changes.
- **Data Flow:** Discord event → `handlers/` → `core/configManager` + `models/` → Discord response. LeetCode API calls go through `services/apiUtils`. Telegram via `services/telegramBot`.
- **Logging:** All actions and errors logged via Winston (`modules/core/logger.js`) to `logs/`. Critical errors also reported via `modules/core/webhookReporter.js`.
- **Environment:** Secrets, tokens, and URIs must be stored in `.env` (never hardcoded or committed).

## Import Path Conventions
Always use the correct subdirectory. The old flat `modules/` paths are no longer valid.

```js
// Correct
const logger = require('../core/logger');
const { getGuildConfig, addUser } = require('../core/configManager');
const { getDailySlug, getUserSubmissions } = require('../services/apiUtils');
const { hasAdminAccess } = require('../core/auth');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');

// Wrong — these paths no longer exist
const logger = require('../logger');
const { getDailySlug } = require('../apiUtils');
```

## Developer Workflows
- **Start Bot:** `node index.js`
- **Frontend Dev:** `cd frontend && npm run dev`
- **Tests:** `jest` — uses `@shelf/jest-mongodb` preset; `global.__MONGO_URI__` is injected automatically. Individual test files include a `MongoMemoryServer` fallback for resilience.
- **Migrations:** Migration and utility scripts are located in the `scripts/` directory.

## Caveats & Best Practices
- **Config Changes:** When adding or modifying config-related features, update the `/config` embed in `modules/handlers/adminHandlers.js` → `handleConfig`, plus any relevant help text.
- **Admin-Only Commands:** Always use `hasAdminAccess(interaction, getAdminRole)` from `modules/core/auth.js`. Never inline permission logic in handlers.
- **Interaction Helpers:** Use `safeDeferReply` and `safeReply` from `modules/utils/interactionUtils.js` in all handlers — do not call `interaction.reply` or `interaction.deferReply` directly.
- **Command Registration & Help:** When adding or changing commands, update both `modules/core/commandRegistration.js` and the relevant handler in `modules/handlers/`.
- **New Scheduled Tasks:** Add to `modules/core/scheduledTasks.js` and register inside `initializeScheduledTasks`.
- **New Commands:** Create the handler function in the appropriate `modules/handlers/` file and wire it up in `modules/interactionHandler.js`.
- **Local Files:** Never store config or secrets in local files; always use MongoDB and `.env`.