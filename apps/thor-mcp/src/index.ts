#!/usr/bin/env node

/**
 * Thor MCP Server - HTTP Transport (StreamableHTTP)
 * Exposes workout logging tools via proper MCP protocol over HTTP for Docker
 */

import express from 'express';
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from 'zod';
import { ThorApiClient } from './api-client.js';

const PORT = process.env.MCP_PORT ? parseInt(process.env.MCP_PORT) : 3003;
const app = express();

// Middleware
app.use(express.json());

// Initialize API client
const apiClient = new ThorApiClient();

// Initialize MCP server with proper SDK
const server = new McpServer(
  {
    name: "thor-mcp",
    version: "1.0.0",
  },
  {
    capabilities: {
      tools: {},
    },
  }
);

/**
 * Helper to create successful tool response
 */
function createToolResponse(data: any) {
  return {
    content: [
      {
        type: "text" as const,
        text: JSON.stringify(data, null, 2),
      },
    ],
  };
}

/**
 * Helper to create error response
 */
function createErrorResponse(error: unknown) {
  const errorMessage = error instanceof Error ? error.message : String(error);
  return {
    content: [
      {
        type: "text" as const,
        text: `Error: ${errorMessage}`,
      },
    ],
    isError: true,
  };
}

/**
 * Register tools using proper MCP SDK server.registerTool()
 */

// log_workout tool
server.registerTool(
  "log_workout",
  {
    title: "Log Workout",
    description:
      "Log a workout using natural language. Parse exercises, sets, reps, and weights from text.",
    inputSchema: {
      text: z
        .string()
        .min(1)
        .describe(
          "Natural language workout description (e.g., 'floor press 4x12 @45, dumbbell row 3x8 @35')"
        ),
      date: z
        .string()
        .optional()
        .describe(`Optional date in YYYY-MM-DD format (defaults to today: ${new Date().toISOString().split('T')[0]})`),
    },
  },
  async (args: { text: string; date?: string }) => {
    try {
      // Filter out invalid dates (LLM sometimes passes '', 'today', 'Today', 'now', etc.)
      const invalidDates = ['', 'today', 'now', 'current'];
      const dateStr = args.date?.trim().toLowerCase() || '';
      const date = dateStr && !invalidDates.includes(dateStr) ? args.date : undefined;
      const result = await apiClient.logWorkout(args.text, date);
      return createToolResponse(result);
    } catch (err) {
      return createErrorResponse(err);
    }
  }
);

// get_today_exercises tool
server.registerTool(
  "get_today_exercises",
  {
    title: "Get Today's Exercises",
    description:
      "Get the list of exercises scheduled for today based on the workout plan",
    inputSchema: {},
  },
  async () => {
    try {
      const today = new Date().getDay() || 7; // Sunday=7
      const result = await apiClient.getDayExercises(today);
      return createToolResponse(result);
    } catch (err) {
      return createErrorResponse(err);
    }
  }
);

// get_exercises_for_day tool
server.registerTool(
  "get_exercises_for_day",
  {
    title: "Get Exercises for Day",
    description:
      "Get exercises for a specific day of the week (1=Monday, 7=Sunday)",
    inputSchema: {
      day_of_week: z
        .number()
        .int()
        .min(1)
        .max(7)
        .describe("Day of week (1-7, where 1=Monday, 7=Sunday)"),
    },
  },
  async (args: { day_of_week: number }) => {
    try {
      const result = await apiClient.getDayExercises(args.day_of_week);
      return createToolResponse(result);
    } catch (err) {
      return createErrorResponse(err);
    }
  }
);

// get_progress_summary tool
server.registerTool(
  "get_progress_summary",
  {
    title: "Get Progress Summary",
    description:
      "Get workout progress summary for a date range, including sessions count and top lifts",
    inputSchema: {
      from: z.string().describe("Start date in YYYY-MM-DD format"),
      to: z.string().describe("End date in YYYY-MM-DD format"),
    },
  },
  async (args: { from: string; to: string }) => {
    try {
      const result = await apiClient.getProgressSummary(args.from, args.to);
      return createToolResponse(result);
    } catch (err) {
      return createErrorResponse(err);
    }
  }
);

// get_weekly_summaries tool
server.registerTool(
  "get_weekly_summaries",
  {
    title: "Get Weekly Summaries",
    description:
      "Get AI-generated weekly workout summaries with metrics and insights",
    inputSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of summaries to retrieve (default: 10)"),
    },
  },
  async (args: { limit?: number }) => {
    try {
      const result = await apiClient.getWeeklySummaries(args.limit || 10);
      return createToolResponse(result);
    } catch (err) {
      return createErrorResponse(err);
    }
  }
);

// get_workouts_by_date tool
server.registerTool(
  "get_workouts_by_date",
  {
    title: "Get Workouts by Date",
    description: "Get all workouts logged on a specific date",
    inputSchema: {
      date: z.string().describe("Date in YYYY-MM-DD format"),
    },
  },
  async (args: { date: string }) => {
    try {
      const result = await apiClient.getWorkoutsByDate(args.date);
      return createToolResponse(result);
    } catch (err) {
      return createErrorResponse(err);
    }
  }
);

