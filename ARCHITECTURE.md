# Thor Stack Architecture - Complete Request Flow

This document explains how a user request flows through the Thor Stack, from the conversational agent through the MCP server, to the API, and involving multiple LLM calls.

## System Components

```
┌─────────────────┐
│   User/Client   │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────┐
│                      THOR AGENT                             │
│  Port: 3002                                                 │
│  - Express server with /chat endpoint                       │
│  - Conversation session management                          │
│  - LLM #1: Tool calling (Ollama or OpenAI)                 │
│  - Spawns MCP server subprocess                            │
└────────┬────────────────────────────────────────────────────┘
         │ JSON-RPC over stdio
         ▼
┌─────────────────────────────────────────────────────────────┐
│                   THOR MCP SERVER                           │
│  Transport: stdio (subprocess)                              │
│  - 8 tool definitions (log_workout, get_today_exercises...) │
│  - JSON-RPC request handler                                 │
│  - Routes to Thor API via HTTP                             │
└────────┬────────────────────────────────────────────────────┘
         │ HTTP REST API calls
         ▼
┌─────────────────────────────────────────────────────────────┐
│                      THOR API                               │
│  Port: 3000                                                 │
│  - Express REST API                                         │
│  - SQLite database (workout.db)                            │
│  - LLM #2: Workout parsing (Ollama or OpenAI)             │
│  - Exercise matching & normalization                        │
└─────────────────────────────────────────────────────────────┘
```

---

## Complete Request Flow Examples

### Example 1: "What exercises should I do today?"

This example shows a **read-only query** that uses tool calling but NO parsing LLM.

#### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: User sends message                                          │
└─────────────────────────────────────────────────────────────────────┘

curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What exercises should I do today?"}'

Data sent:
{
  "message": "What exercises should I do today?",
  "sessionId": null  // Will be auto-generated
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2: Agent receives request                                      │
│ File: apps/thor-agent/src/server.ts:52-96                          │
└─────────────────────────────────────────────────────────────────────┘

1. Generate sessionId: "sess_1731474123456_abc123xyz"
2. Retrieve conversation history (empty for new session)
3. Call: agent.chat(message, history)

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 3: Agent prepares LLM #1 call (Tool Calling)                  │
│ File: apps/thor-agent/src/agent.ts:75-180                          │
└─────────────────────────────────────────────────────────────────────┘

System Prompt:
"You are Thor's AI workout coach. You help users log workouts,
track progress, and stay motivated..."

User Message:
"What exercises should I do today?"

Tools Available (8 tools from MCP):
[
  {
    "type": "function",
    "function": {
      "name": "get_today_exercises",
      "description": "Get the list of exercises scheduled for today...",
      "parameters": { "type": "object", "properties": {} }
    }
  },
  {
    "type": "function",
    "function": {
      "name": "log_workout",
      "description": "Log a workout using natural language...",
      "parameters": {
        "type": "object",
        "properties": {
          "text": { "type": "string", "description": "Natural language..." },
          "date": { "type": "string", "description": "Optional date..." }
        },
        "required": ["text"]
      }
    }
  },
  // ... 6 more tools
]

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 4: LLM #1 Call (Ollama or OpenAI)                             │
│ File: apps/thor-agent/src/agent.ts:142-178 (Ollama path)           │
└─────────────────────────────────────────────────────────────────────┘

Request to Ollama (http://localhost:11434/api/chat):
{
  "model": "llama3.1:8b",
  "messages": [
    {
      "role": "system",
      "content": "You are Thor's AI workout coach..."
    },
    {
      "role": "user",
      "content": "What exercises should I do today?"
    }
  ],
  "tools": [ /* 8 tool definitions */ ],
  "stream": false
}

Response from Ollama:
{
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "id": "call_abc123",
        "type": "function",
        "function": {
          "name": "get_today_exercises",
          "arguments": "{}"
        }
      }
    ]
  }
}

LLM Decision: "User wants today's exercises → Call get_today_exercises tool"

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 5: Agent executes tool via MCP Client                         │
│ File: apps/thor-agent/src/agent.ts:154-160                         │
└─────────────────────────────────────────────────────────────────────┘

