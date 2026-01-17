/**
 * Nutrition tracking tools
 */

import { z } from 'zod';
import type { ToolDefinition } from './types.js';

export const NUTRITION_TOOLS: ToolDefinition[] = [
  {
    name: 'log_food',
    title: 'Log Food',
    description: 'Log food intake from natural language description. Use this when the user wants to log what they ate (e.g., "I had chicken breast and rice", "Log: 6oz salmon with vegetables"). The AI will parse the food description and extract nutritional information.',
    zodSchema: {
      text: z.string().describe("Natural language food description (e.g., 'chicken breast 6oz, brown rice 1 cup, broccoli 2 cups')"),
      date: z.string().optional().describe("Optional date in YYYY-MM-DD format (defaults to today)"),
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
      return await apiClient.logFood(args.text, args.date);
    }
  },

  {
    name: 'get_nutrition_today',
    title: 'Get Daily Nutrition',
    description: 'Get nutrition summary for a specific day. Use this when the user asks about their nutrition for today or a specific date (e.g., "How much protein did I have today?", "What are my nutrition totals for yesterday?", "Am I over sodium today?").',
    zodSchema: {
      date: z.string().optional().describe("Optional date in YYYY-MM-DD format (defaults to today)"),
    },
    jsonSchema: {
      type: 'object',
      properties: {
        date: { type: 'string' }
      }
    },
    handler: async (apiClient, args) => {
      return await apiClient.getDailyNutrition(args.date);
    }
  },

  {
    name: 'get_nutrition_summary',
    title: 'Get Nutrition Summary Range',
    description: 'Get nutrition summary for a date range. Use this when the user asks about nutrition over multiple days or a specific period (e.g., "Show my nutrition for this week", "What were my protein totals last week?", "Nutrition summary for the past 7 days").',
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
      return await apiClient.getNutritionSummary(args.from, args.to);
    }
  },
];
