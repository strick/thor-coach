# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Thor Stack** is a local-first, AI-powered workout tracking monorepo with Model Context Protocol (MCP) integration. It uses natural language input to log structured workout data and integrates with AI agents. Everything runs locally with privacy-first principles.

- **Monorepo**: npm workspaces with separate apps/, mcp/, and packages/ directories
- **Backend API**: TypeScript + Express + SQLite (better-sqlite3) in `apps/thor-api/`
- **Web Frontend**: Static HTML + Tailwind CSS + Chart.js in `apps/thor-web/`
- **MCP Server**: Model Context Protocol server in `apps/thor-mcp/`
- **Shared Package**: Common types/schemas in `packages/shared/`
- **AI Parsing**: Supports both Ollama (local) and OpenAI (cloud) for parsing natural language
- **Database**: SQLite with WAL mode (`workout.db` created in `apps/thor-api/`)

## Development Commands

```bash
# Install all workspace dependencies
npm install

# Development mode (hot reload)
npm run dev:api           # Start API server (http://localhost:3000)
npm run dev:web           # Start web server (http://localhost:3001)
npm run dev:meta-runner   # Start meta-runner (http://localhost:3001)
npm run dev:mcp           # Start MCP server (stdio mode)

# Build all workspaces
npm run build

# Build specific workspaces
npm run build:api
npm run build:web
npm run build:meta-runner
npm run build:mcp

# Run tests
npm run test         # All workspaces
npm run test:api     # API only

# Production mode
npm run start --workspace=thor-api
npm run start --workspace=thor-web
npm run start --workspace=thor-meta-runner

# Cleanup
npm run clean        # Remove all dist/ and node_modules/
```

## Environment Configuration

Create a `.env` file in `apps/thor-api/`:

```env
# LLM Configuration (choose one)
USE_OLLAMA=true                    # Set to "true" to use local Ollama
OLLAMA_URL=http://localhost:11434  # Default Ollama URL
OLLAMA_MODEL=llama3.1:8b           # Model to use with Ollama

OPENAI_API_KEY=sk-xxxxx            # Set this to use OpenAI instead

# Server
PORT=3000                          # API server port
```

Create a `.env` file in `apps/thor-meta-runner/`:

```env
# Same LLM configuration as above
USE_OLLAMA=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# Thor API connection
THOR_API_URL=http://localhost:3000

# Server
PORT=3001
```

**Note**: If `USE_OLLAMA=true`, the system uses Ollama. Otherwise, if `OPENAI_API_KEY` is set, it uses OpenAI. If neither is configured, LLM parsing will fail.

**Important**: LLM configuration is read from the `.env` file at server startup. To switch between Ollama and OpenAI:
1. Edit `apps/thor-api/.env` (and `apps/thor-meta-runner/.env` if running meta-runner)
2. Restart the servers

## Architecture

### Monorepo Structure

```
thor-stack/
├── apps/
│   ├── thor-api/          # Backend REST API
│   │   ├── src/           # TypeScript source
│   │   ├── dist/          # Compiled JS (gitignored)
│   │   ├── workout.db     # SQLite database (gitignored)
│   │   └── .env           # Environment config (gitignored)
│   │
│   └── thor-web/          # Frontend web server
│       ├── public/        # Static files (HTML, CSS, JS)
│       └── server.js      # Express static file server
│
├── mcp/
│   └── thor-mcp/          # Model Context Protocol server
│       ├── src/           # MCP server implementation
│       ├── dist/          # Compiled JS
│       └── README.md      # MCP documentation
│
└── packages/
    └── shared/            # Shared types and schemas
        ├── src/
        │   ├── types.ts      # TypeScript types
        │   ├── schemas.ts    # Zod validation schemas
        │   └── constants.ts  # Shared constants
        └── dist/          # Compiled declarations
```

**Key Points:**
- All imports from shared package use `@thor/shared`
- API paths are relative to `apps/thor-api/src/`
- Database is created at `apps/thor-api/workout.db`
- `.env` file goes in `apps/thor-api/`

### Database Schema (apps/thor-api/src/seed.ts)

The database auto-initializes on first run with these tables:

- **plans**: Workout plans (default: "thor" - dumbbell-only plan)
- **exercises**: Exercise catalog, organized by `plan_id` and `day_of_week` (1-7, where Sunday=7)
  - Includes `aliases` (JSON array) for fuzzy matching user input
