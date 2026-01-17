# Implementation Summary - Runtime LLM Configuration

## Status: Features 1 & 2 (Partially Complete)

### ✅ Completed Work

#### 1. Runtime LLM Config Service (thor-api)
**File**: `apps/thor-api/src/services/llm-config.ts`

Created a complete runtime LLM configuration service with:
- Support for 4 usage kinds: `agent_conversation`, `workout_parsing`, `weekly_summary`, `nutrition_parsing`
- In-memory configuration storage with environment variable fallback
- Functions:
  - `getRuntimeLLMConfig()` - Get all configs
  - `getLLMConfigForUsage(usageKind)` - Get config for specific usage
  - `updateRuntimeLLMConfig(updates)` - Partial config updates
  - `validateLLMConfig(config)` - Config validation
  - `resetLLMConfig()` - Reset to env defaults

#### 2. API Endpoints (thor-api)
**Files**: `apps/thor-api/src/controllers/systemController.ts`, `apps/thor-api/src/routes/system.ts`

Added two new endpoints:
- `GET /api/config/llm` - Returns current runtime LLM configuration
- `POST /api/config/llm` - Updates runtime configuration (supports partial updates)

Both endpoints include validation and error handling.

#### 3. Updated Parser Service (thor-api)
**File**: `apps/thor-api/src/services/parser.ts`

Updated workout text parsing to use runtime config:
- Fetches `workout_parsing` usage kind config
- Dynamically selects Ollama or OpenAI based on runtime config
- No longer reads from environment variables
- Passes model and URL/API key from runtime config to LLM functions

#### 4. Updated Weekly Summary Service (thor-api)
**File**: `apps/thor-api/src/services/weekly-summary.ts`

Updated weekly summary generation to use runtime config:
- Fetches `weekly_summary` usage kind config
- Dynamically selects LLM provider based on runtime config
- Updated `generateWithOllama()` and `generateWithOpenAI()` to accept model/url/apiKey as parameters

#### 5. Build Verification
- Ran `npm run build` in `apps/thor-api`
- ✅ No TypeScript errors
- All changes compile successfully

### 🔄 Remaining Work

#### Feature 1: Update Agents to Use Runtime Config

**Affected Files**:
- `packages/agent-core/src/base-agent.ts` (BaseAgent class)
- All agents that extend BaseAgent:
  - `agents/thor/src/agent.ts`
  - `agents/health/src/agent.ts`
  - `agents/meta-runner/src/agent.ts`

**Required Changes**:

1. **BaseAgent Constructor**:
   - Add `apiUrl` parameter to config (default: `http://localhost:3000`)
   - Remove hardcoded LLM config from constructor

2. **Add Method to Fetch Runtime Config**:
   ```typescript
   protected async fetchLLMConfig(): Promise<LLMProviderConfig> {
     const response = await fetch(`${this.apiUrl}/api/config/llm`);
     const config = await response.json();
     return config.agent_conversation; // Use agent_conversation usage kind
   }
   ```

3. **Update `chat()` Method**:
   - Fetch config at the start of each chat call:
     ```typescript
     async chat(userMessage: string, conversationHistory: ChatMessage[] = []): Promise<ChatResponse> {
       if (!this.mcpReady) {
         throw new Error('MCP server not ready. Call start() first.');
       }

       // Fetch current runtime config
       const llmConfig = await this.fetchLLMConfig();

       // ... rest of chat logic
     }
     ```

4. **Update `chatWithOpenAI()` Method**:
   - Accept `model` and `apiKey` as parameters
   - Replace hardcoded `'gpt-4-turbo-preview'` with `model` parameter
   - Currently hardcoded at lines 122 and 155

5. **Update `chatWithOllama()` Method**:
   - Accept `model` and `url` as parameters
   - Replace `this.ollamaModel` and `this.ollamaUrl` with parameters

6. **Rebuild Agents**:
   - Run `npm run build` in each agent directory
   - Verify no TypeScript errors

### 📋 Feature 3: Nutrition Logging (Not Started)

Feature 3 is a substantial new feature requiring:

#### Database Changes
**File**: `apps/thor-api/src/seed.ts`

Add two new tables:
```sql
CREATE TABLE nutrition_goals (
  id TEXT PRIMARY KEY,
  daily_protein_target_g INTEGER,
  max_daily_sodium_mg INTEGER,
  max_daily_saturated_fat_g INTEGER,
  min_daily_fiber_g INTEGER,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE food_logs (
  id TEXT PRIMARY KEY,
  log_date TEXT NOT NULL,
  description TEXT NOT NULL,
  calories INTEGER,
  protein_g REAL,
  sodium_mg REAL,
  saturated_fat_g REAL,
  fiber_g REAL,
  created_at TEXT DEFAULT CURRENT_TIMESTAMP
);
```

#### Nutrition Service
**File**: `apps/thor-api/src/services/nutrition.ts` (new file)

Create service with functions:
- `logFoodFromText(text, date?)` - Parse natural language food log using `nutrition_parsing` LLM config
- `getDailyNutritionSummary(date)` - Get totals vs goals for a date
- `getNutritionSummaryRange(from, to)` - Get aggregated nutrition data