// get_all_exercises tool
server.registerTool(
  "get_all_exercises",
  {
    title: "Get All Exercises",
    description: "Get list of all exercises in the workout plan",
    inputSchema: {
      day_of_week: z
        .number()
        .int()
        .min(1)
        .max(7)
        .optional()
        .describe("Optional: filter by day of week (1-7)"),
    },
  },
  async (args: { day_of_week?: number }) => {
    try {
      const result = await apiClient.getExercises(args.day_of_week);
      return createToolResponse(result);
    } catch (err) {
      return createErrorResponse(err);
    }
  }
);

// get_exercise_history tool
server.registerTool(
  "get_exercise_history",
  {
    title: "Get Exercise History",
    description: "Get historical performance data for a specific exercise",
    inputSchema: {
      exercise_id: z.string().uuid().describe("Exercise ID (UUID)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Number of sessions to retrieve (default: 50)"),
    },
  },
  async (args: { exercise_id: string; limit?: number }) => {
    try {
      const result = await apiClient.getExerciseHistory(
        args.exercise_id,
        args.limit || 50
      );
      return createToolResponse(result);
    } catch (err) {
      return createErrorResponse(err);
    }
  }
);

/**
 * Health check endpoint
 */
app.get('/health', (_req, res) => {
  res.status(200).send('OK');
});

/**
 * GET /tools - List all available tools (for HTTP client compatibility)
 */
app.get('/tools', (_req, res) => {
  const tools = [
    { name: 'log_workout', description: 'Log a workout using natural language', inputSchema: { type: 'object', properties: { text: { type: 'string' }, date: { type: 'string' } }, required: ['text'] } },
    { name: 'get_today_exercises', description: 'Get exercises scheduled for today', inputSchema: { type: 'object', properties: {} } },
    { name: 'get_exercises_for_day', description: 'Get exercises for a specific day', inputSchema: { type: 'object', properties: { day_of_week: { type: 'number' } }, required: ['day_of_week'] } },
    { name: 'get_progress_summary', description: 'Get workout progress summary', inputSchema: { type: 'object', properties: { from: { type: 'string' }, to: { type: 'string' } }, required: ['from', 'to'] } },
    { name: 'get_weekly_summaries', description: 'Get AI-generated weekly summaries', inputSchema: { type: 'object', properties: { limit: { type: 'number' } } } },
    { name: 'get_workouts_by_date', description: 'Get workouts for a specific date', inputSchema: { type: 'object', properties: { date: { type: 'string' } }, required: ['date'] } },
    { name: 'get_all_exercises', description: 'Get all exercises', inputSchema: { type: 'object', properties: { day_of_week: { type: 'number' } } } },
    { name: 'get_exercise_history', description: 'Get exercise history', inputSchema: { type: 'object', properties: { exercise_id: { type: 'string' }, limit: { type: 'number' } }, required: ['exercise_id'] } }
  ];
  res.json({ tools });
});

/**
 * POST /tools/:toolName - Execute a tool (for HTTP client compatibility)
 */
app.post('/tools/:toolName', async (req, res) => {
  const { toolName } = req.params;
  const args = req.body;

  try {
    let result;

    switch (toolName) {
      case 'log_workout':
        result = await apiClient.logWorkout(args.text, args.date);
        break;
      case 'get_today_exercises': {
        const today = new Date().getDay() || 7;
        result = await apiClient.getDayExercises(today);
        break;
      }
      case 'get_exercises_for_day':
        result = await apiClient.getDayExercises(args.day_of_week);
        break;
      case 'get_progress_summary':
        result = await apiClient.getProgressSummary(args.from, args.to);
        break;
      case 'get_weekly_summaries':
        result = await apiClient.getWeeklySummaries(args.limit || 10);
        break;
      case 'get_workouts_by_date':
        result = await apiClient.getWorkoutsByDate(args.date);
        break;
      case 'get_all_exercises':
        result = await apiClient.getExercises(args.day_of_week);
        break;
      case 'get_exercise_history':
        result = await apiClient.getExerciseHistory(args.exercise_id, args.limit || 50);
        break;
      default:
        return res.status(404).json({ error: 'Tool not found' });
    }

    res.json({ result });
  } catch (error) {
    console.error(`Error executing tool ${toolName}:`, error);
    res.status(500).json({ error: error instanceof Error ? error.message : 'Internal error' });
  }
});

/**
 * MCP endpoint - handles MCP protocol over HTTP using StreamableHTTP transport
 * This is the proper way to expose MCP server over HTTP
 */
app.post('/mcp', async (req, res) => {
  try {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true,
    });

    res.on('close', () => {
      transport.close();
    });

    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

/**
 * Start the server
 */
async function main() {
  // Test API connection silently
  try {
    await apiClient.health();
    console.log('✅ Thor API connection verified');
  } catch (error) {
    console.warn('⚠️  Warning: Thor API not available yet. Tool calls will fail until API is running.');
  }

  app.listen(PORT, () => {
    console.log(`\n🔧 Thor MCP Server (HTTP) running at: http://localhost:${PORT}`);
    console.log(`📍 MCP endpoint: POST http://localhost:${PORT}/mcp`);
    console.log(`📍 Health check: GET http://localhost:${PORT}/health`);
    console.log(`\n💡 Transport: StreamableHTTP (proper MCP over HTTP)`);
    console.log(`💡 Uses server.registerTool() with title, description, inputSchema`);
    console.log(`💡 Available tools: 8`);
    console.log('');
  });
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
