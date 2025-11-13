# Thor Agent - Conversational Workout Assistant

A conversational AI agent for the Thor workout tracking system. The agent provides a natural language interface for logging workouts, viewing plans, and tracking progress.

## Architecture

The Thor Agent uses a **Model Context Protocol (MCP) backend** architecture:

```
User Request
    ↓
Thor Agent (LLM with tool calling)
    ↓
MCP Server (spawned subprocess)
    ↓
Thor API (workout data + AI parsing)
    ↓
SQLite Database
```

### Key Features

- **MCP-Based**: Agent spawns and communicates with the Thor MCP Server via stdio/JSON-RPC
- **LLM Tool Calling**: Uses Ollama or OpenAI with function calling to route requests to appropriate tools
- **Conversational Memory**: Maintains conversation history per session
- **8 Available Tools**: All tools from the Thor MCP Server (log_workout, get_today_exercises, etc.)
- **Motivational Coaching**: Provides encouraging responses with workout advice

---

## Setup

### 1. Install Dependencies

From monorepo root:

```bash
npm install
```

### 2. Configure Environment

Create `.env` in `apps/thor-agent/`:

```env
PORT=3002

# Thor API URL
THOR_API_URL=http://localhost:3000

# LLM Configuration (choose one)
USE_OLLAMA=true
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.1:8b

# OR use OpenAI
# OPENAI_API_KEY=sk-xxxxx
```

### 3. Build and Run

**Development mode (hot reload):**

```bash
npm run dev:agent
```

**Production mode:**

```bash
npm run build:agent
npm run start --workspace=thor-agent
```

---

## Prerequisites

1. **Thor API** must be running at `http://localhost:3000`
2. **MCP Server** must be built: `npm run build:mcp`
3. **LLM** must be configured:
   - **Ollama**: Install and run Ollama with `llama3.1:8b` model
   - **OpenAI**: Set `OPENAI_API_KEY` in `.env`

---

## API Endpoints

### POST /chat

Send a message to the agent.

**Request:**

```json
{
  "message": "What exercises should I do today?",
  "sessionId": "sess_123_abc" // optional
}
```

**Response:**

```json
{
  "reply": "Mortal! Today's plan is ready for you!\n\nYou should perform...",
  "sessionId": "sess_123_abc",
  "toolCalls": [
    {
      "tool": "get_today_exercises",
      "arguments": {},
      "result": { ... }
    }
  ]
}
```

### GET /health

Health check endpoint.

**Response:**

```json
{
  "status": "ok",
  "service": "thor-agent",
  "mcpReady": true,
  "timestamp": "2025-11-13T04:22:26.376Z"
}
```

### GET /sessions/:id

Get conversation history for a session.

### DELETE /sessions/:id

Clear conversation history for a session.

### POST /sessions/clear-all

Clear all conversation histories (development helper).

---

## Usage Examples

### Get Today's Exercises

```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What exercises should I do today?"}'
```

### Log a Workout

```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Log my workout: floor press 4x12 @45, skullcrusher 3x10 @20"}'
```

### Get Progress Summary

```bash
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "Show me my progress for the last 30 days"}'
```

### Conversational Follow-up

```bash
# First message
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "What did I lift last Monday?"}' \
  | jq -r '.sessionId' > session_id.txt

# Follow-up message (uses same session)
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d "{\"message\": \"How does that compare to this week?\", \"sessionId\": \"$(cat session_id.txt)\"}"
```

---

## How It Works

### 1. Agent Initialization

When the agent starts:

1. Spawns the MCP server process (`mcp/thor-mcp/dist/index.js`)
2. Initializes JSON-RPC communication via stdio
3. Fetches available tools from MCP server
4. Converts tool schemas to LLM function calling format

### 2. Request Flow

When a user sends a message:

