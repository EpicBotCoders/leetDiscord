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
  - **Telegram Integration:** Provides cross-platform notifications to users (`telegramBot.js`).
  - **LeetCode API:** Interactions with LeetCode GraphQL endpoints for fetching daily challenges and user submissions.
  - **Healthchecks.io API:** Used for bot monitoring and tracking uptime (`healthchecksApiUtils.js`).
  - **Winston:** Used for application logging (`logs/`).
  - **Chart Generation:** Custom logic for generating statistical charts for user activity (`chartGenerator.js`).

## Bot Capabilities & Features

The bot exposes its capabilities primarily via Discord slash commands, categorized as follows:

### 1. User Management
- **Add/Remove Users** (`/adduser`, `/removeuser`): Link LeetCode usernames to Discord users for tracking.
- **List Users** (`/listusers`): Display all currently tracked LeetCode usernames in the server.

### 2. Monitoring & Statistics
- **Daily Checking** (`/check`, `/daily`): Manually check and report today's LeetCode challenge status or a specific user's submission status.
- **Statistics & Profiles** (`/leetstats`, `/profile`): View detailed LeetCode statistics and badge profiles for members.
- **Activity Calendar** (`/calendar`): Generate visual charts showing recent LeetCode activity across time ranges (7, 30, 90 days, or current month).
- **Leaderboards & Hall of Fame** (`/leaderboard`, `/halloffame`): Generate server-specific leaderboards ranking users by streak, problems solved, or active days across different time periods. Provides links to the web-based Hall of Fame.

### 3. Scheduling & Automation
- **Cron Management** (`/managecron`): Add, remove, or list specific times (hour/minute) for the bot to automatically perform daily LeetCode activity checks. 
- *Note: Cron schedules are handled internally by the bot, not via OS-level cron.*

### 4. Setup, Admin & Configuration
- **Server Configuration** (`/config`): View current server settings.
- **Channel & Role Setup** (`/setchannel`, `/setadminrole`): Configure which channel receives announcements and which role is authorized to manage bot configuration.
- **System Broadcasts** (`/togglebroadcast`, `/broadcast`, `/broadcastlogs`): Toggle, send, and view logs for bot-wide system broadcasts to all servers.
- **Admin Checks** (`/forcecheck`): Admins can forcefully trigger the daily check routine.

### 5. Utilities & Integrations
- **Contest Reminders** (`/contest`, `/togglecontestreminder`): Show details for upcoming LeetCode contests and optionally enable automated reminders for them.
- **Telegram Notifications** (`/telegram connect | toggle | status`): Allow users to link Telegram accounts and receive direct notifications.
- **Healthchecks Monitoring** (`/hc overview | info | history | flips`): Monitor check statuses, recent pings, and status changes directly within Discord.
- **General Bot Info** (`/botinfo`, `/help`, `/invite`): Display bot operation instructions, repository links, help menus, and server invite links.
- **Server Feedback Collection**: Automatically sends a direct message to the server owner with a feedback form (configured via `FEEDBACK_FORM_URL`) whenever the bot is removed from a guild.

## Architecture & Data Flow
- **Entry Point:** `index.js` acts as the bot startup script, triggering command registration and event listeners.
- **Command Handling:** Handled via `modules/interactionHandler.js` using Discord.js interactions. Definitions are contained in `modules/commandRegistration.js`.
- **Data Flow:** Discord event triggers $\rightarrow$ Command handlers process logic $\rightarrow$ Fetches/Updates Data (MongoDB/LeetCode API) $\rightarrow$ Sends Discord responses.
- **Logging:** All actions and errors are logged using Winston (`modules/logger.js`) and output to the `logs/` directory. Critical/unhandled errors are also broadcasted via webhook (`modules/webhookReporter.js`).
- **Environment:** Secrets, tokens, and URIs must be stored in `.env` (never hardcoded or committed to version control).

## Developer Workflows
- **Start Bot:** `node index.js`
- **Frontend Dev:** `cd frontend && npm run dev`
- **Migrations:** Migration and utility scripts (like DB transitions) are located in the `scripts/` directory.

## Caveats & Best Practices
- **Config Changes:** Whenever you add or modify any config-related feature, you must also update the relevant config command embed and help text.
- **Admin-Only Commands:** Enforce permission checks (e.g., `Administrator` or `Manage Guild`) for new admin commands and confirm with the user.
- **Command Registration & Help:** When adding or changing commands, update both the command registration logic (`modules/commandRegistration.js`) and command embeds.
- **Local Files:** Never store config or secrets in local files; always use MongoDB and `.env`.