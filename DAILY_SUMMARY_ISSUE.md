# Feature: Daily Summary AI Report

## Problem

Users complete daily nutrition, workout, and activity tracking but lack a concise, intelligent synthesis of their day. Currently, they must manually review disparate data points to understand progress toward fat loss, muscle building, and DASH diet adherence. This creates friction and reduces coaching value.

## Goals

1. **Generate actionable daily summaries** using AI that synthesize nutrition, training, and activity data
2. **Provide DASH + cholesterol-aware feedback** specific to the user's health needs (genetically high cholesterol, on Repatha + statin + ezetimibe)
3. **Support fat loss + muscle building goals** with firm, motivating coaching tone (David Goggins/James Cameron vibe)
4. **Store summaries** for daily/weekly/monthly review and historical tracking
5. **Enable structured output** for both UI display (markdown) and programmatic use (JSON sections)
6. **Ensure deterministic, consistent results** suitable for daily coaching use (low temperature, stable formatting)

## Non-Goals

- Medical advice or medication changes (strictly dietary/training guidance only)
- Real-time processing or sub-second latency requirements
- Support for multiple language outputs in initial release
- Integration with wearable APIs (assumes manual entry)
- Prescription-level nutrition planning

## Proposed Approach

### High-Level Flow (User Interaction)

```
1. User clicks "Generate Daily Summary" button on index.html
    ↓
2. Frontend fetches POST /api/daily-summary with today's date
    ↓
3. Backend collects today's data:
   - Nutrition logs (meals)
   - Workout sessions (exercises, sets, reps, weight)
   - Run logs (distance, pace, HR)
   - Health events (steps, active minutes, sleep)
   - Activity notes
    ↓
4. Validate & normalize data against schema (Zod)
    ↓
5. Build LLM prompt (system + user messages)
    ↓
6. Call LLM provider (deterministic temp = 0.2–0.3)
    ↓
7. Parse & structure output (markdown + JSON sections)
    ↓
8. Store in SQLite by date
    ↓
9. Return summary to frontend (markdown + sections)
    ↓
10. Frontend displays summary in modal/toast
```

### Data Collection Step

When `POST /api/daily-summary` is called with a date, the backend must:
- Query `meals` table for entries matching the date
- Query `workout_sessions` + `exercise_logs` for the date
- Query `runs` (from Strava or manual logs) for the date
- Query `health_events` (steps, sleep, etc.) for the date
- Aggregate nutrition totals (calories, protein, carbs, fat, sodium, fiber, etc.)
- Combine into the `DailySummaryInput` JSON shape
- Pass to service for LLM processing

### New Module: `src/services/dailySummary.ts`

**Responsibilities:**

- **Schema definition & validation** (Zod): Accept daily JSON, validate all fields (add to `@thor/shared` schemas)
- **Data normalization**: Handle missing fields, unit conversions, default values
- **Prompt builder**: Construct system + user messages from profile + daily data
- **LLM integration**: Use existing `getLLMConfigForUsage()` pattern with low temperature (0.2–0.3)
- **Output parser**: Extract markdown sections + optional JSON structure
- **Storage layer**: Persist to SQLite via `better-sqlite3` (existing `db` instance) with date as key

**Key exports:**

```typescript
export async function generateDailySummary(
  payload: DailySummaryInput
): Promise<DailySummaryOutput>

export function buildDailySummaryPrompt(
  userProfile: UserProfile,
  dailyData: NormalizedDailyData
): { system: string; user: string }

export function calculateDailySummaryMetrics(
  dailyData: NormalizedDailyData
): DailySummaryMetrics

export function storeDailySummary(summary: DailySummaryOutput): void
export function getDailySummary(date: string): DailySummaryOutput | null
```

---

## Data Contract (JSON Schema)

### Input Payload

