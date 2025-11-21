# Thor MCP Server Testing Guide

This guide covers multiple ways to test the Thor MCP server locally before integrating with Claude Desktop.

## Prerequisites

1. **Start the Thor API server** (required for all tests):
   ```bash
   cd /home/strick/projects/thor
   npm run dev:api
   ```

2. **Build the MCP server** (if not already built):
   ```bash
   npm run build:mcp
   ```

---

## Option 1: Quick Test Script (Recommended)

Use the built-in test script for quick validation:

```bash
cd mcp/thor-mcp

# List all available tools
node test-mcp.js list_tools

# Get today's exercises
node test-mcp.js get_today

# Log a sample workout
node test-mcp.js log_workout

# Get progress summary
node test-mcp.js get_progress

# Get weekly summaries
node test-mcp.js get_weekly_summaries

# Interactive mode (menu-driven)
node test-mcp.js
```

The test script provides:
- ✅ Formatted JSON-RPC output
- ✅ Clear request/response display
- ✅ Interactive menu for exploring tools
- ✅ Pre-configured test scenarios

---

## Option 2: MCP Inspector (Visual UI)

The official Anthropic MCP Inspector provides a web UI for testing MCP servers.

### Installation

```bash
# Install globally via npx (no installation needed)
npx @modelcontextprotocol/inspector node mcp/thor-mcp/dist/index.js
```

Or install permanently:

```bash
npm install -g @modelcontextprotocol/inspector
mcp-inspector node mcp/thor-mcp/dist/index.js
```

### Usage

1. The inspector opens at `http://localhost:5173` (or similar)
2. You'll see a web UI with:
   - **Tools tab**: Lists all 8 available tools with descriptions
   - **Resources tab**: Any exposed resources (none in Thor MCP)
   - **Test interface**: Click tools to test them with form inputs
3. Fill in parameters and click "Execute" to test each tool
4. View formatted responses in the UI

**Note**: The inspector automatically handles:
- JSON-RPC initialization
- Tool discovery
- Parameter validation
- Response formatting

---

## Option 3: Manual stdio Testing

Test the MCP server directly via stdin/stdout (lowest level):

```bash
cd mcp/thor-mcp

# Initialize + list tools
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/list","params":{},"id":2}' | node dist/index.js

# Call get_today_exercises
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_today_exercises","arguments":{}},"id":2}' | node dist/index.js

# Log a workout
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"log_workout","arguments":{"text":"floor press 4x12 @45"}},"id":2}' | node dist/index.js
```

This method is useful for:
- CI/CD integration
- Debugging low-level protocol issues
- Understanding MCP JSON-RPC protocol

---

## Option 4: Claude Desktop (WSL)

### For Native Linux/WSL Users

Add to `~/.config/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "thor": {
      "command": "bash",
      "args": [
        "/home/strick/projects/thor/mcp/thor-mcp/run.sh"
      ],
      "env": {
        "THOR_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

Then restart Claude Desktop.

### For Windows + WSL Users

There's a known stdio encoding issue when Windows calls WSL. See README.md for workarounds:
1. Copy project to Windows filesystem
2. Use Docker (future)
3. Run Claude Desktop in WSL with GUI support (WSLg)

---

## Option 5: VS Code MCP Extension

**Note**: As of now, there's no official VS Code MCP extension. Use Options 1-3 for local testing, or Option 4 for Claude Desktop integration.

If an extension becomes available, check:
- VS Code Marketplace: Search "Model Context Protocol"
- Anthropic's GitHub: https://github.com/anthropics

---

## Testing All Tools

Here's a quick reference for testing each tool:

### 1. log_workout
```bash
node test-mcp.js log_workout
```
Logs a sample workout to the database.

### 2. get_today_exercises
```bash
node test-mcp.js get_today
```
Returns exercises for today's workout plan.

### 3. get_exercises_for_day
Manual test (day 1 = Monday):
```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_exercises_for_day","arguments":{"day_of_week":1}},"id":2}' | node dist/index.js
```

### 4. get_progress_summary
```bash
node test-mcp.js get_progress
```

### 5. get_weekly_summaries
```bash
node test-mcp.js get_weekly_summaries
```

### 6. get_workouts_by_date
Requires date parameter (manual):
```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_workouts_by_date","arguments":{"date":"2025-11-12"}},"id":2}' | node dist/index.js
```

### 7. get_all_exercises
Returns all exercises in the plan:
```bash
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_all_exercises","arguments":{}},"id":2}' | node dist/index.js
```

### 8. get_exercise_history
Requires exercise UUID (get from get_all_exercises first):
```bash
# First, get an exercise ID
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_all_exercises","arguments":{}},"id":2}' | node dist/index.js

# Then use the ID (example)
echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}
{"jsonrpc":"2.0","method":"tools/call","params":{"name":"get_exercise_history","arguments":{"exercise_id":"7b04c1e4-b9fc-4f56-8b76-52ef491fae18","limit":10}},"id":2}' | node dist/index.js
```

---

## Troubleshooting

### MCP server not responding
- ✅ Check Thor API is running: `curl http://localhost:3000/health`
- ✅ Rebuild MCP server: `npm run build:mcp`
- ✅ Check Node version: `node --version` (should be 22+)

### JSON parsing errors
- ✅ Ensure proper JSON-RPC format (use test-mcp.js script)
- ✅ Check for trailing newlines in manual tests
- ✅ Verify UTF-8 encoding (especially on Windows/WSL)

### Tool returns error
- ✅ Check API server logs for errors
- ✅ Verify API is accessible: `curl http://localhost:3000/api/config`
- ✅ Check required parameters are provided

### Windows/WSL encoding issues
- See README.md "Known Issues" section
- Use native WSL testing (Options 1-3) instead of cross-boundary calls

---

## Next Steps

Once local testing is successful:

1. **Configure Claude Desktop** (Option 4)
2. **Test with natural language**: "Log today's workout: floor press 4x12 @45"
3. **Explore all tools** via conversational interface
4. **Monitor API logs** to verify tool calls are working

For production use, see README.md for deployment options.
