# Thor Logger - Feature Enhancement Plan

**Generated:** 2025-11-12
**Status:** Planning Phase - DO NOT IMPLEMENT YET

---

## 📋 Overview

This document outlines a comprehensive feature enhancement plan for Thor Logger based on the current roadmap (README.md), UI redesign plan, and identified gaps in the codebase.

**Key Principle:** All new features MUST include tests before implementation.

---

## 🧪 Critical: Test Coverage for Recent Features

### Priority 1: Backfill Tests for Existing Features
*These features were recently added but lack test coverage*

#### 1.1 Notes Feature Tests
- **Location:** `src/__tests__/notes.test.ts`
- **Coverage Needed:**
  - Parser captures notes from natural language ("This was brutal")
  - Notes are stored in exercise_logs table
  - Notes are returned in API responses
  - Notes can be edited via PATCH /api/exercise-logs/:id
  - Notes can be cleared (set to null)
  - Variable reps notation combines with notes properly

#### 1.2 Duplicate Prevention Tests
- **Location:** `src/__tests__/duplicate-prevention.test.ts`
- **Coverage Needed:**
  - Cannot log same exercise twice on same day
  - Returns `skipped_already_logged_today` status
  - Can log different exercises on same day
  - Can log same exercise on different days
  - Duplicate check works across different sessions

#### 1.3 LLM Tracking Tests
- **Location:** `src/__tests__/llm-tracking.test.ts`
- **Coverage Needed:**
  - workout_sessions stores llm_provider and llm_model
  - Migration adds columns if they don't exist
  - ParseResult includes LLM metadata
  - API responses include LLM info
  - Works with both Ollama and OpenAI

#### 1.4 Weekly Summary Tests
- **Location:** `src/__tests__/weekly-summary.test.ts`
- **Coverage Needed:**
  - calculateWeeklyMetrics computes correct stats
  - Cron job configuration is valid
  - Manual generation endpoint works
  - Week-over-week comparison is accurate
  - Summary text generation (may need mocking)

#### 1.5 Parser Service Unit Tests
- **Location:** `src/__tests__/parser.test.ts`
- **Coverage Needed:**
  - Parses standard notation (4x12 @45)
  - Parses alternative formats (4*12, 4 x 12)
  - Handles variable reps (11, 8, 5)
  - Captures notes correctly
  - Normalizes weight units (lbs, pounds)
  - Matches exercises from valid list
  - Handles edge cases (missing data, malformed input)

---

## 🎯 Phase 2.5 Completion: Testing & Polish

### Priority 2: Complete UX Polish Items

#### 2.1 Personal Records (PRs) Tracking
- **Feature:** Automatically detect and highlight personal records
- **API Endpoints:**
  - `GET /api/exercises/:id/prs` - Get all-time PRs for exercise
  - `POST /api/prs/detect` - Scan recent logs for new PRs
- **Database:**
  - New table: `personal_records` (exercise_id, metric_type, value, date, log_id)
  - Metric types: max_weight, max_volume, max_reps
- **UI:**
  - Show 🏆 badge on new PRs
  - "Personal Records" section in Progress tab
  - PR history timeline per exercise
- **Tests Required:**
  - `src/__tests__/personal-records.test.ts`
  - PR detection logic (handles ties, validates metrics)
  - API endpoint tests
  - Edge cases (first workout, equal PR, broken PR)

#### 2.2 Workout Templates
- **Feature:** Save and reuse common workout patterns
- **API Endpoints:**
  - `GET /api/templates` - List saved templates
  - `POST /api/templates` - Create template from workout
  - `POST /api/templates/:id/apply` - Apply template to date
  - `DELETE /api/templates/:id` - Delete template
- **Database:**
  - New table: `workout_templates` (id, name, exercises_json, created_at)
- **UI:**
  - "Templates" button in Today tab
  - "Save as Template" option after logging
  - "Repeat Last Workout" quick action
- **Tests Required:**
  - `src/__tests__/templates.test.ts`
  - Template CRUD operations
  - Template application creates correct logs
  - Template validation