```json
{
  "date": "YYYY-MM-DD",
  "timezone": "America/New_York",
  "userProfile": {
    "age": 41,
    "sex": "male",
    "weight_lbs": 195,
    "diet": "DASH",
    "cholesterolNotes": "genetically high cholesterol; LDL under 70 with meds",
    "goals": ["fat loss", "muscle building", "better consistency"]
  },
  "nutrition": {
    "meals": [
      {
        "time": "HH:MM",
        "items": [
          {
            "name": "string",
            "quantity": "string (e.g., 1 cup)",
            "calories": 0,
            "protein_g": 0,
            "carbs_g": 0,
            "fat_g": 0,
            "sat_fat_g": 0,
            "fiber_g": 0,
            "sodium_mg": 0
          }
        ],
        "notes": "optional string"
      }
    ],
    "totals": {
      "calories": 0,
      "protein_g": 0,
      "carbs_g": 0,
      "fat_g": 0,
      "sat_fat_g": 0,
      "fiber_g": 0,
      "sodium_mg": 0,
      "water_oz": 0
    }
  },
  "training": {
    "workout": {
      "planName": "Thor Dumbbell-Only",
      "day": 1,
      "title": "Chest, Triceps & Core",
      "exercises": [
        {
          "name": "Dumbbell Floor Press",
          "sets": [
            {
              "reps": 12,
              "weight_lbs_each": 0,
              "rpe": 0
            }
          ],
          "notes": "optional string"
        }
      ],
      "duration_min": 0
    },
    "run": {
      "distance_miles": 0,
      "pace_min_per_mile": "MM:SS",
      "avg_hr": 0,
      "max_hr": 0,
      "duration_min": 0,
      "conditions": "optional string (humidity/temp)",
      "notes": "optional string"
    }
  },
  "activity": {
    "steps": 0,
    "active_minutes": 0
  },
  "sleep": {
    "duration_hours": 0,
    "quality": "optional string"
  },
  "notes": "optional freeform notes about the day, cravings, stress, headaches, etc."
}
```

### Output: DailySummaryOutput

```json
{
  "date": "YYYY-MM-DD",
  "markdown": "## Highlights\n...",
  "sections": {
    "highlights": ["5-8 bullet points"],
    "dashHeartHealthy": "sodium, sat fat, fiber, quality indicators, suggestions",
    "proteinRecovery": "protein vs target, hydration note, recovery suggestions",
    "training": "what was trained, intensity, progression for tomorrow",
    "redFlags": "warnings if applicable (empty if none)",
    "tomorrowPriorities": "1-3 key focus areas"
  },
  "generatedAt": "ISO 8601 timestamp"
}
```

---

## Prompt Template

**SYSTEM MESSAGE:**

```
You are a fitness + nutrition coach specializing in DASH diet adherence, heart-healthy eating, and fat loss with muscle retention. You are not a doctor. Do not provide medical advice, diagnosis, or medication changes. Be direct and motivating (David Goggins / James Cameron vibe), but respectful and constructive.
```

**USER MESSAGE:**

```
User profile:
- Age: 41, male, ~195 lbs, abdominal fat ("dad bod")
- DASH diet
- Genetically high cholesterol (absorption-related), LDL < 70 and managed with meds (do not advise on meds)
Goals: fat loss, muscle building, consistency.

Today's data (JSON):
<PASTE_JSON_HERE>

Tasks:
1) Produce a Daily Summary in MARKDOWN with these sections and exact headings:
## Highlights
## DASH & Heart-Healthy Check
## Protein & Recovery
## Training Review
## Red Flags
## Tomorrow's Priorities

2) Keep it concise and actionable. Use numbers when possible (protein, sodium, fiber).
3) If data is missing, say what's missing and what to track tomorrow—don't invent numbers.
4) Suggestions must be practical and not require long-distance running.
```

**LLM Settings:**

- **Temperature:** 0.2–0.3 (very deterministic, stable daily use)
- **Model:** Use existing LLM config abstraction via `getLLMConfigForUsage("daily_summary")` (add new usage kind; recommend GPT-4 or Claude 3.5 Sonnet)
- **Max tokens:** 1,500
- **Top-p:** 0.9