1. **User Message** → Agent receives message and conversation history
2. **LLM Call #1** → LLM analyzes message and decides if tool calls are needed
3. **Tool Execution** → If tools requested, agent sends JSON-RPC requests to MCP server
4. **MCP Server** → Executes tools (via Thor API) and returns results
5. **LLM Call #2** → LLM receives tool results and generates final response
6. **Response** → Agent returns conversational response to user

### 3. MCP Communication

The agent communicates with the MCP server using JSON-RPC over stdio:

```typescript
// Request (agent → MCP server)
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "get_today_exercises",
    "arguments": {}
  },
  "id": 1
}

// Response (MCP server → agent)
{
  "jsonrpc": "2.0",
  "result": {
    "content": [
      { "type": "text", "text": "{\"planId\":\"thor\",\"dow\":3,...}" }
    ]
  },
  "id": 1
}
```

---

## Available Tools (via MCP Server)

All 8 tools from the Thor MCP Server are available:

1. **log_workout** - Log workouts using natural language
2. **get_today_exercises** - Get today's planned exercises
3. **get_exercises_for_day** - Get exercises for specific day (1-7)
4. **get_progress_summary** - Get workout progress for date range
5. **get_weekly_summaries** - Get AI-generated weekly summaries
6. **get_workouts_by_date** - Get workouts for specific date
7. **get_all_exercises** - List all exercises in plan
8. **get_exercise_history** - Get historical data for exercise

---

## Development

### File Structure

```
apps/thor-agent/
├── src/
│   ├── server.ts         # Express server + /chat endpoint
│   ├── agent.ts          # LLM integration with tool calling
│   └── mcp-client.ts     # MCP server stdio communication
├── .env                  # Environment configuration
├── package.json          # Dependencies + scripts
└── tsconfig.json         # TypeScript configuration
```

### Adding New Features

1. **Add tools** → Update MCP server (mcp/thor-mcp/src/index.ts)
2. **Modify agent personality** → Edit system prompt in `src/agent.ts`
3. **Add endpoints** → Extend `src/server.ts`

### Testing

```bash
# Unit tests (if added)
npm run test --workspace=thor-agent

# Manual testing
npm run dev:agent
curl -X POST http://localhost:3002/chat \
  -H "Content-Type: application/json" \
  -d '{"message": "test message"}'
```

---

## Troubleshooting

### Agent won't start

- ✅ Check Thor API is running: `curl http://localhost:3000/health`
- ✅ Check MCP server is built: `ls mcp/thor-mcp/dist/index.js`
- ✅ Check Node version: `node --version` (should be 22+)

### LLM not responding

- ✅ **Ollama**: Check Ollama is running: `curl http://localhost:11434/api/tags`
- ✅ **OpenAI**: Verify API key is set in `.env`
- ✅ Check model supports tool calling (llama3.1:8b does)

### MCP server errors

- ✅ Check agent logs for MCP stderr output
- ✅ Test MCP server directly: `cd mcp/thor-mcp && node test-mcp.js list_tools`
- ✅ Verify Thor API is accessible from MCP server

### Tool calls not working

- ✅ Check MCP server logs: Agent prints tool calls to console
- ✅ Verify tools are listed on startup: "Available tools: log_workout, get_today_exercises..."
- ✅ Test tools directly via MCP Inspector

---

## Future Enhancements

- **Voice Input**: Add speech-to-text for voice commands
- **Streaming Responses**: Stream LLM responses as they're generated
- **Multi-User**: Add authentication and user-specific sessions
- **Persistent Sessions**: Store conversations in database instead of memory
- **Web UI**: Build conversational interface in thor-web
- **Prompt Templates**: Allow customization of agent personality

---

## Related Documentation

- **MCP Server**: See `mcp/thor-mcp/README.md`
- **MCP Testing**: See `mcp/thor-mcp/TESTING.md`
- **Main README**: See root `README.md` for full system overview
- **Development Guide**: See `CLAUDE.md` for codebase documentation
