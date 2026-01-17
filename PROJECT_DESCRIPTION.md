# Thor Stack - Project Description for ChatGPT Context

## Project Overview

Thor Stack is an **AI-native, local-first workout tracking system** built as a TypeScript monorepo. It enables users to log workouts using natural language input, which is parsed by AI (Ollama or OpenAI) into structured data stored in a local SQLite database.

**Core Philosophy**: Privacy-first, local execution, AI-powered interaction, MCP-enabled agent integration.

## Current Project State

**Phase**: 3.5 (Agentic Health Layer) - In active development
**Last Major Work**:
- Extracted shared agent infrastructure to `@thor/agent-core` package
- Implemented variable reps per set support for bodyweight exercises
- Improved meta-runner query routing
- Added Mermaid architecture diagrams

## Architecture

### Monorepo Structure

```
thor-stack/
├── apps/
│   ├── thor-api/          # Backend REST API (Express + SQLite)
│   └── thor-web/          # Frontend web UI (static HTML + Tailwind)
├── agents/
│   ├── thor-agent/        # Workout-specific agent (port 3002)
│   ├── health-agent/      # Health event tracking agent (port 3001)
│   └── meta-runner/       # Orchestrator agent with query routing (port 3004)
├── mcp/
│   └── thor-mcp/          # Model Context Protocol server (stdio)
├── packages/
│   ├── shared/            # Common types/schemas
│   └── agent-core/        # Shared BaseAgent infrastructure
└── pi/                    # Raspberry Pi deployment configs
```

### Multi-Agent System

The system uses **three AI agents**:

1. **Thor Agent** (port 3002)
   - Handles workout-specific queries and logging
   - Uses MCP tools: log_workout, get_today_exercises, get_progress, etc.

2. **Health Agent** (port 3001)
   - Tracks health events: migraines, sleep quality, yardwork, runs
   - Separate context from workout data

3. **Meta-Runner** (port 3004)
   - **Orchestrator agent** that routes user queries to appropriate specialist agent
   - Determines whether query is workout-related or health-related
   - Forwards requests to Thor Agent or Health Agent accordingly
   - Users interact with this agent as the primary interface

All agents extend `BaseAgent` from `@thor/agent-core`, providing shared functionality for:
- MCP tool registration and invocation
- Message history management
- LLM integration (Ollama/OpenAI)
- HTTP API endpoints

### Dual LLM Architecture

The system uses **two separate LLM instances**:

**LLM #1 (Agent-level)**:
- Powers the conversational agents (Thor, Health, Meta-runner)
- Handles tool calling via MCP
- Generates natural language responses
- Makes **2 LLM calls per user request**: tool calling + response generation

**LLM #2 (API-level)**:
- Used by `thor-api` for parsing natural language workout text
- Extracts structured data: exercise names, sets, reps, weights, notes
- Only invoked for **write operations** (logging workouts)
- Makes **1 LLM call** when ingesting workout text

### Request Flow

```
User → Meta-Runner Agent → [Routes to] → Thor Agent or Health Agent
                                              ↓
                                         MCP Server (stdio)
                                              ↓
                                         Thor API (REST)
                                              ↓
                                      SQLite Database (workout.db)
```

**Example Flow - Logging a Workout**:
1. User: "log floor press 4x12 @45 lbs"
2. Meta-runner routes to Thor Agent
3. Thor Agent calls MCP tool `log_workout` with text
4. MCP server makes HTTP POST to `thor-api`
5. API uses LLM #2 to parse text into structured format
6. API normalizes exercise name, checks for duplicates
7. API stores in database (workout_sessions + exercise_logs tables)
8. Result bubbles back through MCP → Agent → User

## Technology Stack

- **Language**: TypeScript (ESM modules, strict mode)
- **Runtime**: Node.js ≥22.0.0
- **Package Manager**: npm workspaces
- **Database**: SQLite with better-sqlite3 (WAL mode)
- **API Framework**: Express
- **AI Models**: Ollama (local) or OpenAI (cloud)
- **Protocol**: Model Context Protocol (MCP) for agent-tool communication
- **Frontend**: Static HTML + Tailwind CSS + Chart.js
- **Deployment**: Docker Compose (containerized services)

## Database Schema

### Core Tables