---

## API Design

### Endpoint 1: Generate/Store Summary

**POST** `/api/daily-summary`

**Request Body:**

```json
{
  "date": "2025-01-19"
}
```

**How it works:**
1. Backend receives date (YYYY-MM-DD)
2. Queries all tables for data matching that date (meals, workout_sessions, exercise_logs, runs, health_events, etc.)
3. Aggregates nutrition totals and training metrics
4. Builds `DailySummaryInput` JSON from DB data
5. Validates & normalizes
6. Generates summary via LLM
7. Stores result
8. Returns to frontend

**Response (200 OK):**

```json
{
  "date": "2025-01-19",
  "markdown": "## Highlights\n- Nailed protein...",
  "sections": {
    "highlights": [...],
    "dashHeartHealthy": "...",
    "proteinRecovery": "...",
    "training": "...",
    "redFlags": "",
    "tomorrowPriorities": "..."
  },
  "generatedAt": "2025-01-19T14:32:00Z"
}
```

**Error Responses:**

- **400 Bad Request:** Invalid date format or no data found for date
- **500 Internal Server Error:** LLM call failure (timeout, API error, etc.)

**Implementation:** Use `express.Router()` in `src/routes/dailySummary.ts` and `asyncHandler()` wrapper for errors (see `src/middleware/errorHandler.ts`)

---

### Endpoint 2: Retrieve Stored Summary

**GET** `/api/daily-summaries/:date`

**URL Params:** `date` (YYYY-MM-DD format)

**Response (200 OK):**

```json
{
  "date": "2025-01-19",
  "markdown": "## Highlights\n...",
  "sections": { ... },
  "generatedAt": "2025-01-19T14:32:00Z"
}
```

**Error Responses:**

- **404 Not Found:** No summary exists for given date
- **400 Bad Request:** Invalid date format

---

### CLI Command (Optional, Recommended)

For testing/backfill scenarios:

```bash
npm run daily-summary --date=2025-01-19 --payload=./sample-payload.json
```

---

## Storage / History

### Database Schema

**Table:** `daily_summaries` (Add to `src/seed.ts` schema initialization)

```sql
CREATE TABLE IF NOT EXISTS daily_summaries (
  date TEXT PRIMARY KEY,
  markdown TEXT NOT NULL,
  sections JSON NOT NULL,
  generated_at TEXT NOT NULL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_daily_summaries_date ON daily_summaries(date DESC);
```

### Persistence Strategy

- **Insert or Update:** On POST to `/api/daily-summary`, upsert by date using `INSERT OR REPLACE` (allow regeneration/correction)
- **Use existing `db` instance:** All queries via `better-sqlite3` (already configured in `src/db.ts`)
- **Immutable Generated Timestamp:** Store `generatedAt` to track when summary was created
- **JSON Storage:** Use SQLite's JSON column for `sections` to enable querying specific fields (future enhancement)

---

## Error Handling

### Validation Errors

- **Missing required fields:** Return 400 with field-level errors
- **Invalid format (e.g., bad date, negative calories):** Return 400 with specific message
- **Schema mismatch:** Log full validation error; return user-friendly 400

### LLM Errors

- **API timeout:** Retry once (via existing LLM config), then return 500 with `{ error: "LLM service unavailable" }`
- **Malformed response:** Log raw response at ERROR level; return 500 with generic error
- **Provider error:** Return 500 with message (use `ApiError` class from `src/middleware/errorHandler.ts`)

### Data Normalization Errors

- **Missing nutritional totals:** Warn in logs; compute from meals if possible, or return note in summary
- **Conflicting workout/run data:** Use workout if present; ignore run in summary if malformed

### Logging

- Log all LLM prompts + responses (at DEBUG level, PII-masked if needed)
- Log validation failures with full payload (rate-limited to prevent spam)
- Track latency per LLM call

---

## Privacy & Data Security

