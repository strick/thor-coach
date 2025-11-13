#!/usr/bin/env node

/**
 * Thor MCP Server
 * Exposes workout logging tools to AI agents via Model Context Protocol
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { ThorApiClient } from "./api-client.js";

// Initialize API client
const apiClient = new ThorApiClient();

// Initialize MCP server
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
 * Register tools
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
      const result = await apiClient.logWorkout(args.text, args.date);
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
 * Start the server
 */
async function main() {
  // Test API connection silently
  try {
    await apiClient.health();
  } catch (error) {
    // API not available - will handle errors in tool calls
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  process.exit(1);
});
