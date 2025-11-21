# Phase 2: Comprehensive Test Plan

**Goal:** Achieve ~80% code coverage with Vitest

**Test Framework:** Vitest
**Mocking:** vi.mock() for external dependencies
**Database:** In-memory SQLite for API tests

---

## Test Organization

```
tests/
├── helpers/                    # Shared test utilities
│   ├── db.ts                  # Test database setup/teardown
│   ├── fixtures.ts            # Sample data (workouts, health events)
│   ├── mcp-mock.ts            # Mock MCP client
│   └── llm-mock.ts            # Mock LLM responses
│
├── unit/                      # Unit tests (isolated components)
│   ├── api/
│   ├── mcp/
│   ├── agents/
│   └── meta-runner/
│
├── integration/               # Integration tests (component interactions)
│   ├── api-to-db.test.ts
│   ├── mcp-to-api.test.ts
│   ├── agent-to-mcp.test.ts
│   └── meta-runner-to-agents.test.ts
│
└── e2e/                       # End-to-end tests (full flows)
    ├── workout-logging.test.ts
    ├── health-logging.test.ts
    ├── overview-query.test.ts
    └── router-classification.test.ts
```

---

## 1. API Tests (apps/thor-api/tests/)

### 1.1 Database Tests (`tests/db/`)
- **database.test.ts**
  - ✓ Database initialization
  - ✓ Table creation (plans, exercises, workout_sessions, exercise_logs, health_events, weekly_summaries)
  - ✓ Foreign key constraints
  - ✓ Unique constraints
  - ✓ Default values

- **seed.test.ts**
  - ✓ Seed data insertion (thor plan, exercises, aliases)
  - ✓ Day-of-week organization (1-7)
  - ✓ Exercise aliases (fuzzy matching data)

### 1.2 Service Tests (`tests/services/`)
- **parser.test.ts**
  - ✓ `parseFreeform()` with Ollama (mocked)
  - ✓ `parseFreeform()` with OpenAI (mocked)
  - ✓ Handle multiple exercises
  - ✓ Handle various rep formats: `4x12`, `4*12`, `11,8,5`
  - ✓ Handle weight formats: `@45`, `with 45 lbs`, `45lbs`
  - ✓ Extract contextual notes ("brutal", "easy", "PR")
  - ✓ Error handling (invalid JSON, API errors)

- **plans.test.ts**
  - ✓ `getDayExercises()` returns correct exercises for day
  - ✓ `normalizeExercise()` exact match
  - ✓ `normalizeExercise()` alias match
  - ✓ `normalizeExercise()` substring match
  - ✓ `normalizeExercise()` no match returns null

- **ingest.test.ts**
  - ✓ `handleIngest()` creates workout_session
  - ✓ `handleIngest()` creates exercise_logs
  - ✓ Prevents duplicate exercises in same day
  - ✓ Skips unknown exercises
  - ✓ Stores LLM metadata (provider, model)
  - ✓ Transaction rollback on error

- **weekly-summary.test.ts**
  - ✓ `calculateWeeklyMetrics()` counts sessions
  - ✓ `calculateWeeklyMetrics()` calculates total volume
  - ✓ `calculateWeeklyMetrics()` week-over-week comparison
  - ✓ `generateWeeklySummary()` calls LLM (mocked)
  - ✓ `generateWeeklySummary()` stores in database
  - ✓ `getWeeklySummaries()` returns recent summaries

- **cron.test.ts**
  - ✓ Cron job registration
  - ✓ Manual trigger `triggerWeeklySummary()`
  - ✓ Weekly summary generation on schedule (mocked timer)

### 1.3 Route Tests (`tests/routes/`)
- **ingest.test.ts**
  - ✓ `POST /api/ingest` - success with valid workout
  - ✓ `POST /api/ingest` - with custom date
  - ✓ `POST /api/ingest` - validation errors
  - ✓ Returns per-exercise status (logged, skipped_unknown, skipped_duplicate)

- **progress.test.ts**
  - ✓ `GET /api/progress/summary` - with date range
  - ✓ Returns sessions, topLifts, recent workouts