1. **No PHI beyond user ID:** Daily summaries do NOT store SSN, email, medical diagnoses
2. **Nutrition data:** Store macros/micros; never store full item names or meal details if containing PII
3. **Training data:** Store only aggregated metrics (duration, HR, pace); not GPS coordinates or location
4. **Retention:** Allow user to set retention policy (e.g., delete after 90 days); default: 1 year
5. **Encryption at rest:** If using cloud DB, ensure TLS in transit + encryption at rest
6. **Audit logging:** Track who accessed summaries (if multi-user later)

---

## Acceptance Criteria

- [ ] Given a **valid daily JSON payload**, the system returns a markdown summary with required headings: Highlights, DASH & Heart-Healthy Check, Protein & Recovery, Training Review, Red Flags, Tomorrow's Priorities
- [ ] Output **includes at least one DASH-related observation** (sodium, saturated fat, or fiber) when nutrition totals exist
- [ ] Output **includes a protein note** (vs. target estimate) when protein data exists
- [ ] Output **includes training feedback** (type, intensity, progression) when workout or run exists
- [ ] Output **does NOT contain medical advice**; includes a short privacy/disclaimer line at the end
- [ ] Summary is **stored in SQLite by date** and retrievable via GET `/api/daily-summary/:date`
- [ ] **POST endpoint** accepts payload and returns summary + sections (both markdown and JSON)
- [ ] **Error responses** are user-friendly and include validation details for 400 errors
- [ ] **Unit tests** cover:
  - Schema validation (valid, invalid, edge cases)
  - Prompt builder (correct user profile interpolation, formatting)
  - Output parser (extracts all 6 sections from markdown)
  - Data normalization (missing fields, unit conversions)
  - Storage/retrieval (insert, update, fetch by date)
- [ ] **Integration test:** E2E flow from payload → LLM call → storage → retrieval
- [ ] **Documentation:** README in `src/services/` with usage examples and schema reference

---

## Implementation Tasks

### Task 0: Add LLM Usage Kind
- [ ] Update `src/services/llm-config.ts`: Add `"daily_summary"` to `LLMUsageKind` type
- [ ] Update `initializeFromEnv()` to configure `daily_summary` with low temperature (0.2–0.3)
- [ ] Update `RuntimeLLMConfig` interface to include `daily_summary` field

### Task 1: Define Schema & Validation
- [ ] Add Zod schemas to `packages/shared/src/schemas.ts` (not a new file):
  - `DailySummaryInput` schema
  - `DailySummaryUserProfile` schema
  - `DailySummaryNutrition` schema
  - `DailySummaryTraining` schema
  - Etc.
- [ ] Export types from `packages/shared/src/index.ts`
- [ ] Write unit tests for schema validation (valid cases, edge cases, invalid cases)
- [ ] Document nullable/optional fields and defaults

### Task 2: Data Normalization & Defaults
- [ ] Create `src/services/dailySummary/normalize.ts`
- [ ] Implement normalization: unit conversions, missing fields (default to 0 or empty), timezone handling
- [ ] Handle partial meal data (e.g., calories without protein)
- [ ] Write unit tests for edge cases (missing nutrition, partial workout, etc.)

### Task 3: Prompt Builder
- [ ] Create `src/services/dailySummary/promptBuilder.ts`
- [ ] Implement `buildDailySummaryPrompt(userProfile, normalizedData): { system, user }`
- [ ] Ensure user profile is always included verbatim (age, diet, cholesterol notes, goals)
- [ ] Embed daily data as pretty-printed JSON in user message
- [ ] Write unit tests: verify system prompt, verify user message structure, check interpolation

### Task 4: LLM Integration Wrapper
- [ ] Create `src/services/dailySummary/llmCall.ts`
- [ ] Define interface for LLM provider (use existing app abstraction if available; create if not)
- [ ] Implement `callLLMForSummary(prompt): Promise<string>` with:
  - Temperature: 0.3–0.5
  - Max tokens: 1,500
  - Retry logic (1 retry on timeout)
  - Error handling (log failures, return structured error)
- [ ] Write unit tests with mocked LLM responses