**plans**:
- Workout plan definitions (default: "thor" - dumbbell-only plan)

**exercises**:
- Exercise catalog organized by `plan_id` and `day_of_week` (1-7, Sunday=7)
- Includes `aliases` JSON array for fuzzy matching user input
- Examples: "Floor Press", "Dumbbell Row", "Bicep Curls"

**workout_sessions**:
- One session per date per plan
- Tracks which LLM parsed each workout (`llm_provider`, `llm_model`)
- Columns: id, plan_id, session_date, day_of_week, llm_provider, llm_model, created_at

**exercise_logs**:
- Individual exercise entries per session
- **Variable reps support**: `reps_per_set` column is TEXT type
  - Can store single number: `"12"` (weighted exercises)
  - Can store JSON array: `"[11, 8, 5]"` (bodyweight exercises with variable reps)
- Columns: id, session_id, exercise_id, sets, reps_per_set, weight_lbs, notes
- **Notes capture contextual comments**: "This was brutal", "felt easy", "personal best!"

**weekly_summaries**:
- AI-generated weekly workout summaries
- Metrics: total_sessions, total_volume, week-over-week comparison
- Includes AI-generated coaching text from LLM
- Auto-generated via cron job (Sundays at 6:00 PM)

**health_events**:
- Health tracking: migraines, sleep quality, yardwork, runs, other
- Categories, severity, notes, timestamps

### Key Data Patterns

**Reps Serialization**:
```typescript
// Weighted exercise: store as string
reps_per_set = "12"  // 4 sets × 12 reps

// Bodyweight exercise: store as JSON array
reps_per_set = "[11, 8, 5]"  // 3 sets with different rep counts
```

**Deserialization** (used in controllers):
```typescript
function deserializeReps(repsValue: any): number | number[] | null {
  if (str.startsWith('[')) {
    return JSON.parse(str);  // Array for bodyweight
  }
  return Number(str);  // Single number for weighted
}
```

## Key Services

### parser.ts (apps/thor-api/src/services/)
- **Purpose**: LLM integration for natural language workout parsing
- **Functions**:
  - `parseFreeform(text, planId, dow)`: Main parsing function
  - `parseWithOllama()`: Ollama client using `/api/chat` with `format: "json"`
  - OpenAI path uses structured outputs with strict JSON schema
- **Prompt Engineering**: System prompt instructs LLM on exercise matching and notation parsing

### ingest.ts (apps/thor-api/src/services/)
- **Purpose**: Transaction logic for logging workouts
- **Key Function**: `handleIngest(text, dateISO?, planId?)`
- **Features**:
  - Creates session-per-day (one session per date per plan)
  - **Duplicate prevention**: Checks if exercise already logged today before inserting
  - Fuzzy exercise name matching (exact → alias → substring)
  - Returns per-exercise status:
    - `logged`: Successfully added
    - `skipped_unknown_exercise`: Not found in plan for this day
    - `skipped_already_logged_today`: Already logged (duplicate)
  - Uses database transaction for atomicity

### plans.ts (apps/thor-api/src/services/)
- **Purpose**: Exercise database queries and normalization
- **Functions**:
  - `getDayExercises(planId, dow)`: Returns exercises for plan and day
  - `normalizeExercise(input, candidates)`: Fuzzy matching logic

### weekly-summary.ts (apps/thor-api/src/services/)
- **Purpose**: Weekly workout summary generation
- **Functions**:
  - `calculateWeeklyMetrics(planId, weekStart)`: Computes metrics
  - `generateWeeklySummary(planId, weekStart?)`: AI-powered summary generation
  - `getWeeklySummaries(planId, limit)`: Retrieve stored summaries
- **Volume Calculation**: Application-level calculation for array reps

### cron.ts (apps/thor-api/src/services/)
- **Purpose**: Automated task scheduling
- **Jobs**:
  - Weekly summary generation: Every Sunday at 6:00 PM
- **Function**: `initializeCronJobs()` called on server startup

## API Endpoints

### Workout Logging
- `POST /api/ingest` - Parse and log workout from natural language
  - Body: `{ text: string, date?: "YYYY-MM-DD", planId?: "thor" }`