- **workout_sessions**: Logged workout sessions (one per submission)
  - Tracks which LLM parsed each workout (`llm_provider` and `llm_model` columns)
- **exercise_logs**: Individual exercise entries per session (sets, reps, weight, notes)
  - Notes capture contextual comments like "This was brutal" or "felt easy" for each exercise
- **weekly_summaries**: AI-generated weekly workout summaries
  - Stores metrics (total_sessions, total_volume) and AI-generated summary text
  - Includes `metrics_json` with detailed breakdown (exercises, days trained, week-over-week comparison)
  - Auto-generated every Sunday at 6:00 PM via cron job

### Request Flow

1. **User submits text** → `POST /api/ingest`
2. **Parser service** (`apps/thor-api/src/services/parser.ts`):
   - Fetches valid exercises for the day from the plan
   - Sends natural language text + valid exercise list to LLM (Ollama or OpenAI)
   - LLM returns structured JSON with parsed exercises, sets, reps, weights, and notes
   - Handles multiple notation formats: `4x12 @45`, `4*12 with 45 lbs`, `11, 8, 5` (variable reps)
   - **Captures contextual notes**: Comments like "This was brutal", "felt easy", "personal best!" are automatically parsed and stored per-exercise
3. **Ingest service** (`apps/thor-api/src/services/ingest.ts`):
   - Normalizes parsed exercise names against the database using fuzzy matching (apps/thor-api/src/services/plans.ts:normalizeExercise)
   - **Prevents duplicate exercises**: Checks if an exercise has already been logged today before inserting
   - Creates a workout_session and exercise_logs entries in a transaction
   - Returns results with per-exercise status:
     - `logged`: Successfully added
     - `skipped_unknown_exercise`: Exercise not found in plan for this day
     - `skipped_already_logged_today`: Exercise already logged today (duplicate prevention)

### Key Services

- **apps/thor-api/src/services/parser.ts**: LLM integration layer
  - `parseFreeform()`: Main parsing function
  - `parseWithOllama()`: Ollama-specific client (uses `/api/chat` endpoint with `format: "json"`)
  - OpenAI path uses structured outputs with strict JSON schema

- **apps/thor-api/src/services/plans.ts**: Exercise database queries and normalization
  - `getDayExercises(planId, dow)`: Returns exercises for a given plan and day-of-week
  - `normalizeExercise(input, candidates)`: Fuzzy matching (exact → alias → substring)

- **apps/thor-api/src/services/ingest.ts**: Transaction logic for logging workouts
  - `handleIngest(text, dateISO?, planId?)`: Main ingestion pipeline

- **apps/thor-api/src/services/weekly-summary.ts**: Weekly workout summary generation
  - `calculateWeeklyMetrics(planId, weekStart)`: Calculates workout metrics for a week (sessions, volume, exercises, week-over-week comparison)
  - `generateWeeklySummary(planId, weekStart?)`: Generates AI-powered summary and stores in database
  - `getWeeklySummaries(planId, limit)`: Retrieves stored summaries
  - `getWeeklySummary(summaryId)`: Gets a specific summary with full metrics

- **apps/thor-api/src/services/cron.ts**: Automated task scheduling
  - `initializeCronJobs()`: Sets up cron jobs (called on server startup)
  - Weekly summary generation: Runs every Sunday at 6:00 PM
  - `triggerWeeklySummary(planId)`: Manually trigger summary generation (useful for testing)

### API Endpoints (apps/thor-api/src/routes/index.ts)

- `POST /api/ingest` - Parse and log workout from natural language
  - Body: `{ text: string, date?: "YYYY-MM-DD", planId?: "thor" }`

- `GET /api/day/:dow` - Get exercises for a day (1-7)
  - Returns: `{ planId, dow, exercises: [{ id, name, aliases }] }`

- `GET /api/progress/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` - Analytics
  - Returns: `{ sessions, topLifts, recent }`

- `GET /api/weekly-summaries?planId=thor&limit=10` - Get weekly summaries
  - Returns: `{ planId, summaries: [{ id, week_start_date, week_end_date, total_sessions, total_volume, summary_text, created_at }] }`

- `GET /api/weekly-summaries/:id` - Get specific weekly summary with full metrics
  - Returns: `{ id, plan_id, week_start_date, week_end_date, total_sessions, total_volume, summary_text, metrics, created_at }`