### Task 5: Output Parser
- [ ] Create `src/services/dailySummary/outputParser.ts`
- [ ] Parse markdown response into sections: Highlights, DASH & Heart-Healthy Check, Protein & Recovery, Training Review, Red Flags, Tomorrow's Priorities
- [ ] Extract bullet points from each section
- [ ] Return `sections: { highlights: [...], dashHeartHealthy: "...", ... }`
- [ ] Write unit tests: verify section extraction, handle missing sections gracefully

### Task 6: Main Service & Orchestration
- [ ] Create `src/services/dailySummary/index.ts`
- [ ] Implement `generateDailySummary(payload): Promise<DailySummaryOutput>` that:
  1. Validates input
  2. Normalizes data
  3. Builds prompt
  4. Calls LLM
  5. Parses output
  6. Stores result
  7. Returns output
- [ ] Add logging at each step (debug for prompt/response, info for completion)
- [ ] Write integration test

### Task 7: Database Schema & Storage Layer
- [ ] Add schema to `src/seed.ts`: Create `daily_summaries` table on app startup
- [ ] Create `src/services/dailySummary/storage.ts` with:
  - `storeDailySummary(summary: DailySummaryOutput): void` (use INSERT OR REPLACE)
  - `getDailySummary(date: string): DailySummaryOutput | null` (query by date)
  - Use existing `db` instance from `src/db.ts`
- [ ] Write unit tests (mock DB) and integration tests (real DB via test fixture)

### Task 8: API Endpoints & Controller
- [ ] Create `src/controllers/dailySummaryController.ts` with:
  - `generateDailySummary(req: Request, res: Response)` → validate input, call service, return response
  - `getDailySummary(req: Request, res: Response)` → retrieve and return stored summary
  - Use `asyncHandler()` wrapper for error handling
- [ ] Create `src/routes/dailySummary.ts` (follow existing pattern in `summaries.ts`):
  - `POST /api/daily-summary` → calls `generateDailySummary`
  - `GET /api/daily-summaries/:date` → calls `getDailySummary`
- [ ] Register routes in `src/routes/index.ts`
- [ ] Write route tests (valid payload, invalid payload, not found, etc.)

### Task 9: CLI Command (Optional, Lower Priority)
- [ ] Create `src/cli/dailySummary.ts`
- [ ] Parse args: `--date`, `--payload` (file path)
- [ ] Load payload, call service, print result (markdown + JSON)
- [ ] Add to `apps/thor-api/package.json` scripts: `"daily-summary": "tsx src/cli/dailySummary.ts"`

### Task 10: Frontend Integration (UI Button & Display)
- [ ] Add "Generate Daily Summary" button to `apps/thor-web/public/index.html` (home page)
- [ ] Create `apps/thor-web/public/js/dailySummary.js` with:
  - `generateDailySummary(date)` function that calls POST `/api/daily-summary` with date
  - Parse response markdown + sections
  - Display summary in modal or toast notification
  - Show loading state while generating
  - Handle errors gracefully (show error message if LLM fails or no data found)
- [ ] Add CSS styling for summary display modal (optional: card-based layout with sections)
- [ ] Link button click event to `generateDailySummary()` with today's date
- [ ] Test with mock responses before backend is ready

### Task 11: Documentation
- [ ] Write `apps/thor-api/src/services/dailySummary/README.md`:
  - Overview & purpose
  - Usage examples (TypeScript service calls + cURL for API)
  - Data contract (schema overview with link to `@thor/shared`)
  - Configuration (LLM usage kind, how to adjust temperature)
  - Troubleshooting (common validation errors, LLM failures)
- [ ] Add JSDoc comments to all public functions in service
- [ ] Document error codes and handling in controller
- [ ] Add example curl requests to README

### Task 12: Tests & Coverage
- [ ] Unit tests in `apps/thor-api/src/__tests__/services/dailySummary/`:
  - `schema.test.ts` (valid/invalid inputs)
  - `normalize.test.ts` (missing fields, unit conversions)
  - `promptBuilder.test.ts` (correct interpolation)
  - `outputParser.test.ts` (section extraction)
  - `storage.test.ts` (mock DB operations)