LLM parsing prompt should extract:
- Food description
- Calories
- Protein (g)
- Sodium (mg)
- Saturated fat (g)
- Fiber (g)

#### API Endpoints
**File**: `apps/thor-api/src/routes/nutrition.ts` (new file) or add to existing

Add routes:
- `POST /api/nutrition/log` - Log food from natural language
- `GET /api/nutrition/today?date=YYYY-MM-DD` - Get daily totals vs goals
- `GET /api/nutrition/summary?from=YYYY-MM-DD&to=YYYY-MM-DD` - Get range summary

#### MCP Tools
**File**: `mcp/thor-mcp/src/index.ts`

Add three new MCP tools:
- `log_food` - Log food from natural language
- `get_nutrition_today` - Get today's nutrition totals
- `get_nutrition_summary` - Get nutrition summary for date range

#### Health Agent Updates
**File**: `agents/health/src/agent.ts`

Update system prompt to handle:
- "Log what I ate: chicken breast, rice, broccoli"
- "How much protein have I had today?"
- "Am I over sodium today?"

Route to appropriate nutrition MCP tools.

## Testing Strategy

### Feature 1 & 2 Testing

1. **Test Runtime Config Endpoints**:
   ```bash
   # Get current config
   curl http://localhost:3000/api/config/llm

   # Update workout_parsing to use different model
   curl -X POST http://localhost:3000/api/config/llm \
     -H "Content-Type: application/json" \
     -d '{
       "workout_parsing": {
         "provider": "ollama",
         "model": "llama3.2:3b",
         "url": "http://localhost:11434"
       }
     }'
   ```

2. **Test Workout Parsing with New Config**:
   ```bash
   curl -X POST http://localhost:3000/api/ingest \
     -H "Content-Type: application/json" \
     -d '{"text":"floor press 4x12 @45, skullcrusher 3x10 @25"}'
   ```

3. **Test Weekly Summary with New Config**:
   ```bash
   curl -X POST http://localhost:3000/api/weekly-summaries/generate \
     -H "Content-Type: application/json" \
     -d '{}'
   ```

4. **Test Agent with Runtime Config** (after BaseAgent updates):
   ```bash
   # First, update agent_conversation config
   curl -X POST http://localhost:3000/api/config/llm \
     -H "Content-Type: application/json" \
     -d '{
       "agent_conversation": {
         "provider": "openai",
         "model": "gpt-4",
         "apiKey": "sk-..."
       }
     }'

   # Then test agent
   curl -X POST http://localhost:3002/chat \
     -H "Content-Type: application/json" \
     -d '{"text":"What exercises should I do today?"}'
   ```

### Feature 3 Testing

1. **Test Food Logging**:
   ```bash
   curl -X POST http://localhost:3000/api/nutrition/log \
     -H "Content-Type: application/json" \
     -d '{"text":"chicken breast 6oz, brown rice 1 cup, broccoli 2 cups"}'
   ```

2. **Test Daily Summary**:
   ```bash
   curl http://localhost:3000/api/nutrition/today
   ```

3. **Test Health Agent Nutrition Queries**:
   ```bash
   curl -X POST http://localhost:3001/chat \
     -H "Content-Type: application/json" \
     -d '{"text":"How much protein have I had today?"}'
   ```

## Benefits of Completed Work

### Runtime Flexibility
- Switch between Ollama and OpenAI without restarting services
- Use different models for different tasks (e.g., cheap model for parsing, expensive model for summaries)
- Test different models in production without code changes

### Cost Optimization
- Use local Ollama for parsing (free)
- Use OpenAI for complex summaries (paid but better quality)
- Easy A/B testing of models

### Development Workflow
- Faster iteration on model selection
- Easy rollback if a model doesn't work well
- Configuration as code (via API) rather than environment variables

## Next Steps

1. **Complete Feature 1**:
   - Update BaseAgent to fetch config from thor-api
   - Test all three agents with runtime config
   - Document agent configuration process

2. **Implement Feature 3**:
   - Add nutrition database tables
   - Create nutrition service with LLM parsing
   - Add API endpoints
   - Create MCP tools
   - Update health-agent

3. **Documentation**:
   - Update CLAUDE.md with new LLM configuration instructions
   - Update PROJECT_DESCRIPTION.md with runtime config details
   - Add examples to README.md

## Known Limitations

1. **BaseAgent Not Updated Yet**:
   - Agents still read LLM config from environment variables at startup
   - Cannot switch agent LLM config at runtime yet
   - Requires server restart to change agent models

2. **No Caching**:
   - Runtime config is fetched on every LLM call
   - Could add caching with TTL for performance
   - Not critical for current usage patterns

3. **No Config Persistence**:
   - Runtime config is in-memory only
   - Lost on server restart (falls back to env)
   - Consider adding database persistence for production

4. **No Config UI**:
   - Configuration is API-only
   - Could add web UI for easier management
   - Would integrate nicely with existing thor-web settings modal