#### 2.3 Data Import/Export Enhancement
- **Feature:** Import CSV/JSON workout data
- **Current State:** Export exists, import missing
- **API Endpoints:**
  - `POST /api/import/csv` - Upload CSV file
  - `POST /api/import/json` - Upload JSON file
  - `POST /api/import/validate` - Preview import before commit
- **UI:**
  - Import button in History tab
  - File upload with drag-and-drop
  - Preview table before importing
  - Validation warnings/errors
- **Tests Required:**
  - `src/__tests__/data-import.test.ts`
  - CSV parsing and validation
  - JSON schema validation
  - Duplicate handling during import
  - Error cases (malformed data, missing fields)

---

## 🎤 Phase 3: Voice & Dictation Features

### Priority 3: Voice Input System

#### 3.1 Enhanced Web Speech API Integration
- **Feature:** Improve existing speech-to-text with better UX
- **Current State:** Basic Web Speech API exists in frontend
- **Enhancements:**
  - Real-time transcription display
  - Voice command detection ("start workout", "log next set")
  - Pause/resume functionality
  - Multiple language support
- **UI:**
  - Animated microphone button with visual feedback
  - Live transcription preview
  - Voice command hints
- **Tests Required:**
  - `src/__tests__/voice-commands.test.ts`
  - Command parsing logic
  - Transcription normalization
  - **Note:** Web Speech API is browser-only, needs mocking

#### 3.2 Offline Voice Processing (Optional)
- **Feature:** Local speech recognition using Whisper.cpp
- **Why:** Privacy-first, works offline
- **Implementation:**
  - Add optional Whisper.cpp integration
  - Audio recording in browser
  - Send to local endpoint for transcription
- **API Endpoints:**
  - `POST /api/transcribe` - Upload audio, return text
- **Dependencies:**
  - whisper.cpp Node.js bindings
  - Audio format conversion (ffmpeg)
- **Tests Required:**
  - `src/__tests__/transcription.test.ts`
  - Audio file handling
  - Transcription accuracy (with sample files)
  - Error handling (unsupported formats, corrupt files)

#### 3.3 Continuous Workout Mode
- **Feature:** Hands-free workout logging during session
- **Flow:**
  1. User says "start workout"
  2. System listens for exercise announcements
  3. Auto-saves after each exercise
  4. Says "finish workout" when done
- **UI:**
  - Dedicated "Workout Mode" view
  - Large, high-contrast display
  - Timer and set counter
  - Voice confirmations
- **Tests Required:**
  - `src/__tests__/workout-mode.test.ts`
  - State machine logic (idle → listening → processing → confirming)
  - Auto-save functionality
  - Session management

---

## 📈 Phase 4: Smart Insights & Recommendations

### Priority 4: AI-Powered Coaching

#### 4.1 Plateau Detection
- **Feature:** Automatically detect training plateaus
- **Algorithm:**
  - Track volume per exercise over 4-week windows
  - Plateau = <5% change for 3+ consecutive weeks
  - Flag exercises that are stalled
- **API Endpoints:**
  - `GET /api/insights/plateaus` - Get current plateaus
  - `GET /api/exercises/:id/trend` - Get trend analysis
- **UI:**
  - Warning badges on Today's Plan
  - "Insights" card in Progress tab
  - Suggestion: "Try progressive overload or deload week"
- **Tests Required:**
  - `src/__tests__/plateau-detection.test.ts`
  - Trend calculation algorithm
  - Threshold detection (5% change)
  - Edge cases (new exercises, irregular training)

#### 4.2 Progressive Overload Recommendations
- **Feature:** AI suggests next session's weights/reps
- **Algorithm:**
  - Analyze last 4 weeks of exercise data
  - If consistently hitting reps, suggest +5lbs
  - If struggling with reps, suggest deload or more sets
  - Use LLM to generate personalized advice
- **API Endpoints:**
  - `GET /api/recommendations/:exerciseId` - Get next workout suggestion
  - `POST /api/recommendations/apply` - Apply recommendation
- **UI:**
  - Suggestion chips on Today's Plan
  - "AI recommends: 50lbs (+5)" with rationale
  - Accept/dismiss buttons