- `POST /api/weekly-summaries/generate` - Manually trigger weekly summary generation
  - Body: `{ planId?: "thor" }`
  - Returns: `{ summaryId, summary }`

- `GET /health` - Health check (tests DB connectivity)

- `GET /config` - Runtime config (LLM provider, model, etc.)

- `GET /api/workouts?date=YYYY-MM-DD` - Get workouts for a specific date
  - Returns: `{ date, workouts: [{ id, session_date, day_of_week, exercises: [...] }] }`

- `DELETE /api/workouts/:sessionId` - Delete a specific workout session
  - Returns: `{ status: "deleted", sessionId }`

- `GET /api/exercises?planId=thor&dow=1` - Get list of exercises (optionally filtered by day)
  - Returns: `{ planId, exercises: [{ id, name, day_of_week, aliases }] }`

- `GET /api/exercises/:exerciseId/history?limit=50` - Get history for a specific exercise
  - Returns: `{ exercise, history: [...], stats: { total_sessions, total_sets, max_weight, avg_weight, total_volume } }`

- `POST /api/admin/clear-logs` - Delete all workout data (use with caution)

### Frontend (apps/thor-web/public/index.html)

Single-file SPA that:
- Allows natural language input (typing or speech-to-text via Web Speech API)
- Displays parsed results and exercise validation
- **Weekly Reports Dashboard** - AI-powered weekly summaries with:
  - Latest week summary card showing sessions, volume, and week-over-week % change
  - AI-generated coaching text from LLM
  - Top exercises breakdown with volume metrics
  - Historical summaries with trend indicators (📈 📉 ➡️)
  - "Generate Now" button for manual summary generation
- **Workout Management** - Edit and delete past workouts:
  - Select a date to view all workouts for that day
  - Delete individual workout sessions with confirmation
  - View exercise details for each session
- **Single Exercise Tracking** - Track progress for individual exercises:
  - Select any exercise from the plan
  - View comprehensive stats (total sessions, sets, max weight, total volume)
  - See complete history with dates, sets, reps, and weights
  - Calculated volume per session
- Shows progress charts (last 30 days) using Chart.js
- **Settings Modal** - Configuration interface:
  - View current LLM backend configuration (provider and model) - read-only
  - Shows which AI model parsed each workout (displayed with 🤖 emoji)
  - Instructions for changing LLM settings via `.env` file
  - Configurable API URL (useful for mobile devices connecting to LAN)

### Meta-Runner Service (`apps/thor-meta-runner/`)

The meta-runner is an **agentic health coordinator** that routes natural language queries across multiple health domains. It sits between the user and domain-specific APIs/tools.

**Architecture:**
```
User Input (text)
    ↓
Router (LLM classification) → WORKOUT | NUTRITION | HEALTH_LOG | OVERVIEW
    ↓
Parsers (domain-specific) → structured payloads
    ↓
Executor (API calls) → call thor-api endpoints or future nutrition/health endpoints
    ↓
Response (natural language + metadata)
```

**Key Services:**

- **`src/services/router.ts`**: LLM-based query classification
  - `routeQuery(text, modeOverride?)`: Main routing function
  - Returns: `{ target, intent, cleaned_text, confidence }`
  - Supports explicit mode override ("auto" | "thor" | "nutrition" | "health" | "overview")
  - Fallback heuristic classification if LLM fails

- **`src/services/parsers.ts`**: Domain-specific parsing
  - `parseWorkout(text, date?)`: Workout data extraction
  - `parseMeal(text, date?)`: Meal/nutrition data extraction
  - `parseHealthEvent(text, date?)`: Health event data extraction
  - Each parser uses LLM to extract structured JSON, with fallback heuristics

- **`src/services/metaRunner.ts`**: Main orchestration service
  - `MetaRunnerService.chat(request)`: Single entry point for all queries
  - Handles: WORKOUT → handleWorkout, NUTRITION → handleNutrition, etc.
  - Returns: `MetaRunnerResponse` with agent, intent, actions, message, and optional rawToolResults

- **`src/clients/thorApiClient.ts`**: HTTP client for thor-api
  - Methods: `logWorkout()`, `getProgressSummary()`, `logMeal()` (placeholder), `logHealthEvent()` (placeholder)
  - Can be extended with new endpoints as new tables are added

