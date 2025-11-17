/**
 * Shared tool configuration for Thor MCP Server
 * Single source of truth for all tool definitions
 */

import { z } from 'zod';
import type { ThorApiClient } from './api-client.js';

/**
 * Helper to filter invalid dates that LLMs sometimes pass
 */
function sanitizeDate(date?: string): string | undefined {
  if (!date) return undefined;
  const invalidDates = ['', 'today', 'now', 'current'];
  const dateStr = date.trim().toLowerCase();
  return dateStr && !invalidDates.includes(dateStr) ? date : undefined;
}

/**
 * Tool definition interface
 */
export interface ToolDefinition {
  name: string;
  title: string;
  description: string;
  zodSchema: Record<string, z.ZodTypeAny>; // Zod schema fields for MCP SDK
  jsonSchema: {
    type: 'object';
    properties: Record<string, any>;
    required?: string[];
  };
  handler: (apiClient: ThorApiClient, args: any) => Promise<any>;
}

/**
 * All tool definitions - single source of truth
 */
export const TOOL_DEFINITIONS: ToolDefinition[] = [
  {
    name: 'log_workout',
    title: 'Log Workout',
    description: 'Log a workout using natural language. Parse exercises, sets, reps, and weights from text.',
    zodSchema: {
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
    jsonSchema: {
      type: 'object',
      properties: {
        text: { type: 'string' },
        date: { type: 'string' }
      },
      required: ['text']
    },
    handler: async (apiClient, args) => {
      const date = sanitizeDate(args.date);
      return await apiClient.logWorkout(args.text, date);
    }
  },

  {
    name: 'get_today_exercises',
    title: "Get Today's Exercises",
    description: "Get the list of exercises scheduled for today based on the workout plan",
    zodSchema: {},
    jsonSchema: {
      type: 'object',
      properties: {}
    },
    handler: async (apiClient) => {
      const today = new Date().getDay() || 7; // Sunday=7
      return await apiClient.getDayExercises(today);
    }
  },

  {
    name: 'get_exercises_for_day',
    title: 'Get Exercises for Day',
    description: 'Get exercises for a specific day of the week (1=Monday, 7=Sunday)',
    zodSchema: {
      day_of_week: z
        .number()
        .int()
        .min(1)
        .max(7)
        .describe("Day of week (1-7, where 1=Monday, 7=Sunday)"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        day_of_week: { type: 'number' }
      },
      required: ['day_of_week']
    },
    handler: async (apiClient, args) => {
      return await apiClient.getDayExercises(args.day_of_week);
    }
  },

  {
    name: 'get_progress_summary',
    title: 'Get Progress Summary',
    description: 'Get workout progress summary for a date range, including sessions count and top lifts',
    zodSchema: {
      from: z.string().describe("Start date in YYYY-MM-DD format"),
      to: z.string().describe("End date in YYYY-MM-DD format"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        from: { type: 'string' },
        to: { type: 'string' }
      },
      required: ['from', 'to']
    },
    handler: async (apiClient, args) => {
      return await apiClient.getProgressSummary(args.from, args.to);
    }
  },

  {
    name: 'get_weekly_summaries',
    title: 'Get Weekly Summaries',
    description: 'Get AI-generated weekly workout summaries with metrics and insights',
    zodSchema: {
      limit: z
        .number()
        .int()
        .min(1)
        .max(100)
        .optional()
        .describe("Number of summaries to retrieve (default: 10)"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        limit: { type: 'number' }
      }
    },
    handler: async (apiClient, args) => {
      return await apiClient.getWeeklySummaries(args.limit || 10);
    }
  },

  {
    name: 'get_workouts_by_date',
    title: 'Get Workouts by Date',
    description: 'Get all workouts logged on a specific date',
    zodSchema: {
      date: z.string().describe("Date in YYYY-MM-DD format"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' }
      },
      required: ['date']
    },
    handler: async (apiClient, args) => {
      return await apiClient.getWorkoutsByDate(args.date);
    }
  },

  {
    name: 'get_all_exercises',
    title: 'Get All Exercises',
    description: 'Get list of all exercises in the workout plan',
    zodSchema: {
      day_of_week: z
        .number()
        .int()
        .min(1)
        .max(7)
        .optional()
        .describe("Optional: filter by day of week (1-7)"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        day_of_week: { type: 'number' }
      }
    },
    handler: async (apiClient, args) => {
      return await apiClient.getExercises(args.day_of_week);
    }
  },

  {
    name: 'get_exercise_history',
    title: 'Get Exercise History',
    description: 'Get historical performance data for a specific exercise',
    zodSchema: {
      exercise_id: z.string().uuid().describe("Exercise ID (UUID)"),
      limit: z
        .number()
        .int()
        .min(1)
        .max(200)
        .optional()
        .describe("Number of sessions to retrieve (default: 50)"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        exercise_id: { type: 'string' },
        limit: { type: 'number' }
      },
      required: ['exercise_id']
    },
    handler: async (apiClient, args) => {
      return await apiClient.getExerciseHistory(args.exercise_id, args.limit || 50);
    }
  },
];