- **workouts.test.ts**
  - ✓ `GET /api/workouts?date=YYYY-MM-DD` - returns workouts for date
  - ✓ `DELETE /api/workouts/:sessionId` - deletes session and logs

- **exercises.test.ts**
  - ✓ `GET /api/exercises` - returns all exercises
  - ✓ `GET /api/exercises?dow=1` - filters by day
  - ✓ `GET /api/exercises/:id/history` - returns exercise history with stats

- **health-events.test.ts**
  - ✓ `POST /api/health-events` - create health event
  - ✓ `GET /api/health-events` - list with filters (category, date range)
  - ✓ `DELETE /api/health-events/:id` - delete event

- **weekly-summaries.test.ts**
  - ✓ `GET /api/weekly-summaries` - list summaries
  - ✓ `GET /api/weekly-summaries/:id` - get specific summary
  - ✓ `POST /api/weekly-summaries/generate` - manually trigger

---

## 2. MCP Server Tests

### 2.1 Thor MCP Tests (`mcp/thor/tests/`)
- **tools/log_workout.test.ts**
  - ✓ Parses workout text via API `/api/ingest`
  - ✓ Returns success response
  - ✓ Handles API errors gracefully
  - ✓ Validates required parameters

- **tools/get_today_exercises.test.ts**
  - ✓ Fetches exercises for today's day-of-week
  - ✓ Returns exercise list with aliases
  - ✓ Handles API errors

- **tools/get_progress_summary.test.ts**
  - ✓ Fetches progress summary from API
  - ✓ Handles custom period (days)
  - ✓ Returns formatted summary

- **tools/get_workout_history.test.ts**
  - ✓ Fetches workout history for date range
  - ✓ Returns structured data

- **tools/delete_workout.test.ts**
  - ✓ Deletes workout session by ID
  - ✓ Returns confirmation

- **server.test.ts**
  - ✓ Lists all tools via `tools/list`
  - ✓ Calls tools via `tools/call`
  - ✓ Health check endpoint
  - ✓ Error handling for invalid tool names

### 2.2 Health MCP Tests (`mcp/health/tests/`)
- **tools/log_health_event.test.ts**
  - ✓ Creates health event via API
  - ✓ Validates required fields (date, category)
  - ✓ Supports all categories (sleep, migraine, run, yardwork, other)
  - ✓ Handles optional fields (duration_minutes, intensity, notes)

- **tools/get_health_events.test.ts**
  - ✓ Fetches health events with filters
  - ✓ Supports category filter
  - ✓ Supports date range filter

- **tools/delete_health_event.test.ts**
  - ✓ Deletes health event by ID
  - ✓ Returns confirmation

- **server.test.ts**
  - ✓ Lists all tools via `tools/list`
  - ✓ Calls tools via `tools/call`
  - ✓ Health check endpoint

---

## 3. Agent Tests

### 3.1 Thor Agent Tests (`agents/thor/tests/`)
- **agent.test.ts**
  - ✓ `start()` connects to MCP server (mocked)
  - ✓ `stop()` disconnects from MCP server
  - ✓ `chat()` with Ollama (mocked)
    - ✓ Without tool calls (simple response)
    - ✓ With tool calls (executes MCP tools)
    - ✓ Multiple tool calls in sequence
  - ✓ `chat()` with OpenAI (mocked)
    - ✓ Without tool calls
    - ✓ With tool calls
  - ✓ `getSystemPrompt()` includes current date
  - ✓ Error handling (MCP not ready, LLM errors)

- **server.test.ts**
  - ✓ `POST /chat` - successful chat
  - ✓ `POST /chat` - with sessionId (conversation history)
  - ✓ `POST /chat` - reset conversation
  - ✓ `GET /health` - health check
  - ✓ `GET /sessions/:id` - get session history
  - ✓ `DELETE /sessions/:id` - clear session

### 3.2 Health Agent Tests (`agents/health/tests/`)
- **agent.test.ts**
  - ✓ `start()` connects to health-mcp server (mocked)
  - ✓ `stop()` disconnects
  - ✓ `chat()` with Ollama (mocked)
    - ✓ Logs sleep event
    - ✓ Logs migraine with intensity
    - ✓ Logs run with notes
  - ✓ `chat()` with OpenAI (mocked)
  - ✓ `getSystemPrompt()` includes health categories
  - ✓ Error handling

