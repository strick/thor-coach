# Update Thor Stack to support changing the LLM provider/model at runtime without restarting any service.

Requirements:
1. Add a runtime LLM config service in thor-api:
   - In-memory object storing provider+model for:
       agent_conversation
       workout_parsing
       weekly_summary
       nutrition_parsing (reserved for future)
   - Provide GET /config/llm to return the current config.
   - Provide POST /config/llm to partially update the config.

2. thor-api (parser + weekly summary):
   - Stop reading provider/model from env.
   - Instead, fetch the current runtime config before each LLM call.
   - workout_parsing → parser.ts
   - weekly_summary → weekly-summary.ts

3. Agents (thor-agent, health-agent, meta-runner):
   - Modify BaseAgent so it accepts a function that returns the current LLM provider/model.
   - Each agent should call thor-api’s GET /config/llm before generating responses.
   - This allows switching from local Ollama to OpenAI (or vice versa) instantly.

Constraints:
- Do not break existing agents or MCP tools.
- Keep monorepo structure and ESM imports with .js extensions.
- Do not modify Docker or build configs.

Output:
- All updated files.
- Create any new helper modules needed.
- Include test adjustments if required.

# Enhance Thor Stack so that different LLM models can be used for different task types.

Add support for 4 usage kinds:
   agent_conversation
   workout_parsing
   weekly_summary
   nutrition_parsing (placeholder for feature 3)

Requirements:
1. Extend the runtime LLM config in thor-api to support fields for each usage kind.

2. thor-api:
   - For workout parsing, always use the workout_parsing model.
   - For weekly summaries, always use the weekly_summary model.

3. Agents:
   - BaseAgent must know it is using the agent_conversation model.
   - Before each LLM call (tool or answer), dynamically fetch provider+model from /config/llm.

4. If a usage kind is missing in the config, fallback to an existing provider/model.

Goal:
- Allow cheap local model for parsing.
- Allow heavy model for summaries.
- Allow fast model for conversation.
- Fully runtime switchable.

Avoid:
- No duplication of provider/model logic.
- No breaking of existing tool calling.

Output:
- All updated files.

# Add full nutrition logging to Thor Stack.

Goal:
- Let the user log meals via natural language.
- Parse into calories, protein, sodium, saturated_fat, fiber.
- Track daily totals against DASH-friendly and muscle-gain goals.

Implement the following:

1. Database (thor-api):
   - Add table: nutrition_goals (single row)
       daily_protein_target_g
       max_daily_sodium_mg
       max_daily_saturated_fat_g
       min_daily_fiber_g
   - Add table: food_logs
       id, log_date, description, calories, protein_g,
       sodium_mg, saturated_fat_g, fiber_g, created_at

2. API routes:
   POST /api/nutrition/log
       body: { text: string, date?: "YYYY-MM-DD" }
       → Calls an LLM to parse the text (use nutrition_parsing model)
       → Inserts into food_logs
       → Returns inserted row + today's totals

   GET /api/nutrition/today?date=
       → Returns totals vs goals

   GET /api/nutrition/summary?from=&to=
       → Returns aggregated days

3. Nutrition service:
   - nutrition.ts:
       logFoodFromText()
       getDailyNutritionSummary()
       getNutritionSummaryRange()

4. MCP tools (mcp/thor-mcp):
   - log_food
   - get_nutrition_today
   - get_nutrition_summary

5. Health agent:
   - Add support for:
       “Log what I ate…”
       “How much protein today?”
       “Am I over sodium today?”
   - Route to appropriate MCP tool.

Constraints:
- Use nutrition_parsing usage kind from Feature 2.
- ESM only, .js extensions.
- Don't break existing workout or health features.

Output:
- New files + updated files.