**API Endpoint:**
- `POST /chat` - Route natural language health query
  - Request: `{ text: string, mode?: "auto"|"thor"|"nutrition"|"health"|"overview", periodDays?: 14 }`
  - Response: `{ agent, intent, actions, message, rawToolResults? }`

**LLM Prompts:**

Each router and parser uses system prompts to guide the LLM. These are defined inline in the respective files:
- Router: Classifies into domains and infers intent
- Parsers: Extract structured data (exercises, meals, health events) with fallback heuristics

**Future Extension Points:**

1. **New Domains**: Add to `RouterResult['target']`, add parser function, add handler in `MetaRunnerService`
2. **New Intents**: Extend classifier prompt and add corresponding parser
3. **Database Tables**: Extend thor-api schema, then update `thorApiClient` methods
4. **MCP Tools**: Add new tool definitions to `apps/thor-mcp/src/tool-config.ts` wrapping new endpoints

## TypeScript Configuration

- **Module system**: ESM (`"type": "module"` in package.json)
- **Module resolution**: `NodeNext` (requires `.js` extensions in imports even for `.ts` files)
- **Output**: Compiled to `dist/` directory
- **Strict mode**: Enabled

**Important**: All relative imports must use `.js` extensions (e.g., `import { foo } from "./bar.js"`), even though source files are `.ts`. This is a requirement of `verbatimModuleSyntax` and ESM in Node.js.

## Common Development Patterns

### Adding a New Exercise

Edit `apps/thor-api/src/seed.ts` and add to the appropriate day array (D1-D5), then delete `apps/thor-api/workout.db` and restart the server to re-seed.

### Changing LLM Behavior

Modify the system prompt in `apps/thor-api/src/services/parser.ts:parseFreeform()` (the `sys` variable). The prompt instructs the LLM on how to parse workout notation and match exercises.

For weekly summaries, edit the prompt in `apps/thor-api/src/services/weekly-summary.ts:generateSummaryText()`.

### Adding a New API Endpoint

1. Add route handler in `apps/thor-api/src/routes/index.ts`
2. Use `db.prepare()` for SQL queries (better-sqlite3 synchronous API)
3. Validate request bodies with Zod schemas (define in `packages/shared/src/schemas.ts` or `apps/thor-api/src/models.ts`)

### Configuring Cron Jobs

Cron job schedules are defined in `apps/thor-api/src/services/cron.ts`. To change the timezone or schedule:

1. Edit the cron expression: `'0 18 * * 0'` (minute hour day month weekday)
2. Change timezone in the options: `timezone: "America/New_York"`
3. Restart the server for changes to take effect

Common timezones: `America/New_York`, `America/Los_Angeles`, `Europe/London`, `UTC`

## Testing Your Changes

After modifying code:

1. **Start the API server**: `npm run dev:api` (runs on http://localhost:3000)
2. **Start the web server**: `npm run dev:web` (runs on http://localhost:3001)
3. **Visit the UI**: Open http://localhost:3001 in your browser
4. **Test health endpoint**: `curl http://localhost:3000/health`
5. **Test workout parsing**: `curl -X POST http://localhost:3000/api/ingest -H "Content-Type: application/json" -d '{"text":"floor press 4x12 @45"}'`
6. **Test weekly summary generation**: `curl -X POST http://localhost:3000/api/weekly-summaries/generate -H "Content-Type: application/json" -d '{}'`
7. **View weekly summaries**: `curl http://localhost:3000/api/weekly-summaries`
8. **Test MCP server**: `echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' | node apps/thor-mcp/dist/index.js`

## Roadmap Context

- **Current Phase**: Phase 3 complete (Monorepo & MCP integration)
- **Completed Features**: Natural language logging, AI-powered weekly summaries, MCP server with 8 tools
- **Next Phase**: Voice & Dictation (Phase 4)
- **Planned Features**: Voice control, trend detection, periodization planning, multi-device sync
- See README.md for full roadmap

## Database File

`apps/thor-api/workout.db` is created when the API server first runs. It's excluded from git (.gitignore). To reset the database, delete the file and restart the API server.

## MCP Integration

The Thor MCP Server (`apps/thor-mcp/`) exposes workout logging tools to AI agents via Model Context Protocol. See `apps/thor-mcp/README.md` for:
- Configuration instructions for Claude Desktop
- List of 8 available tools (log_workout, get_today_exercises, etc.)
- Known Windows/WSL stdio encoding issues and workarounds
- Usage examples