- [ ] Integration test in `apps/thor-api/tests/services/`:
  - E2E payload → LLM → storage → retrieval (mock LLM)
- [ ] Route tests in `apps/thor-api/tests/routes/`:
  - POST valid date → 200 with summary
  - POST invalid date → 400
  - GET existing date → 200
  - GET non-existent date → 404
- [ ] Mock LLM responses for determinism (use existing test patterns from `summaryController` tests)
- [ ] Run `npm test` and confirm all pass (≥80% coverage target)

### Task 13: Code Review & Merge
- [ ] Submit PR with all above tasks
- [ ] Peer review for:
  - Prompt clarity (no accidental medical advice)
  - Error handling completeness
  - Type safety (strict TypeScript, no `any` types)
  - Logging at appropriate levels (debug for prompts, info for completions, error for failures)
  - Zod schema validation coverage
- [ ] Update main README.md and `MULTI_USER_NUTRITION_SETUP.md` with link to new feature
- [ ] Confirm all tests pass in CI/CD

---

## User Workflow

1. **User navigates to home page** (`apps/thor-web/public/index.html`)
2. **User has logged nutrition, workouts, runs, and activity data during the day** (via existing UI forms)
3. **User clicks "Generate Daily Summary" button**
4. **Frontend sends** `POST /api/daily-summary` with `{ "date": "2025-01-19" }`
5. **Backend:**
   - Queries all DB tables for entries matching 2025-01-19
   - Aggregates nutrition, training, activity data
   - Validates against schema
   - Builds LLM prompt
   - Calls LLM with deterministic settings
   - Parses output (6 markdown sections)
   - Stores in `daily_summaries` table
   - Returns structured response
6. **Frontend receives summary** and displays in modal:
   - Shows markdown-formatted summary
   - Can also render sections individually if desired
   - Include "dismiss" and "copy to clipboard" buttons
7. **User can retrieve past summaries** via GET `/api/daily-summaries/:date` (future UI for history view)

---

## Example Workflow

### Sample Request (from frontend)

```bash
# User clicks button on 2025-01-19 at 9 PM
curl -X POST http://localhost:3000/api/daily-summary \
  -H "Content-Type: application/json" \
  -d '{
    "date": "2025-01-19"
  }'
```

### Sample Response

The backend has queried the DB and found:
- 3 meals (breakfast, lunch, dinner) with full nutrition data
- 1 workout session (45 min chest/tri/core)
- 0 runs
- 8,500 steps logged
- 7.5 hours sleep

Response (200 OK):