- **Tests Required:**
  - `src/__tests__/recommendations.test.ts`
  - Recommendation algorithm (various scenarios)
  - LLM prompt generation
  - Boundary conditions (max weight, deload needed)

#### 4.3 Muscle Group Balance Analysis
- **Feature:** Detect muscle imbalances
- **Data Model:**
  - Map exercises to muscle groups (chest, back, legs, shoulders)
  - Calculate volume per muscle group per week
  - Flag if ratio is >2:1 (push vs pull, upper vs lower)
- **API Endpoints:**
  - `GET /api/insights/balance` - Get muscle group breakdown
- **UI:**
  - Pie chart in Progress tab
  - Warning: "Back volume is 60% lower than chest"
  - Suggestions: "Add more rows/deadlifts"
- **Tests Required:**
  - `src/__tests__/muscle-balance.test.ts`
  - Exercise-to-muscle-group mapping
  - Volume calculation per group
  - Imbalance detection thresholds

#### 4.4 Periodization Planner
- **Feature:** Auto-generate training cycles
- **Phases:**
  - Hypertrophy (8-12 reps, moderate weight)
  - Strength (3-5 reps, heavy weight)
  - Deload (reduced volume, recovery)
- **API Endpoints:**
  - `GET /api/periodization/current` - Get current phase
  - `POST /api/periodization/generate` - Create new cycle
- **Database:**
  - New table: `training_cycles` (start_date, end_date, phase, plan_id)
- **UI:**
  - "Training Cycle" widget in Today tab
  - Phase indicator (Week 2 of 4 - Hypertrophy)
  - Next phase preview
- **Tests Required:**
  - `src/__tests__/periodization.test.ts`
  - Cycle generation algorithm
  - Phase transitions
  - Recommendation adjustments per phase

---

## 🔒 Phase 5: Multi-Device Sync (Future)

### Priority 5: Privacy-First Sync Layer

#### 5.1 MCP (Model Context Protocol) Server
- **Feature:** Expose workout data to AI agents via MCP
- **Why:** Let Claude Desktop or other agents query workout history
- **Implementation:**
  - MCP server running on localhost:3001
  - Tools: `get_workout_history`, `log_workout`, `get_recommendations`
  - Read-only by default, write with confirmation
- **Tests Required:**
  - `src/__tests__/mcp-server.test.ts`
  - MCP protocol compliance
  - Tool execution
  - Security (localhost-only binding)

#### 5.2 Encrypted Cloud Sync (Optional)
- **Feature:** Sync data across devices with E2E encryption
- **Architecture:**
  - Client-side encryption (key never leaves device)
  - Sync server stores encrypted blobs
  - Conflict resolution (last-write-wins or manual merge)
- **Note:** This is a major feature, defer to Phase 5
- **Tests Required:**
  - Encryption/decryption
  - Sync protocol
  - Conflict resolution

---

## 🧩 Technical Improvements

### Priority 6: Code Quality & Developer Experience

#### 6.1 Frontend Testing Infrastructure
- **Gap:** No frontend tests currently exist
- **Setup:**
  - Install Vitest + @testing-library/dom
  - Create `public/__tests__/` directory
  - Add DOM environment to vitest config
- **Initial Tests:**
  - `public/__tests__/app.test.ts`
  - Tab switching
  - Form validation
  - Toast notifications
  - Calendar interaction

#### 6.2 Integration Testing
- **Gap:** Current tests are mostly unit/API tests
- **Needed:**
  - End-to-end workflow tests
  - Database transaction tests
  - LLM parsing integration tests (with mocked responses)
- **Location:** `src/__tests__/integration/`

#### 6.3 Test Coverage Monitoring
- **Current State:** Coverage configured but not enforced
- **Action Items:**
  - Set minimum coverage threshold (80%)
  - Add coverage check to CI/CD
  - Generate coverage badge for README

#### 6.4 Error Recovery & Retry Logic
- **Feature:** Better handling of transient failures
- **Areas:**
  - LLM API timeouts (retry with exponential backoff)
  - Database lock errors (retry transaction)
  - Network errors (queue for later)
