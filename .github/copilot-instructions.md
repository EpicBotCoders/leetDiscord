# Copilot Instructions for LeetDiscord Bot

## Project Overview
- **LeetDiscord** is a Discord bot for tracking LeetCode activity, posting updates to Discord channels, and managing user stats across multiple servers (guilds).
- **Backend:** Node.js (main logic in root and `modules/`)
- **Frontend:** Next.js app in `frontend/` (UI components, not directly tied to bot logic)
- **Database:** MongoDB Atlas (cloud, not local)
- **Key Integrations:** Discord.js, MongoDB, Telegram (for notifications)

## Architecture & Data Flow
- **Entry Point:** `index.js` (bot startup, command registration, event listeners)
- **Modules:** `modules/` is organized into four subdirectories:
  - `modules/core/` — Infrastructure and lifecycle: `logger`, `configManager`, `commandRegistration`, `webhookReporter`, `presenceManager`, `scheduledTasks`, `db`, `auth`
  - `modules/services/` — External service integrations: `apiUtils` (LeetCode API), `telegramBot`, `healthcheck`, `healthchecksApiUtils`
  - `modules/utils/` — Stateless helpers: `statsPanel`, `leaderboardUtils`, `hallOfFameUtils`, `serverLeaderboard`, `chartGenerator`, `embeds`, `broadcastUtils`, `interactionUtils`
  - `modules/handlers/` — Discord interaction handlers: `adminHandlers`, `membershipHandlers`, `broadcastHandlers`, `hcHandlers`, `autocompleteHandler`
  - `modules/models/` — Mongoose schemas for MongoDB
  - `frontend/` — Next.js app for web UI (optional, not required for bot operation)
- **Data Flow:**
  - Discord events → `handlers/` → `core/configManager` + `models/` → Discord responses
  - LeetCode API (`services/apiUtils`) → Bot → MongoDB → Discord
  - Telegram integration via `services/telegramBot`

## Developer Workflows
- **Start Bot:** `node index.js` (requires `.env` with `DISCORD_TOKEN`, `MONGODB_URI`)
- **Frontend Dev:** `cd frontend && npm run dev` (for Next.js UI)
- **Migrations:** See `scripts/` for migration utilities (e.g., `migrate-to-mongodb.js`)
- **Tests:** `jest` — uses `@shelf/jest-mongodb` preset; `global.__MONGO_URI__` is provided automatically. Individual test files include a fallback `MongoMemoryServer` for resilience.

## Module Responsibilities

### `modules/core/`
| File | Responsibility |
|---|---|
| `logger.js` | Winston logger instance |
| `configManager.js` | All guild/user config reads and writes (MongoDB-backed) |
| `commandRegistration.js` | Slash command definitions and Discord API registration |
| `scheduledTasks.js` | Cron scheduling: `performDailyCheck`, `performSilentCheck`, `performContestReminder`, `initializeScheduledTasks` |
| `presenceManager.js` | Bot presence/activity cycling |
| `webhookReporter.js` | Internal webhook reporting for bot events |
| `db.js` | MongoDB connection setup |
| `auth.js` | Admin role access checks with per-guild caching (`hasAdminAccess`, `setCachedAdminRole`) |

### `modules/services/`
| File | Responsibility |
|---|---|
| `apiUtils.js` | LeetCode API calls: `getDailySlug`, `getUserSubmissions`, `getBestDailySubmission`, `enhancedCheck`, `getUserCalendar`, `parseDuration`, `parseMemory`, `clearCache` |
| `telegramBot.js` | Telegram bot startup and message sending |
| `healthcheck.js` | Healthchecks.io ping helper |
| `healthchecksApiUtils.js` | Healthchecks.io API queries (list, details, history, flips) |

### `modules/handlers/`
| File | Responsibility |
|---|---|
| `adminHandlers.js` | `/setchannel`, `/setadmin`, `/togglebroadcast`, `/leaderboard`, `/forcecheck`, `/togglecontestreminder`, `/managecron`, `/config` |
| `membershipHandlers.js` | `/profile`, user badge/calendar display |
| `broadcastHandlers.js` | `/broadcast`, `/broadcastlogs` (bot owner only) |
| `hcHandlers.js` | `/hc` subcommands: `overview`, `info`, `history`, `flips` (bot owner only) |
| `autocompleteHandler.js` | Autocomplete for usernames and cron times, with in-memory cache invalidation |