- **server.test.ts**
  - ✓ Same tests as thor-agent server
  - ✓ Port 3006 (not 3002)

---

## 4. Meta-Runner Tests (`apps/thor-meta-runner/tests/`)

### 4.1 Router Tests (`tests/services/router.test.ts`)
- **Intent Classification**
  - ✓ `routeQuery()` - WORKOUT intent
    - "floor press 4x12 @45"
    - "I did bench press today"
  - ✓ `routeQuery()` - HEALTH_LOG intent
    - "I slept 8 hours last night"
    - "Had a migraine, intensity 7"
  - ✓ `routeQuery()` - NUTRITION intent
    - "I ate chicken and rice"
  - ✓ `routeQuery()` - OVERVIEW intent
    - "What did I do yesterday?" (not logging!)
    - "Show me my progress"
    - "I need to log yesterday's workout" (OVERVIEW, not WORKOUT)
  - ✓ Edge cases and ambiguous queries

### 4.2 Meta-Runner Service Tests (`tests/services/metaRunner.test.ts`)
- ✓ `handleWorkout()` delegates to thor-agent
- ✓ `handleHealthLog()` delegates to health-agent
- ✓ `handleNutrition()` delegates to thor-agent
- ✓ `handleOverview()` delegates to thor-agent
- ✓ Error handling (agent unreachable)

### 4.3 Client Tests (`tests/clients/`)
- **thorApiClient.test.ts**
  - ✓ `ThorAgentClient.sendMessage()` success
  - ✓ `ThorAgentClient.logWorkout()` formats message
  - ✓ Connection errors (ECONNREFUSED)

- **healthAgentClient.test.ts**
  - ✓ `HealthAgentClient.sendMessage()` success
  - ✓ `HealthAgentClient.logHealthEvent()` formats message
  - ✓ Connection errors

---

## 5. Integration Tests (`tests/integration/`)

### 5.1 API to Database (`api-to-db.test.ts`)
- ✓ Full workout logging flow (parser → ingest → database)
- ✓ Full health event logging flow (API → database)
- ✓ Transaction integrity (rollback on error)

### 5.2 MCP to API (`mcp-to-api.test.ts`)
- ✓ Thor-MCP `log_workout` calls thor-api `/api/ingest`
- ✓ Health-MCP `log_health_event` calls thor-api `/api/health-events`
- ✓ MCP error propagation

### 5.3 Agent to MCP (`agent-to-mcp.test.ts`)
- ✓ Thor-agent calls thor-mcp tools
- ✓ Health-agent calls health-mcp tools
- ✓ Tool result parsing
- ✓ Multiple tool calls in one conversation

### 5.4 Meta-Runner to Agents (`meta-runner-to-agents.test.ts`)
- ✓ Meta-runner routes workout to thor-agent
- ✓ Meta-runner routes health event to health-agent
- ✓ Meta-runner routes overview to thor-agent
- ✓ Agent selection based on intent

---

## 6. End-to-End Tests (`tests/e2e/`)

### 6.1 Full Workout Flow (`workout-logging.test.ts`)
**Flow:** User → Meta-Runner → Thor-Agent → Thor-MCP → Thor-API → Database

- ✓ Log workout: "floor press 4x12 @45, rows 4x10 @35"
  - Verify routing to WORKOUT intent
  - Verify thor-agent receives request
  - Verify thor-mcp tool called
  - Verify database has workout_session + exercise_logs
  - Verify response to user

### 6.2 Full Health Logging Flow (`health-logging.test.ts`)
**Flow:** User → Meta-Runner → Health-Agent → Health-MCP → Thor-API → Database

- ✓ Log sleep: "I slept 8 hours last night"
  - Verify routing to HEALTH_LOG intent
  - Verify health-agent receives request
  - Verify health-mcp tool called
  - Verify database has health_events record (category: sleep)

- ✓ Log migraine: "Had a migraine today, intensity 7"
  - Verify database has intensity field

### 6.3 Overview Query Flow (`overview-query.test.ts`)
**Flow:** User → Meta-Runner → Thor-Agent → Thor-MCP → Thor-API

