# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Thor Logger** is a local-first, AI-powered workout tracker that uses natural language input to log structured workout data. It runs entirely on your machine with privacy-first principles.

- **Backend**: TypeScript + Express + SQLite (better-sqlite3)
- **AI Parsing**: Supports both Ollama (local) and OpenAI (cloud) for parsing natural language workout descriptions
- **Frontend**: Single-page HTML with Tailwind CSS + Chart.js (served from `public/`)
- **Database**: SQLite with WAL mode (`workout.db` created in project root)

## Development Commands

```bash
# Install dependencies
npm install

# Development mode (hot reload with tsx watch)
npm run dev

# Build TypeScript to JavaScript
npm run build

# Production mode (run compiled JavaScript)
npm start
```

## Environment Configuration

Create a `.env` file in the project root:

```env
# LLM Configuration (choose one)
USE_OLLAMA=true                    # Set to "true" to use local Ollama
OLLAMA_URL=http://localhost:11434  # Default Ollama URL
OLLAMA_MODEL=llama3.1:8b           # Model to use with Ollama

OPENAI_API_KEY=sk-xxxxx            # Set this to use OpenAI instead

# Server
PORT=3000                          # API server port
```

**Note**: If `USE_OLLAMA=true`, the system uses Ollama. Otherwise, if `OPENAI_API_KEY` is set, it uses OpenAI. If neither is configured, LLM parsing will fail.

## Architecture

### Database Schema (src/seed.ts)

The database auto-initializes on first run with these tables:

- **plans**: Workout plans (default: "thor" - dumbbell-only plan)
- **exercises**: Exercise catalog, organized by `plan_id` and `day_of_week` (1-7, where Sunday=7)
  - Includes `aliases` (JSON array) for fuzzy matching user input
- **workout_sessions**: Logged workout sessions (one per submission)
- **exercise_logs**: Individual exercise entries per session (sets, reps, weight, notes)
- **weekly_summaries**: AI-generated weekly workout summaries
  - Stores metrics (total_sessions, total_volume) and AI-generated summary text
  - Includes `metrics_json` with detailed breakdown (exercises, days trained, week-over-week comparison)
  - Auto-generated every Sunday at 6:00 PM via cron job

### Request Flow

1. **User submits text** → `POST /ingest`
2. **Parser service** (`src/services/parser.ts`):
   - Fetches valid exercises for the day from the plan
   - Sends natural language text + valid exercise list to LLM (Ollama or OpenAI)
   - LLM returns structured JSON with parsed exercises, sets, reps, weights
   - Handles multiple notation formats: `4x12 @45`, `4*12 with 45 lbs`, `11, 8, 5` (variable reps)
3. **Ingest service** (`src/services/ingest.ts`):
   - Normalizes parsed exercise names against the database using fuzzy matching (src/services/plans.ts:normalizeExercise)
   - Creates a workout_session and exercise_logs entries in a transaction
   - Returns results with per-exercise status (logged vs skipped_unknown_exercise)

### Key Services

- **src/services/parser.ts**: LLM integration layer
  - `parseFreeform()`: Main parsing function
  - `parseWithOllama()`: Ollama-specific client (uses `/api/chat` endpoint with `format: "json"`)
  - OpenAI path uses structured outputs with strict JSON schema

- **src/services/plans.ts**: Exercise database queries and normalization
  - `getDayExercises(planId, dow)`: Returns exercises for a given plan and day-of-week
  - `normalizeExercise(input, candidates)`: Fuzzy matching (exact → alias → substring)

- **src/services/ingest.ts**: Transaction logic for logging workouts
  - `handleIngest(text, dateISO?, planId?)`: Main ingestion pipeline

- **src/services/weekly-summary.ts**: Weekly workout summary generation
  - `calculateWeeklyMetrics(planId, weekStart)`: Calculates workout metrics for a week (sessions, volume, exercises, week-over-week comparison)
  - `generateWeeklySummary(planId, weekStart?)`: Generates AI-powered summary and stores in database
  - `getWeeklySummaries(planId, limit)`: Retrieves stored summaries
  - `getWeeklySummary(summaryId)`: Gets a specific summary with full metrics

- **src/services/cron.ts**: Automated task scheduling
  - `initializeCronJobs()`: Sets up cron jobs (called on server startup)
  - Weekly summary generation: Runs every Sunday at 6:00 PM
  - `triggerWeeklySummary(planId)`: Manually trigger summary generation (useful for testing)

### API Endpoints (src/routes/index.ts)