- **Tests Required:**
  - `src/__tests__/error-recovery.test.ts`
  - Retry logic with mock failures
  - Exponential backoff timing
  - Max retry limits

---

## 📅 Implementation Roadmap

### Sprint 1: Test Coverage ✅ COMPLETED (2025-11-12)
1. ✅ Backfill tests for notes feature (13 test cases)
2. ✅ Backfill tests for duplicate prevention (15+ test cases)
3. ✅ Backfill tests for LLM tracking (18 test cases)
4. ✅ Parser service unit tests (70+ test cases)
5. ✅ Weekly summary tests (30+ test cases)

**Total:** 150+ new test cases added
**See:** `SPRINT1_SUMMARY.md` for complete details

### Sprint 2: Phase 2.5 Completion (2 weeks)
1. Personal Records tracking + tests
2. Workout Templates + tests
3. Data Import feature + tests

### Sprint 3: Voice Features (2 weeks)
1. Enhanced Web Speech API + tests
2. Voice command parsing + tests
3. Continuous Workout Mode + tests

### Sprint 4: Smart Insights (3 weeks)
1. Plateau detection + tests
2. Progressive overload recommendations + tests
3. Muscle balance analysis + tests

### Sprint 5: Periodization (2 weeks)
1. Periodization planner + tests
2. Phase-based recommendations + tests

### Sprint 6: Frontend Testing (1 week)
1. Setup frontend test infrastructure
2. Write critical path tests
3. Add coverage monitoring

---

## 🎯 Testing Standards

All new features must follow these standards:

### Test File Naming
- API tests: `src/__tests__/{feature}.test.ts`
- Integration tests: `src/__tests__/integration/{feature}.test.ts`
- Frontend tests: `public/__tests__/{component}.test.ts`

### Test Structure
```typescript
describe('Feature Name', () => {
  describe('Subfeature', () => {
    it('should do specific thing', async () => {
      // Arrange
      const input = createTestData();

      // Act
      const result = await functionUnderTest(input);

      // Assert
      expect(result).toEqual(expectedOutput);
    });
  });
});
```

### Coverage Requirements
- **Minimum:** 80% line coverage
- **Critical paths:** 100% coverage (auth, data integrity, payments if added)
- **Edge cases:** Must test error conditions

### Test Categories
1. **Unit Tests:** Pure functions, business logic
2. **Integration Tests:** API endpoints, database operations
3. **E2E Tests:** Complete user workflows
4. **Performance Tests:** Large datasets, concurrent users

### Mocking Strategy
- Mock LLM APIs (use fixtures for responses)
- Mock Web Speech API (browser-only)
- Real database for integration tests (use test DB)
- Mock timers for cron tests

---

## 🚀 Success Metrics

### Code Quality
- ✅ >80% test coverage
- ✅ All new features have tests before merge
- ✅ No regressions in existing features
- ✅ TypeScript strict mode compliance

### User Experience
- ✅ Voice input works hands-free
- ✅ PR detection within 5 seconds of logging
- ✅ Recommendations are actionable
- ✅ Zero data loss during sync

### Performance
- ✅ API response time <200ms (p95)
- ✅ LLM parsing <3 seconds
- ✅ UI interactions <100ms feedback
- ✅ Works with 10,000+ workout logs

---

## 📝 Notes

### Deferred Features
These features are interesting but deprioritized:
- Wearable device integration (Apple Watch, Garmin)
- Social features (sharing workouts, challenges)
- Nutrition tracking integration
- Exercise form video analysis
- Gym equipment QR code scanning

### Technical Debt
- Refactor frontend JS to TypeScript
- Split monolithic app.js into modules
- Add API versioning (/api/v1/)
- Improve error messages (more user-friendly)

---

## 🤝 Contributing Guidelines

When implementing features from this plan:

1. **Create a test file first** - Write failing tests that define the behavior
2. **Implement the feature** - Make the tests pass
3. **Update documentation** - Update CLAUDE.md and README.md
4. **Verify coverage** - Run `npm run test:coverage` and ensure >80%
5. **Manual testing** - Test in the UI before marking complete

---

**Last Updated:** 2025-11-12
**Next Review:** After Sprint 1 completion
