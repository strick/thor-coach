# Thor MCP Server

Model Context Protocol (MCP) server for Thor workout logger. Exposes workout logging tools to AI agents.

## Overview

This MCP server provides AI agents with the ability to:
- Log workouts using natural language
- Query exercise plans
- Get workout progress summaries
- Access weekly AI-generated workout reports
- View exercise history

## Installation

From the monorepo root:

```bash
npm install
npm run build --workspace=thor-mcp
```

## Configuration

### Environment Variables

- `THOR_API_URL` - Thor API base URL (default: `http://localhost:3000`)

### Claude Desktop Configuration

Add this to your Claude Desktop config file:

**macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows**: `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "thor": {
      "command": "node",
      "args": ["/absolute/path/to/thor-stack/mcp/thor-mcp/dist/index.js"],
      "env": {
        "THOR_API_URL": "http://localhost:3000"
      }
    }
  }
}
```

## Available Tools

### log_workout
Log a workout using natural language.

**Parameters:**
- `text` (string, required): Natural language workout description
- `date` (string, optional): Date in YYYY-MM-DD format (defaults to today)

**Example:**
```
floor press 4x12 @45, dumbbell row 3x8 @35
```

### get_today_exercises
Get the list of exercises scheduled for today.

### get_exercises_for_day
Get exercises for a specific day of the week.

**Parameters:**
- `day_of_week` (number, required): 1=Monday, 7=Sunday

### get_progress_summary
Get workout progress summary for a date range.

**Parameters:**
- `from` (string, required): Start date (YYYY-MM-DD)
- `to` (string, required): End date (YYYY-MM-DD)

### get_weekly_summaries
Get AI-generated weekly workout summaries.

**Parameters:**
- `limit` (number, optional): Number of summaries to retrieve (default: 10)

### get_workouts_by_date
Get all workouts logged on a specific date.

**Parameters:**
- `date` (string, required): Date in YYYY-MM-DD format

### get_all_exercises
Get list of all exercises in the workout plan.

**Parameters:**
- `day_of_week` (number, optional): Filter by day of week

### get_exercise_history
Get historical performance data for a specific exercise.

**Parameters:**
- `exercise_id` (string, required): Exercise UUID
- `limit` (number, optional): Number of sessions (default: 50)

## Usage

Once configured in Claude Desktop, you can interact with the Thor system naturally:

```
"Log today's workout: floor press 4x12 @45, skullcrusher 3x10 @20"

"Show me my progress for the last 30 days"

"What exercises should I do today?"

"Get my weekly workout summary"
```

## Development

Run in watch mode:

```bash
npm run dev --workspace=thor-mcp
```

## Prerequisites

- Thor API must be running at http://localhost:3000
- Node.js 22+

## Known Issues

### Windows/WSL Stdio Encoding Issue

When running the MCP server from Claude Desktop on Windows calling into WSL, you may encounter JSON parsing errors with null bytes (`\x00`). This is a known Windows/WSL interop issue with stdio encoding.

**Workarounds:**

1. **Run Claude Desktop in WSL** (Recommended if using WSL2 with GUI support)
   - Use WSLg or run Claude Desktop natively in a Linux environment

2. **Use Docker** (Future enhancement)
   - We plan to add a Docker container for the MCP server

3. **Copy to Windows**
   - Copy the entire project to a Windows path (e.g., `C:\projects\thor\`)
   - Run the API and MCP server natively on Windows
   - Update paths in config to use Windows paths

4. **Test Directly**
   - The MCP server works correctly when tested directly in WSL:
   ```bash
   echo '{"jsonrpc":"2.0","method":"initialize","params":{"protocolVersion":"2024-11-05","capabilities":{},"clientInfo":{"name":"test","version":"1.0.0"}},"id":1}' | node dist/index.js
   ```

We're tracking this issue and welcome contributions for a robust solution.