- ✓ "What did I do yesterday?"
  - Verify routing to OVERVIEW (not WORKOUT!)
  - Verify thor-agent fetches workout history
  - Verify response summarizes past data

- ✓ "Show me my progress this week"
  - Verify calls `get_progress_summary` tool

### 6.4 Router Classification (`router-classification.test.ts`)
**Critical Test:** Verify router intent detection fixes

- ✓ "I need to log yesterday's workout" → OVERVIEW (not WORKOUT)
- ✓ "Log today's workout: bench press 4x10" → WORKOUT
- ✓ "What exercises should I do today?" → OVERVIEW
- ✓ "I did floor press yesterday" → WORKOUT (past tense logging)
- ✓ Edge cases and ambiguous queries

---

## 7. Test Helpers (`tests/helpers/`)

### 7.1 Database Helper (`db.ts`)
```typescript
export async function setupTestDb(): Promise<Database>
export async function teardownTestDb(db: Database): Promise<void>
export async function seedTestData(db: Database): Promise<void>
export async function clearTestData(db: Database): Promise<void>
```

### 7.2 Fixtures (`fixtures.ts`)
```typescript
export const mockWorkoutText = "floor press 4x12 @45, rows 4x10 @35"
export const mockParsedWorkout = { exercises: [...] }
export const mockHealthEvent = { category: "sleep", duration_minutes: 480 }
export const mockWeeklySummary = { ... }
```

### 7.3 MCP Mock (`mcp-mock.ts`)
```typescript
export class MockMCPClient {
  async start(): Promise<void>
  stop(): void
  getTools(): Tool[]
  async callTool(name: string, args: any): Promise<any>
}
```

### 7.4 LLM Mock (`llm-mock.ts`)
```typescript
export function mockOllamaResponse(content: string, toolCalls?: any[])
export function mockOpenAIResponse(content: string, toolCalls?: any[])
```

---

## 8. Coverage Goals

**Target: ~80% overall coverage**

### Per-Component Targets:
- **thor-api**: 85% (critical business logic)
  - Routes: 90%
  - Services: 85%
  - Database: 80%

- **MCP Servers**: 80%
  - Tools: 85%
  - Server: 75%

- **Agents**: 75%
  - Agent logic: 80%
  - Server routes: 70%

- **Meta-Runner**: 85% (critical routing logic)
  - Router: 95% (most critical!)
  - Service: 80%
  - Clients: 75%

---

## 9. Testing Strategy

### Mocking Strategy
- **Database**: Use in-memory SQLite (`:memory:`)
- **LLM APIs**: Mock all Ollama/OpenAI calls
- **HTTP Requests**: Mock axios with `vi.mock()`
- **MCP Clients**: Mock MCP client for agent tests
- **Time**: Mock `new Date()` for date-dependent tests

### Test Execution
```bash
# Run all tests
npm run test

# Run with coverage
npm run test:coverage

# Run specific test file
npm run test -- ingest.test.ts

# Run in watch mode
npm run test:watch

# Run only integration tests
npm run test -- tests/integration

# Run only e2e tests
npm run test -- tests/e2e
```

### CI/CD Integration
- Run tests on every commit
- Fail build if coverage drops below 75%
- Generate coverage reports (HTML, JSON)

---

## 10. Priority Order

**Phase 2A: Foundation (Week 1)**
1. Test helpers (db, fixtures, mocks)
2. API service tests (parser, plans, ingest)
3. API route tests (ingest, workouts, health-events)

**Phase 2B: MCP & Agents (Week 2)**
4. MCP tool tests (thor-mcp, health-mcp)
5. Agent tests (thor-agent, health-agent)

**Phase 2C: Integration (Week 3)**
6. Meta-runner tests (router, service, clients)
7. Integration tests (component interactions)
8. E2E tests (full flows)

**Phase 2D: Polish (Week 4)**
9. Coverage optimization (fill gaps)
10. Edge case testing
11. Documentation and CI/CD setup

---

## 11. Next Steps

After creating this test plan, we will:
1. Set up Vitest configuration
2. Create test helpers
3. Write tests in priority order
4. Monitor coverage and adjust
5. Document test patterns and best practices

**Ready to begin implementation?**