Agent calls:
await this.mcpClient.callTool("get_today_exercises", {})

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 6: MCP Client sends JSON-RPC request                          │
│ File: apps/thor-agent/src/mcp-client.ts:95-108                     │
└─────────────────────────────────────────────────────────────────────┘

JSON-RPC request (sent to MCP server subprocess via stdio):
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_today_exercises",
    "arguments": {}
  },
  "id": 3
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 7: MCP Server receives request                                │
│ File: apps/thor-mcp/src/index.ts:93-111                             │
└─────────────────────────────────────────────────────────────────────┘

MCP Server executes tool handler:
1. Calculate today's day of week: const today = new Date().getDay() || 7
2. Call API client: await apiClient.getDayExercises(today)

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 8: MCP Server → Thor API HTTP call                            │
│ File: apps/thor-mcp/src/api-client.ts:45-68                         │
└─────────────────────────────────────────────────────────────────────┘

HTTP GET request:
GET http://localhost:3000/day/3  (assuming today is Wednesday)

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 9: Thor API queries database                                  │
│ File: apps/thor-api/src/routes/index.ts:73-85                      │
└─────────────────────────────────────────────────────────────────────┘

SQL Query:
SELECT id, name, aliases
FROM exercises
WHERE plan_id = 'thor' AND day_of_week = 3
ORDER BY sort_order

Database returns:
[
  {
    "id": "uuid-123-...",
    "name": "Dumbbell Shoulder Press",
    "aliases": ["overhead press", "shoulder press"]
  },
  {
    "id": "uuid-456-...",
    "name": "Dumbbell Incline Bench Press",
    "aliases": ["incline press"]
  },
  // ... more exercises
]

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 10: Thor API → MCP Server (HTTP response)                     │
└─────────────────────────────────────────────────────────────────────┘

HTTP Response:
{
  "planId": "thor",
  "dow": 3,
  "exercises": [
    {
      "id": "uuid-123-...",
      "name": "Dumbbell Shoulder Press",
      "aliases": ["overhead press", "shoulder press"]
    },
    {
      "id": "uuid-456-...",
      "name": "Dumbbell Incline Bench Press",
      "aliases": ["incline press"]
    },
    // ... 5 more exercises
  ]
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 11: MCP Server → Agent (JSON-RPC response)                    │
│ File: apps/thor-mcp/src/index.ts:106-107                            │
└─────────────────────────────────────────────────────────────────────┘

JSON-RPC response (via stdio):
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"planId\":\"thor\",\"dow\":3,\"exercises\":[...]}"
      }
    ]
  },
  "id": 3
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 12: Agent receives tool result                                │
│ File: apps/thor-agent/src/mcp-client.ts:109-120                    │
└─────────────────────────────────────────────────────────────────────┘