### Data Retrieval
- `GET /api/day/:dow` - Get exercises for a day (1-7)
- `GET /api/workouts?date=YYYY-MM-DD` - Get workouts for specific date
- `GET /api/exercises?planId=thor&dow=1` - List exercises (filterable by day)
- `GET /api/exercises/:exerciseId/history?limit=50` - Exercise history with stats
- `GET /api/progress/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` - Analytics
- `GET /api/weekly-summaries?planId=thor&limit=10` - Get weekly summaries
- `GET /api/weekly-summaries/:id` - Get specific summary with full metrics

### Mutations
- `DELETE /api/workouts/:sessionId` - Delete workout session
- `PATCH /api/workouts/:logId` - Update exercise log
- `POST /api/weekly-summaries/generate` - Manually trigger summary generation

### System
- `GET /health` - Health check (tests DB connectivity)
- `GET /config` - Runtime config (LLM provider, model)
- `POST /api/admin/clear-logs` - Delete all workout data (dangerous)

## MCP Integration

The MCP server (`mcp/thor-mcp/`) exposes **8 tools** to AI agents:

1. **log_workout** - Parse and log workout from natural language
2. **get_today_exercises** - Get today's exercises from plan
3. **get_day_exercises** - Get exercises for specific day-of-week
4. **get_progress** - Get workout history and analytics
5. **get_workouts** - Get workouts for specific date range
6. **delete_workout** - Remove a workout session
7. **get_exercise_history** - Detailed history for specific exercise
8. **get_weekly_summaries** - Retrieve AI-generated weekly summaries

**Communication**: JSON-RPC over stdio

**Configuration**: Agents connect to MCP server via stdio transport

## Frontend Features

The web UI (`apps/thor-web/public/index.html`) is a single-file SPA with:

- **Natural Language Input**: Typing or speech-to-text (Web Speech API)
- **Weekly Reports Dashboard**: AI-generated summaries with:
  - Latest week card (sessions, volume, week-over-week % change)
  - AI coaching text from LLM
  - Top exercises breakdown
  - Historical summaries with trend indicators (📈 📉 ➡️)
  - "Generate Now" button for manual summary generation
- **Workout Management**: Edit and delete past workouts
- **Single Exercise Tracking**: Progress tracking with comprehensive stats
- **Progress Charts**: Last 30 days visualization (Chart.js)
- **Settings Modal**:
  - View LLM configuration (provider, model) - read-only
  - Shows which AI model parsed each workout (🤖 emoji)
  - Configurable API URL for mobile/LAN access

## Configuration

### Environment Variables (apps/thor-api/.env)

```env
# LLM Configuration (choose one)
USE_OLLAMA=true                    # Set to "true" for local Ollama
OLLAMA_URL=http://localhost:11434  # Ollama URL
OLLAMA_MODEL=llama3.1:8b           # Ollama model

OPENAI_API_KEY=sk-xxxxx            # Set for OpenAI instead

# Server
PORT=3000                          # API server port
```

**Important**: LLM config is read at server startup. To switch providers:
1. Edit `apps/thor-api/.env`
2. Restart API server

## Development Workflow

### Common Commands

```bash
# Install dependencies
npm install

# Development mode (hot reload)
npm run dev:api      # API server (http://localhost:3000)
npm run dev:web      # Web server (http://localhost:3001)
npm run dev:mcp      # MCP server (stdio)

# Build all workspaces
npm run build

# Run tests
npm run test         # All workspaces
npm run test:api     # API only

# Production
npm run start --workspace=thor-api

# Cleanup
npm run clean        # Remove dist/ and node_modules/
```

### Testing Changes

1. Start API server: `npm run dev:api`
2. Start web server: `npm run dev:web`
3. Visit UI: http://localhost:3001
4. Test health: `curl http://localhost:3000/health`
5. Test parsing:
   ```bash
   curl -X POST http://localhost:3000/api/ingest \
     -H "Content-Type: application/json" \
     -d '{"text":"floor press 4x12 @45"}'
   ```

### Adding New Features

**New Exercise**:
- Edit `apps/thor-api/src/seed.ts` (add to D1-D5 arrays)
- Delete `apps/thor-api/workout.db`
- Restart server to re-seed

**New API Endpoint**:
- Add route handler in `apps/thor-api/src/routes/index.ts`
- Use `db.prepare()` for SQL queries (better-sqlite3 sync API)
- Validate with Zod schemas