## Project-Specific Conventions
- **Commands:** All bot commands are Discord slash commands (see `/help` for full list)
- **Config:** Per-server (guild) config is stored in MongoDB, not in local files
- **Logging:** Uses Winston (`modules/core/logger.js`), logs to `logs/` directory
- **Scheduling:** Cron jobs managed via `/managecron` commands, not OS-level cron. Scheduling logic lives in `modules/core/scheduledTasks.js`
- **Error Handling:** All errors logged to `logs/error.log`, user-facing errors sent as Discord messages
- **Environment:** All secrets/config via `.env` (never hardcode tokens/URIs)
- **Admin Access:** Use `hasAdminAccess` from `modules/core/auth.js` for all permission checks — do not inline permission logic in handlers
- **Interaction Helpers:** Use `safeDeferReply` and `safeReply` from `modules/utils/interactionUtils.js` in all handlers

## Import Path Conventions
Always import from the correct subdirectory. Key examples:
```js
const logger = require('../core/logger');
const { getGuildConfig, addUser } = require('../core/configManager');
const { getDailySlug, getUserSubmissions } = require('../services/apiUtils');
const { hasAdminAccess } = require('../core/auth');
const { safeDeferReply, safeReply } = require('../utils/interactionUtils');
```
Never import from the old flat `modules/` path (e.g., `require('../logger')` or `require('../apiUtils')` are incorrect).

## Integration Points
- **Discord.js:** Handles all bot interactions and events
- **MongoDB:** All persistent data (users, configs, submissions)
- **LeetCode API:** Fetches daily challenge and user submissions (via `services/apiUtils`)
- **Telegram:** Optional user notifications (see `/telegram` commands)
- **Healthchecks.io:** Optional uptime monitoring (owner-only `/hc` commands)

## Key Files & Directories
- `index.js` — Bot entry point; imports from `modules/core/`
- `modules/core/` — Infrastructure layer
- `modules/services/` — External APIs and integrations
- `modules/utils/` — Stateless utility helpers
- `modules/handlers/` — Discord command and interaction handlers
- `modules/models/` — Mongoose schemas
- `frontend/` — Next.js UI (optional)
- `scripts/` — Migration and utility scripts
- `logs/` — Log output (errors, combined)
- `.env` — Required for secrets (not committed)

## Examples
- **Add tracked user:** `/adduser leetcode_username @DiscordUser`
- **Set announcement channel:** `/setchannel #channel`
- **Schedule daily check:** `/managecron add hours:10 minutes:0`

## Tips for AI Agents
- Always check MongoDB for config/state, not local files
- Use Discord slash commands for all user interactions
- Follow logging and error conventions (Winston, `modules/core/logger.js`)
- Reference `modules/core/commandRegistration.js` for command details and workflows
- When adding a new command, create its handler in the appropriate `modules/handlers/` file and wire it up in `modules/interactionHandler.js`
- When adding a new scheduled task, add it to `modules/core/scheduledTasks.js` and register it in `initializeScheduledTasks`

## Additional Caveats & Best Practices

- **Config Changes:**  
  Whenever you add or modify any config-related feature, you must also update the relevant config command embed (and help text) to reflect the new or changed data. The `/config` command embed is built in `modules/handlers/adminHandlers.js` → `handleConfig`.

- **Admin-Only Commands:**  
  Always use `hasAdminAccess(interaction, getAdminRole)` from `modules/core/auth.js`. Provide clear denial messages if permissions are insufficient. The auth module caches admin role IDs per guild — call `setCachedAdminRole` after any role update.

- **Command Registration & Help:**  
  When adding or changing commands, update both `modules/core/commandRegistration.js` and the relevant handler in `modules/handlers/`.

- **Logging:**  
  All config/admin actions and errors must be logged using Winston via `modules/core/logger.js`. Import it as `const logger = require('../core/logger')` from any subdirectory.

- **Scheduling:**  
  If your change affects scheduling or cron jobs, update `modules/core/scheduledTasks.js` and ensure `/managecron` and related logic stays consistent. Cache invalidation for cron jobs in autocomplete is handled by `invalidateCronJobsCache` in `modules/handlers/autocompleteHandler.js`.

- **Autocomplete Cache:**  
  When users are added or removed, call `invalidateUsernameCache(guildId)` from `autocompleteHandler.js`. When cron jobs change, call `invalidateCronJobsCache(guildId)`.

- **Documentation:**  
  Never store config or secrets in local files; always use MongoDB and `.env`.  
  Update documentation and help text for any workflow or feature changes.