MCP Client parses response:
{
  "planId": "thor",
  "dow": 3,
  "exercises": [/* 7 exercises */]
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 13: Agent calls LLM #1 AGAIN with tool results                │
│ File: apps/thor-agent/src/agent.ts:162-175                         │
└─────────────────────────────────────────────────────────────────────┘

Request to Ollama (second call):
{
  "model": "llama3.1:8b",
  "messages": [
    {
      "role": "system",
      "content": "You are Thor's AI workout coach..."
    },
    {
      "role": "user",
      "content": "What exercises should I do today?"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "id": "call_abc123",
          "type": "function",
          "function": {
            "name": "get_today_exercises",
            "arguments": "{}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_abc123",
      "content": "{\"planId\":\"thor\",\"dow\":3,\"exercises\":[...]}"
    }
  ],
  "tools": [ /* 8 tool definitions */ ],
  "stream": false
}

Response from Ollama:
{
  "message": {
    "role": "assistant",
    "content": "Mortal! Today is Wednesday, and the mighty Thor has prepared 7 exercises for you:\n\n1. Dumbbell Shoulder Press\n2. Dumbbell Incline Bench Press\n3. Dumbbell Chest Fly\n4. Overhead Tricep Extension\n5. Dumbbell Lateral Raise\n6. Dumbbell Front Raise\n7. Dumbbell Shrug\n\nPrepare yourself for a powerful upper body session! 💪⚡"
  }
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 14: Agent returns response to client                          │
│ File: apps/thor-agent/src/server.ts:86-90                          │
└─────────────────────────────────────────────────────────────────────┘

HTTP Response:
{
  "reply": "Mortal! Today is Wednesday, and the mighty Thor has prepared 7 exercises for you:\n\n1. Dumbbell Shoulder Press\n2. Dumbbell Incline Bench Press\n...",
  "sessionId": "sess_1731474123456_abc123xyz",
  "toolCalls": [
    {
      "tool": "get_today_exercises",
      "arguments": {},
      "result": {
        "planId": "thor",
        "dow": 3,
        "exercises": [...]
      }
    }
  ]
}
```

**Summary for Example 1:**
- **Total LLM calls**: 2 (both LLM #1 in Agent)
  - Call 1: Decide which tool to use
  - Call 2: Generate conversational response with tool results
- **No parsing LLM used** (this was just a query)
- **Path**: User → Agent → MCP → API → Database → API → MCP → Agent → LLM → User

---

### Example 2: "Log my workout: shoulder press 3x12 @30, incline press 4x10 @45"

This example shows a **write operation** that uses BOTH LLMs:
- **LLM #1** (Agent): Tool calling to route request
- **LLM #2** (API): Natural language parsing to structured data

#### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│ STEP 1: User sends message                                          │
└─────────────────────────────────────────────────────────────────────┘

curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Log my workout: shoulder press 3x12 @30, incline press 4x10 @45"}'

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 2-4: Same as Example 1                                        │
│ Agent receives, prepares messages, calls LLM #1                     │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 5: LLM #1 decides to use log_workout tool                     │
└─────────────────────────────────────────────────────────────────────┘

Ollama Response:
{
  "message": {
    "role": "assistant",
    "content": "",
    "tool_calls": [
      {
        "id": "call_xyz789",
        "type": "function",
        "function": {
          "name": "log_workout",
          "arguments": "{\"text\":\"shoulder press 3x12 @30, incline press 4x10 @45\",\"date\":\"2025-11-12\"}"
        }
      }
    ]
  }
}

Note: LLM #1 extracted:
- Tool: log_workout
- Text: "shoulder press 3x12 @30, incline press 4x10 @45"
- Date: "2025-11-12" (today's date from tool description)

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 6: Agent → MCP Client                                         │
└─────────────────────────────────────────────────────────────────────┘

await this.mcpClient.callTool("log_workout", {
  text: "shoulder press 3x12 @30, incline press 4x10 @45",
  date: "2025-11-12"
})

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 7: MCP Client → MCP Server (JSON-RPC)                         │
└─────────────────────────────────────────────────────────────────────┘

{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "log_workout",
    "arguments": {
      "text": "shoulder press 3x12 @30, incline press 4x10 @45",
      "date": "2025-11-12"
    }
  },
  "id": 4
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 8: MCP Server → Thor API                                      │
│ File: apps/thor-mcp/src/api-client.ts:26-43                         │
└─────────────────────────────────────────────────────────────────────┘

HTTP POST request:
POST http://localhost:3000/ingest
Content-Type: application/json

{
  "text": "shoulder press 3x12 @30, incline press 4x10 @45",
  "date": "2025-11-12"
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 9: Thor API starts ingest process                             │
│ File: apps/thor-api/src/routes/index.ts:44-56                      │
└─────────────────────────────────────────────────────────────────────┘

Controller calls:
await handleIngest(text, date, "thor")

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 10: Get valid exercises for the day                           │
│ File: apps/thor-api/src/services/ingest.ts:12-15                   │
└─────────────────────────────────────────────────────────────────────┘

1. Parse date: "2025-11-12" → Wednesday (dow=3)
2. Query database for valid exercises:

SELECT id, name, aliases
FROM exercises
WHERE plan_id = 'thor' AND day_of_week = 3

Returns 7 exercises:
- Dumbbell Shoulder Press
- Dumbbell Incline Bench Press
- Dumbbell Chest Fly
- Overhead Tricep Extension
- ... etc

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 11: Call LLM #2 (PARSER) - Ollama or OpenAI                  │
│ File: apps/thor-api/src/services/ingest.ts:17                      │
│       apps/thor-api/src/services/parser.ts:47-187                  │
└─────────────────────────────────────────────────────────────────────┘

CRITICAL: This is a SECOND, DIFFERENT LLM call in the API layer!

Prepare parsing request:

1. Normalize input text:
   - Remove £ symbols
   - Replace "pounds" with "lbs"
   Result: "shoulder press 3x12 @30, incline press 4x10 @45"

2. Build system prompt:
```
You are a precise workout log parser.
Return a JSON object exactly like:
{"items":[{"exercise_free":string,"exercise_match":string,"sets":number,"reps_per_set":number|null,"variable_reps":number[]|null,"weight_lbs":number|null,"notes":string|null}]}
Rules:
- One item per exercise (no merging).
- Use the CLOSEST match from the valid list.
- NOTATION: In "NxM" or "N*M" format, N is SETS and M is REPS_PER_SET.
  Examples: "3x12" means sets=3, reps_per_set=12
            "4*10" means sets=4, reps_per_set=10
- Handle: "4*12 floor press @45" (sets=4, reps=12, weight=45)
          "4x9 with 35 lbs incline" (sets=4, reps=9, weight=35)
...
- Output ONLY valid JSON.
```

3. Build user prompt:
```
Valid exercises for today (choose closest for exercise_match):
Dumbbell Shoulder Press; Dumbbell Incline Bench Press; Dumbbell Chest Fly; Overhead Tricep Extension; Dumbbell Lateral Raise; Dumbbell Front Raise; Dumbbell Shrug

Text:
shoulder press 3x12 @30, incline press 4x10 @45
```

4. Call Ollama (assuming USE_OLLAMA=true):

POST http://localhost:11434/api/chat
{
  "model": "llama3.1:8b",
  "format": "json",
  "stream": false,
  "messages": [
    {
      "role": "system",
      "content": "You are a precise workout log parser..."
    },
    {
      "role": "user",
      "content": "Valid exercises for today...\n\nText:\nshoulder press 3x12 @30, incline press 4x10 @45"
    }
  ],
  "options": { "temperature": 0 }
}

5. Ollama LLM #2 Response:
{
  "message": {
    "content": "{\"items\":[{\"exercise_free\":\"shoulder press\",\"exercise_match\":\"Dumbbell Shoulder Press\",\"sets\":3,\"reps_per_set\":12,\"variable_reps\":null,\"weight_lbs\":30,\"notes\":null},{\"exercise_free\":\"incline press\",\"exercise_match\":\"Dumbbell Incline Bench Press\",\"sets\":4,\"reps_per_set\":10,\"variable_reps\":null,\"weight_lbs\":45,\"notes\":null}]}"
  }
}

Parsed result:
{
  "items": [
    {
      "exercise_free": "shoulder press",
      "exercise_match": "Dumbbell Shoulder Press",
      "sets": 3,
      "reps_per_set": 12,
      "variable_reps": null,
      "weight_lbs": 30,
      "notes": null
    },
    {
      "exercise_free": "incline press",
      "exercise_match": "Dumbbell Incline Bench Press",
      "sets": 4,
      "reps_per_set": 10,
      "variable_reps": null,
      "weight_lbs": 45,
      "notes": null
    }
  ]
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 12: Normalize and validate exercises                          │
│ File: apps/thor-api/src/services/ingest.ts:19-28                   │
└─────────────────────────────────────────────────────────────────────┘

For each parsed item:
1. normalizeExercise("Dumbbell Shoulder Press", validExercises)
   → Exact match found → Returns exercise with ID

2. normalizeExercise("Dumbbell Incline Bench Press", validExercises)
   → Exact match found → Returns exercise with ID

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 13: Save to database (transaction)                            │
│ File: apps/thor-api/src/services/ingest.ts:30-67                   │
└─────────────────────────────────────────────────────────────────────┘

SQL Transaction:
BEGIN TRANSACTION;

-- Create workout session
INSERT INTO workout_sessions (id, plan_id, session_date, day_of_week)
VALUES ('uuid-session-123', 'thor', '2025-11-12', 3);

-- Insert first exercise log
INSERT INTO exercise_logs
  (id, session_id, exercise_id, sets, reps, weight_lbs, notes)
VALUES
  ('uuid-log-001', 'uuid-session-123', 'uuid-exercise-shoulder', 3, 12, 30, NULL);

-- Insert second exercise log
INSERT INTO exercise_logs
  (id, session_id, exercise_id, sets, reps, weight_lbs, notes)
VALUES
  ('uuid-log-002', 'uuid-session-123', 'uuid-exercise-incline', 4, 10, 45, NULL);

COMMIT;

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 14: Thor API → MCP Server (HTTP response)                     │
└─────────────────────────────────────────────────────────────────────┘

HTTP Response:
{
  "sessionId": "uuid-session-123",
  "date": "2025-11-12",
  "planId": "thor",
  "dow": 3,
  "results": [
    {
      "status": "logged",
      "input": "shoulder press",
      "matched": "Dumbbell Shoulder Press",
      "sets": 3,
      "reps": 12,
      "weight_lbs": 30,
      "notes": null
    },
    {
      "status": "logged",
      "input": "incline press",
      "matched": "Dumbbell Incline Bench Press",
      "sets": 4,
      "reps": 10,
      "weight_lbs": 45,
      "notes": null
    }
  ],
  "llm_provider": "ollama",
  "llm_model": "llama3.1:8b"
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 15: MCP Server → Agent (JSON-RPC response)                    │
└─────────────────────────────────────────────────────────────────────┘

{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      {
        "type": "text",
        "text": "{\"sessionId\":\"uuid-session-123\",\"date\":\"2025-11-12\",\"results\":[...]}"
      }
    ]
  },
  "id": 4
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 16: Agent calls LLM #1 AGAIN with tool results                │
└─────────────────────────────────────────────────────────────────────┘

Request to Ollama:
{
  "model": "llama3.1:8b",
  "messages": [
    {
      "role": "system",
      "content": "You are Thor's AI workout coach..."
    },
    {
      "role": "user",
      "content": "Log my workout: shoulder press 3x12 @30, incline press 4x10 @45"
    },
    {
      "role": "assistant",
      "content": "",
      "tool_calls": [
        {
          "id": "call_xyz789",
          "type": "function",
          "function": {
            "name": "log_workout",
            "arguments": "{\"text\":\"shoulder press 3x12 @30, incline press 4x10 @45\",\"date\":\"2025-11-12\"}"
          }
        }
      ]
    },
    {
      "role": "tool",
      "tool_call_id": "call_xyz789",
      "content": "{\"sessionId\":\"uuid-session-123\",\"date\":\"2025-11-12\",\"results\":[...]}"
    }
  ]
}

Response from Ollama:
{
  "message": {
    "role": "assistant",
    "content": "Excellent work, mortal! I have logged your workout:\n\n✅ Dumbbell Shoulder Press: 3 sets × 12 reps @ 30 lbs\n✅ Dumbbell Incline Bench Press: 4 sets × 10 reps @ 45 lbs\n\nYour strength grows! Keep pushing forward! ⚡💪"
  }
}

┌─────────────────────────────────────────────────────────────────────┐
│ STEP 17: Agent → User (final response)                             │
└─────────────────────────────────────────────────────────────────────┘

HTTP Response:
{
  "reply": "Excellent work, mortal! I have logged your workout:\n\n✅ Dumbbell Shoulder Press: 3 sets × 12 reps @ 30 lbs\n✅ Dumbbell Incline Bench Press: 4 sets × 10 reps @ 45 lbs\n\nYour strength grows! Keep pushing forward! ⚡💪",
  "sessionId": "sess_1731474123456_abc123xyz",
  "toolCalls": [
    {
      "tool": "log_workout",
      "arguments": {
        "text": "shoulder press 3x12 @30, incline press 4x10 @45",
        "date": "2025-11-12"
      },
      "result": {
        "sessionId": "uuid-session-123",
        "results": [...]
      }
    }
  ]
}
```

**Summary for Example 2:**
- **Total LLM calls**: 3
  - **LLM #1 Call 1** (Agent/Ollama): Analyze user message, decide to use log_workout tool
  - **LLM #2 Call 1** (API/Ollama): Parse natural language into structured workout data
  - **LLM #1 Call 2** (Agent/Ollama): Generate friendly response with tool results
- **Path**: User → Agent → LLM #1 → MCP → API → LLM #2 → Database → API → MCP → Agent → LLM #1 → User

---

## Visual Flow Diagram

```
┌──────────────┐
│     USER     │
└──────┬───────┘
       │ "Log my workout: shoulder press 3x12 @30"
       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                        THOR AGENT (Port 3002)                        │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Express Server (/chat endpoint)                                │  │
│  │ - Session management                                           │  │
│  │ - Conversation history                                         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│                                                                       │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ LLM #1: Tool Calling (Ollama llama3.1:8b / OpenAI gpt-4)      │  │
│  │                                                                 │  │
│  │ Input: User message + conversation history + 8 tool definitions│  │
│  │                                                                 │  │
│  │ CALL 1: Decide which tool(s) to call                          │  │
│  │ ↓                                                               │  │
│  │ Decision: "log_workout" with args                              │  │
│  │   {text: "shoulder press 3x12 @30", date: "2025-11-12"}       │  │
│  └────────────────────────────────────────────────────────────────┘  │
│           │                                          ▲                │
│           │ Execute tool                             │                │
│           ▼                                          │ Tool results   │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ MCP Client (stdio subprocess communication)                    │  │
│  │ - Spawns MCP server                                            │  │
│  │ - JSON-RPC request/response handler                            │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────┬────────────────────────────────────────────────┘
                       │ JSON-RPC over stdio
                       │ {"method":"tools/call","params":{...}}
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                   THOR MCP SERVER (stdio subprocess)                 │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ MCP Server (Model Context Protocol)                            │  │
│  │ - Registers 8 tools:                                           │  │
│  │   1. log_workout                                               │  │
│  │   2. get_today_exercises                                       │  │
│  │   3. get_exercises_for_day                                     │  │
│  │   4. get_progress_summary                                      │  │
│  │   5. get_weekly_summaries                                      │  │
│  │   6. get_workouts_by_date                                      │  │
│  │   7. get_all_exercises                                         │  │
│  │   8. get_exercise_history                                      │  │
│  │                                                                 │  │
│  │ Receives: log_workout("shoulder press 3x12 @30", "2025-11-12")│  │
│  └────────────────────────────────────────────────────────────────┘  │
│           │                                          ▲                │
│           │ HTTP POST                                │ HTTP Response  │
│           ▼                                          │                │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ API Client                                                      │  │
│  │ POST http://localhost:3000/ingest                              │  │
│  │ Body: {text: "...", date: "..."}                               │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────┬────────────────────────────────────────────────┘
                       │ HTTP REST API call
                       ▼
┌──────────────────────────────────────────────────────────────────────┐
│                      THOR API (Port 3000)                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Express REST API                                                │  │
│  │ POST /ingest                                                    │  │
│  │ - Receives workout text                                         │  │
│  │ - Determines day of week from date                              │  │
│  └────────────────────────────────────────────────────────────────┘  │
│           │                                                            │
│           ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Step 1: Query valid exercises for the day                      │  │
│  │                                                                 │  │
│  │ SELECT id, name, aliases FROM exercises                        │  │
│  │ WHERE plan_id = 'thor' AND day_of_week = 3                     │  │
│  │                                                                 │  │
│  │ Returns: ["Dumbbell Shoulder Press", ...]                      │  │
│  └────────────────────────────────────────────────────────────────┘  │
│           │                                                            │
│           ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Step 2: Call Parser (LLM #2)                                   │  │
│  │                                                                 │  │
│  │ LLM #2: Natural Language Parsing (Ollama / OpenAI)            │  │
│  │                                                                 │  │
│  │ System Prompt:                                                  │  │
│  │   "You are a precise workout log parser..."                    │  │
│  │   "In NxM format, N is SETS and M is REPS_PER_SET..."         │  │
│  │                                                                 │  │
│  │ User Prompt:                                                    │  │
│  │   "Valid exercises: Dumbbell Shoulder Press; ..."             │  │
│  │   "Text: shoulder press 3x12 @30"                              │  │
│  │                                                                 │  │
│  │ POST http://localhost:11434/api/chat (Ollama)                  │  │
│  │   OR                                                            │  │
│  │ OpenAI API with JSON schema                                    │  │
│  │                                                                 │  │
│  │ LLM Response:                                                   │  │
│  │ {                                                               │  │
│  │   "items": [                                                    │  │
│  │     {                                                           │  │
│  │       "exercise_free": "shoulder press",                       │  │
│  │       "exercise_match": "Dumbbell Shoulder Press",             │  │
│  │       "sets": 3,                                                │  │
│  │       "reps_per_set": 12,                                       │  │
│  │       "variable_reps": null,                                    │  │
│  │       "weight_lbs": 30,                                         │  │
│  │       "notes": null                                             │  │
│  │     }                                                           │  │
│  │   ]                                                             │  │
│  │ }                                                               │  │
│  └────────────────────────────────────────────────────────────────┘  │
│           │                                                            │
│           ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Step 3: Normalize exercise names                               │  │
│  │                                                                 │  │
│  │ normalizeExercise("Dumbbell Shoulder Press", validExercises)   │  │
│  │ → Match found → Returns {id: "uuid-123", name: "..."}         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│           │                                                            │
│           ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ Step 4: Save to Database (Transaction)                         │  │
│  │                                                                 │  │
│  │ BEGIN TRANSACTION;                                              │  │
│  │                                                                 │  │
│  │ INSERT INTO workout_sessions                                    │  │
│  │   (id, plan_id, session_date, day_of_week)                     │  │
│  │ VALUES ('uuid-session', 'thor', '2025-11-12', 3);              │  │
│  │                                                                 │  │
│  │ INSERT INTO exercise_logs                                       │  │
│  │   (session_id, exercise_id, sets, reps, weight_lbs)            │  │
│  │ VALUES ('uuid-session', 'uuid-123', 3, 12, 30);                │  │
│  │                                                                 │  │
│  │ COMMIT;                                                         │  │
│  └────────────────────────────────────────────────────────────────┘  │
│           │                                                            │
│           ▼                                                            │
│  ┌────────────────────────────────────────────────────────────────┐  │
│  │ SQLite Database (workout.db)                                   │  │
│  │ - plans                                                         │  │
│  │ - exercises                                                     │  │
│  │ - workout_sessions                                              │  │
│  │ - exercise_logs                                                 │  │
│  │ - weekly_summaries                                              │  │
│  └────────────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────────┘
                       │
                       │ Response flows back
                       │
┌──────────────────────┴────────────────────────────────────────────────┐
│                        THOR AGENT (Port 3002)                         │
│                                                                        │
│  ┌────────────────────────────────────────────────────────────────┐   │
│  │ LLM #1: Tool Calling (Second Call)                             │   │
│  │                                                                 │   │
│  │ Input: Conversation + tool results                             │   │
│  │                                                                 │   │
│  │ CALL 2: Generate friendly response                             │   │
│  │ ↓                                                               │   │
│  │ Output: "Excellent work, mortal! I have logged your workout:   │   │
│  │          ✅ Dumbbell Shoulder Press: 3 × 12 @ 30 lbs..."       │   │
│  └────────────────────────────────────────────────────────────────┘   │
└────────────────────────┬───────────────────────────────────────────────┘
                         │
                         ▼
                  ┌──────────────┐
                  │     USER     │
                  └──────────────┘
```

---

## LLM Usage Summary

### LLM #1: Agent Tool Calling (apps/thor-agent/)
- **Purpose**: Route user requests to appropriate tools
- **Location**: `apps/thor-agent/src/agent.ts`
- **Model**: Ollama (llama3.1:8b) OR OpenAI (gpt-4-turbo-preview)
- **Calls per request**: 2
  - Call 1: Analyze user message, decide tool(s) to use
  - Call 2: Generate conversational response with tool results
- **Input**: User message + conversation history + 8 tool definitions
- **Output**: Tool calls (function name + arguments) OR final text response

### LLM #2: Workout Parser (apps/thor-api/)
- **Purpose**: Parse natural language into structured workout data
- **Location**: `apps/thor-api/src/services/parser.ts`
- **Model**: Ollama (llama3.1:8b) OR OpenAI (gpt-4o-mini)
- **Calls per request**: 1 (only for log_workout requests)
- **Input**:
  - Workout text (e.g., "shoulder press 3x12 @30")
  - Valid exercises for the day
  - System prompt with parsing rules
- **Output**: Structured JSON with exercises, sets, reps, weights

### Total LLM Calls by Request Type

| Request Type | LLM #1 Calls | LLM #2 Calls | Total | Example |
|--------------|--------------|--------------|-------|---------|
| Read-only query | 2 | 0 | 2 | "What exercises should I do today?" |
| Log workout | 2 | 1 | 3 | "Log my workout: shoulder press 3x12" |
| Progress query | 2 | 0 | 2 | "Show my progress for last 30 days" |

---

## Data Flow Summary

### Read Request Flow
```
User Input
  → Agent (LLM #1 Call 1: Tool selection)
  → MCP Client (JSON-RPC)
  → MCP Server (Tool handler)
  → Thor API (HTTP GET)
  → Database (SQL SELECT)
  → Back through layers
  → Agent (LLM #1 Call 2: Generate response)
  → User Output
```

### Write Request Flow
```
User Input
  → Agent (LLM #1 Call 1: Tool selection)
  → MCP Client (JSON-RPC)
  → MCP Server (Tool handler)
  → Thor API (HTTP POST)
  → Database (SELECT valid exercises)
  → Parser (LLM #2: Parse text to structured data)
  → Database (INSERT workout session)
  → Back through layers
  → Agent (LLM #1 Call 2: Generate response)
  → User Output
```

---

## Key Insights

1. **Two Separate LLMs**: The agent LLM (#1) and parser LLM (#2) are completely independent. They can even use different providers (e.g., Ollama for agent, OpenAI for parser).

2. **MCP as Middleware**: The MCP server is a pure relay - it has no LLM logic. It just translates between JSON-RPC and HTTP REST.

3. **Parser Only for Writes**: LLM #2 (parser) only runs for `log_workout` requests. Read-only queries skip the parser entirely.

4. **Agent Makes 2 LLM Calls**: Every request involves the agent calling its LLM twice:
   - Once to decide what to do
   - Once to format the response

5. **Text Breakdown**:
   - User message → Agent extracts workout text → Parser receives raw text
   - Parser LLM breaks down notation (3x12 → sets=3, reps=12)
   - Parser LLM matches exercises to valid list
   - Normalized data saved to database

6. **Session Continuity**: Conversation history stays in the agent layer. MCP and API are stateless.

---

## File Reference

- **Agent Entry**: `apps/thor-agent/src/server.ts`
- **Agent LLM Logic**: `apps/thor-agent/src/agent.ts`
- **MCP Client**: `apps/thor-agent/src/mcp-client.ts`
- **MCP Server**: `apps/thor-mcp/src/index.ts`
- **MCP API Client**: `apps/thor-mcp/src/api-client.ts`
- **API Routes**: `apps/thor-api/src/routes/index.ts`
- **Ingest Service**: `apps/thor-api/src/services/ingest.ts`
- **Parser Service**: `apps/thor-api/src/services/parser.ts`
- **Plans Service**: `apps/thor-api/src/services/plans.ts`

---

**Document Version**: 1.0
**Last Updated**: 2025-11-12
**Author**: Claude Code (documenting Thor Stack architecture)