- `POST /ingest` - Parse and log workout from natural language
  - Body: `{ text: string, date?: "YYYY-MM-DD", planId?: "thor" }`

- `GET /day/:dow` - Get exercises for a day (1-7)
  - Returns: `{ planId, dow, exercises: [{ id, name, aliases }] }`

- `GET /progress/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` - Analytics
  - Returns: `{ sessions, topLifts, recent }`

- `GET /weekly-summaries?planId=thor&limit=10` - Get weekly summaries
  - Returns: `{ planId, summaries: [{ id, week_start_date, week_end_date, total_sessions, total_volume, summary_text, created_at }] }`

- `GET /weekly-summaries/:id` - Get specific weekly summary with full metrics
  - Returns: `{ id, plan_id, week_start_date, week_end_date, total_sessions, total_volume, summary_text, metrics, created_at }`

- `POST /weekly-summaries/generate` - Manually trigger weekly summary generation
  - Body: `{ planId?: "thor" }`
  - Returns: `{ summaryId, summary }`

- `GET /health` - Health check (tests DB connectivity)

- `GET /config` - Runtime config (LLM provider, model, etc.)

- `GET /workouts?date=YYYY-MM-DD` - Get workouts for a specific date
  - Returns: `{ date, workouts: [{ id, session_date, day_of_week, exercises: [...] }] }`

- `DELETE /workouts/:sessionId` - Delete a specific workout session
  - Returns: `{ status: "deleted", sessionId }`

- `GET /exercises?planId=thor&dow=1` - Get list of exercises (optionally filtered by day)
  - Returns: `{ planId, exercises: [{ id, name, day_of_week, aliases }] }`

- `GET /exercises/:exerciseId/history?limit=50` - Get history for a specific exercise
  - Returns: `{ exercise, history: [...], stats: { total_sessions, total_sets, max_weight, avg_weight, total_volume } }`

- `POST /admin/clear-logs` - Delete all workout data (use with caution)

### Frontend (public/index.html)

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
- Configurable API URL (useful for mobile devices connecting to LAN)

## TypeScript Configuration

- **Module system**: ESM (`"type": "module"` in package.json)
- **Module resolution**: `NodeNext` (requires `.js` extensions in imports even for `.ts` files)
- **Output**: Compiled to `dist/` directory
- **Strict mode**: Enabled

**Important**: All relative imports must use `.js` extensions (e.g., `import { foo } from "./bar.js"`), even though source files are `.ts`. This is a requirement of `verbatimModuleSyntax` and ESM in Node.js.

## Common Development Patterns

### Adding a New Exercise

Edit `src/seed.ts` and add to the appropriate day array (D1-D5), then delete `workout.db` and restart the server to re-seed.

### Changing LLM Behavior

Modify the system prompt in `src/services/parser.ts:parseFreeform()` (the `sys` variable). The prompt instructs the LLM on how to parse workout notation and match exercises.

For weekly summaries, edit the prompt in `src/services/weekly-summary.ts:generateSummaryText()`.

### Adding a New API Endpoint

1. Add route handler in `src/routes/index.ts`
2. Use `db.prepare()` for SQL queries (better-sqlite3 synchronous API)
3. Validate request bodies with Zod schemas (define in `src/models.ts`)

### Configuring Cron Jobs

Cron job schedules are defined in `src/services/cron.ts`. To change the timezone or schedule:

1. Edit the cron expression: `'0 18 * * 0'` (minute hour day month weekday)
2. Change timezone in the options: `timezone: "America/New_York"`
3. Restart the server for changes to take effect

Common timezones: `America/New_York`, `America/Los_Angeles`, `Europe/London`, `UTC`

## Testing Your Changes

After modifying code:

1. Run `npm run dev` to test with hot reload
2. Visit `http://localhost:3000` to access the UI
3. Test the `/health` endpoint to verify DB connectivity: `curl http://localhost:3000/health`
4. Test parsing: `curl -X POST http://localhost:3000/ingest -H "Content-Type: application/json" -d '{"text":"floor press 4x12 @45"}'`
5. Test weekly summary generation: `curl -X POST http://localhost:3000/weekly-summaries/generate -H "Content-Type: application/json" -d '{}'`
6. View weekly summaries: `curl http://localhost:3000/weekly-summaries`

## Roadmap Context

- **Current Phase**: MVP complete, adding AI Coach features (weekly summaries)
- **Planned Features**: Voice dictation, trend detection, periodization planning
- See README.md for full roadmap

## Database File

`workout.db` is created at the project root. It's excluded from git. To reset the database, delete the file and restart the server.