```json
{
  "date": "2025-01-19",
  "markdown": "## Highlights\n- Hit 165g protein (above target), solid day\n- Strength session 45 min: Chest/Triceps/Core (RPE 7, manageable)\n- 8,500 steps + 60 min active time\n- Sodium right at goal (2,400 mg), good restraint\n\n## DASH & Heart-Healthy Check\n- Sodium: 2,400 mg (target met)\n- Saturated fat: 18g (under 20g target, good)\n- Fiber: 28g (above 25g minimum, excellent)\n- Overall: Solid DASH adherence today. Cholesterol-friendly macros.\n\n## Protein & Recovery\n- Protein: 165g (target likely 160-180g for your weight—right in zone)\n- Hydration: 100 oz water logged. Good hydration post-workout.\n- Recovery note: Slight elbow twinge noted; monitor form on pressing movements tomorrow.\n\n## Training Review\n- Dumbbell Floor Press: 12 reps @ 45 lbs, RPE 7 (good control, room to build)\n- Total: 45 min chest/tri/core focus\n- Progression: Weight felt solid; next session, try 47–50 lbs if form holds.\n\n## Red Flags\n(None detected today)\n\n## Tomorrow's Priorities\n1. Retest elbow before heavy pressing; light mobility work\n2. Maintain 160+ g protein (trending well)\n3. Log a run or extra 5K steps if time allows\n\n---\n*Disclaimer: This summary is for informational & coaching purposes only. Not medical advice. Always consult your physician before major diet or training changes.*",
  "sections": {
    "highlights": [
      "Hit 165g protein (above target), solid day",
      "Strength session 45 min: Chest/Triceps/Core (RPE 7, manageable)",
      "8,500 steps + 60 min active time",
      "Sodium right at goal (2,400 mg), good restraint"
    ],
    "dashHeartHealthy": "Sodium: 2,400 mg (target met)\nSaturated fat: 18g (under 20g target, good)\nFiber: 28g (above 25g minimum, excellent)\nOverall: Solid DASH adherence today. Cholesterol-friendly macros.",
    "proteinRecovery": "Protein: 165g (target likely 160-180g for your weight—right in zone)\nHydration: 100 oz water logged. Good hydration post-workout.\nRecovery note: Slight elbow twinge noted; monitor form on pressing movements tomorrow.",
    "training": "Dumbbell Floor Press: 12 reps @ 45 lbs, RPE 7 (good control, room to build)\nTotal: 45 min chest/tri/core focus\nProgression: Weight felt solid; next session, try 47–50 lbs if form holds.",
    "redFlags": "",
    "tomorrowPriorities": "1. Retest elbow before heavy pressing; light mobility work\n2. Maintain 160+ g protein (trending well)\n3. Log a run or extra 5K steps if time allows"
  },
  "generatedAt": "2025-01-19T14:32:00Z"
}
```

### Frontend Display

```html
<!-- Simple modal example -->
<div id="summaryModal" class="modal">
  <h2>Daily Summary — 2025-01-19</h2>
  <div id="summaryContent">
    <!-- Rendered markdown goes here -->
  </div>
  <button onclick="copyToClipboard()">Copy</button>
  <button onclick="closeSummaryModal()">Dismiss</button>
</div>
```

## Notes for Implementation

1. **User Profile:** Must always be embedded in the prompt; treat as immutable per session
2. **Determinism:** Use low temperature (0.2–0.3) via new `daily_summary` LLM usage kind; version your prompt template if updates are needed
3. **Tone:** Review LLM output for tone match; if too gentle or too harsh, adjust system prompt slightly
4. **Missing Data:** Summaries should explicitly call out what's missing (e.g., "No run logged today") rather than invent data
5. **Project Alignment:**
   - Use `@thor/shared` for all schemas (already used by other services: MealSchema, HealthEventSchema, etc.)
   - Follow existing error handling pattern: `asyncHandler()` + `ApiError` class
   - Use `db` instance from `src/db.ts` (better-sqlite3, already configured with WAL)
   - Follow existing LLM config pattern: `getLLMConfigForUsage()` with new usage kind
   - Mirror service/controller split like `weekly-summary.ts` / `summaryController.ts`
6. **Logging:** Use `console.log/error` (existing pattern); consider structured logging if project adds it
7. **Future Enhancements:** 
   - Weekly/monthly aggregate summaries
   - Streak tracking (e.g., "5 days of protein goal met")
   - Trend analysis (sodium patterns, protein consistency)
   - User feedback loop (user rates summary quality for model fine-tuning)

---

## Labels / Project Management

**Suggested Labels:**
- `feature`
- `epic: daily-summary`
- `backend`
- `database`
- `ai-integration`
- `priority: high`

**Estimated Effort:** 5–8 story points (assuming existing LLM abstraction; +3 points if creating from scratch)

**Dependencies:**
- Existing LLM provider integration (OpenAI, Anthropic, etc.)
- SQLite DB setup (already present)
- Node.js/TypeScript environment (already present)

---

## Closing

This issue provides a complete specification for the Daily Summary feature, including data contract, prompt template, API design, storage strategy, error handling, and a detailed implementation roadmap. Please read through and clarify any requirements before beginning work.

**Questions?** Please comment on this issue.