**Modify LLM Behavior**:
- Workout parsing: Edit prompt in `apps/thor-api/src/services/parser.ts:parseFreeform()`
- Weekly summaries: Edit prompt in `apps/thor-api/src/services/weekly-summary.ts:generateSummaryText()`

**Agent Behavior**:
- Modify system prompts in `agents/{thor-agent,health-agent,meta-runner}/src/agent.ts`
- All agents extend `BaseAgent` from `@thor/agent-core`

## Known Issues and Context

### Session-Per-Day Fix (In Progress)
- **Goal**: Ensure only one workout_session per date per plan
- **Current Status**: Logic exists in `ingest.ts` to reuse existing sessions
- **Check**: Line 36-64 in `apps/thor-api/src/services/ingest.ts`
- **Duplicate Prevention**: Exercise-level duplicate check implemented (lines 73-81)

### Variable Reps Implementation (Completed)
- **Feature**: Support arrays for bodyweight exercises (e.g., push-ups with variable reps per set)
- **Implementation**: TEXT column for `reps_per_set`, deserialization in controllers
- **Files**:
  - Storage: `apps/thor-api/src/services/ingest.ts` (lines 98-101)
  - Retrieval: `apps/thor-api/src/controllers/{exerciseController,workoutController}.ts`
  - Volume calculation: `apps/thor-api/src/services/weekly-summary.ts` (lines 25-38)

### Agent Refactoring (Completed)
- **Change**: Extracted shared BaseAgent class to `@thor/agent-core` package
- **Benefit**: DRY code, consistent agent behavior, easier maintenance
- **Usage**: All agents import and extend `BaseAgent`

## Deployment

**Docker Compose**:
- All services containerized
- Services: thor-api, thor-agent, health-agent, meta-runner
- Persistent volume for SQLite database
- Configuration: `docker-compose.yml` in root

**Raspberry Pi Deployment**:
- Dedicated configs in `pi/` directory
- Local Ollama for AI processing
- Lightweight deployment target

## Roadmap

**Completed Phases**:
- ✅ Phase 1: CLI Prototype
- ✅ Phase 2: LLM Parsing
- ✅ Phase 3: Monorepo & MCP
- 🔄 Phase 3.5: Agentic Health Layer (Current)

**Next Phases**:
- Phase 4: Voice & Dictation
- Phase 5: Mobile App
- Phase 6: AI Coach & Insights
- Phase 7: Multi-User & Cloud Sync

**Planned Features**:
- Voice control and speech-to-text
- Trend detection and anomaly alerts
- Periodization planning
- Multi-device sync
- Social features and shared workouts

## Important Files for Reference

- `README.md` - Main project documentation
- `ARCHITECTURE.md` - Detailed request flow and LLM architecture
- `CLAUDE.md` - Development guide for Claude Code
- `apps/thor-api/src/seed.ts` - Database schema definition
- `apps/thor-api/src/services/ingest.ts` - Core workout logging logic
- `apps/thor-api/src/services/parser.ts` - LLM parsing integration
- `packages/agent-core/src/BaseAgent.ts` - Shared agent infrastructure
- `agents/meta-runner/src/agent.ts` - Query routing logic
- `mcp/thor-mcp/README.md` - MCP tool documentation

## TypeScript Conventions

- **Module System**: ESM (`"type": "module"`)
- **Module Resolution**: NodeNext (requires `.js` extensions in imports)
- **Imports**: Use `.js` extension even for `.ts` files: `import { foo } from "./bar.js"`
- **Strict Mode**: Enabled
- **Output**: Compiled to `dist/` directory

## Summary for Feature Development

When building new features, consider:

1. **Data Flow**: User → Meta-runner → Specialist Agent → MCP → API → Database
2. **LLM Usage**: Agent-level (conversational) vs API-level (parsing)
3. **Monorepo Structure**: Separate workspaces for concerns
4. **Database Schema**: TEXT for flexible columns, proper deserialization in controllers
5. **Agent Pattern**: Extend BaseAgent, register MCP tools, handle messages
6. **API Design**: Express routes with Zod validation, better-sqlite3 sync queries
7. **Testing**: Start dev servers, curl endpoints, verify UI

This project prioritizes local-first privacy, AI-native interaction, and extensible agent-based architecture.
